// Generates synthetic, internally consistent records for development and performance testing.
// Usage: npm run db:seed:volume -- --customers 40 --subscriptions 120
//        npm run db:seed:volume -- --customers 3000 --subscriptions 10000
import 'dotenv/config';
import bcrypt from 'bcrypt';
import pg from 'pg';

const arg = (name: string, fallback: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
};
const customers = arg('customers', 40);
const subscriptions = arg('subscriptions', 120);

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

async function main() {
  await client.connect();
  const hash = await bcrypt.hash(`Unusable!${Math.random()}Aa`, 10);
  await client.query('BEGIN');
  const run = Date.now().toString(36);

  await client.query(
    `WITH new_users AS (
       INSERT INTO users (role_id, full_name, email, phone, password_hash)
       SELECT (SELECT id FROM roles WHERE code = 'customer'), 'Customer ' || g, 'load' || $1 || '-' || g || '@example.test',
              '+91 90000 ' || lpad(g::text, 5, '0'), $2
       FROM generate_series(1, $3::int) g
       RETURNING id, full_name)
     INSERT INTO customers (user_id, customer_name, company_name, billing_address, created_at)
     SELECT id, full_name, 'Company ' || (random() * 100000)::int, 'Synthetic address, India', now() - (random() * 700) * interval '1 day'
     FROM new_users`,
    [run, hash, customers],
  );

  // Subscriptions: a monthly plan started up to 18 months ago, in a realistic mix of statuses.
  await client.query(
    `CREATE TEMP TABLE new_subs ON COMMIT DROP AS
     WITH pool AS (
       SELECT c.id, row_number() OVER () AS rn FROM customers c
       JOIN users u ON u.id = c.user_id WHERE u.email LIKE 'load' || $1 || '-%'),
     plan AS (SELECT id, price FROM subscription_plans WHERE name = 'Growth Monthly'),
     base AS (
       SELECT g, (SELECT id FROM pool WHERE rn = (g % $2::int) + 1) AS customer_id,
              (CURRENT_DATE - (random() * 540)::int) AS start_date, random() AS r, (1 + (random() * 9)::int) AS quantity
       FROM generate_series(1, $3::int) g)
     SELECT gen_random_uuid() AS id, 'LOAD-' || $1 || '-' || g AS number, customer_id, plan.id AS plan_id, plan.price, start_date, quantity,
            CASE WHEN r < 0.70 THEN 'active' WHEN r < 0.80 THEN 'paused' WHEN r < 0.90 THEN 'closed' ELSE 'confirmed' END AS status
     FROM base, plan`,
    [run, customers, subscriptions],
  );

  await client.query(
    `INSERT INTO subscriptions (id, subscription_number, customer_id, plan_id, billing_frequency, start_date, expiry_date, billing_anchor_date,
       billed_cycles, next_billing_date, subtotal, tax_total, total, status, activated_at, closed_at)
     SELECT id, number, customer_id, plan_id, 'monthly', start_date, start_date + interval '24 months', start_date,
       cycles, start_date + cycles * interval '1 month',
       price * quantity, round(price * quantity * 0.18, 2), round(price * quantity * 1.18, 2), status,
       CASE WHEN status <> 'confirmed' THEN start_date::timestamptz END,
       CASE WHEN status = 'closed' THEN now() END
     FROM (SELECT *, CASE WHEN status = 'confirmed' THEN 0
             ELSE (EXTRACT(year FROM age(CURRENT_DATE, start_date)) * 12 + EXTRACT(month FROM age(CURRENT_DATE, start_date)))::int + 1 END AS cycles
           FROM new_subs) s`,
  );

  await client.query(
    `INSERT INTO subscription_items (subscription_id, item_type, plan_id, description, quantity, unit_price, line_subtotal, tax_amount, tax_details, line_total)
     SELECT s.id, 'plan', s.plan_id, 'Growth Monthly (monthly)', s.quantity, s.price, s.price * s.quantity, round(s.price * s.quantity * 0.18, 2),
            '[]'::jsonb, round(s.price * s.quantity * 1.18, 2) FROM new_subs s`,
  );

  // One invoice per elapsed cycle, numbered from the live sequence so real documents never collide with synthetic ones.
  const { rows } = await client.query(
    `WITH cycles AS (
       SELECT s.id AS subscription_id, s.customer_id, s.price, s.quantity,
              (s.start_date + c * interval '1 month')::date AS period_start, row_number() OVER () AS rn
       FROM new_subs s
       CROSS JOIN LATERAL generate_series(0, GREATEST(0, (EXTRACT(year FROM age(CURRENT_DATE, s.start_date)) * 12 + EXTRACT(month FROM age(CURRENT_DATE, s.start_date)))::int)) c
       WHERE s.status <> 'confirmed'),
     seq AS (SELECT next_value, prefix, padding FROM number_sequences WHERE code = 'invoice')
     INSERT INTO invoices (invoice_number, customer_id, subscription_id, invoice_date, due_date, period_start, period_end, subtotal, tax_total, total,
                           amount_paid, status, confirmed_at, paid_at)
     SELECT seq.prefix || lpad((seq.next_value + c.rn - 1)::text, seq.padding, '0'), c.customer_id, c.subscription_id, c.period_start, c.period_start + 15,
            c.period_start, (c.period_start + interval '1 month' - interval '1 day')::date,
            c.price * c.quantity, round(c.price * c.quantity * 0.18, 2), round(c.price * c.quantity * 1.18, 2),
            CASE WHEN settled THEN round(c.price * c.quantity * 1.18, 2) WHEN partial THEN round(c.price * c.quantity * 0.5, 2) ELSE 0 END,
            CASE WHEN settled THEN 'paid' ELSE 'confirmed' END, c.period_start::timestamptz,
            CASE WHEN settled THEN (c.period_start + 7)::timestamptz END
     FROM cycles c CROSS JOIN seq
     CROSS JOIN LATERAL (SELECT c.period_start < CURRENT_DATE - 20 AND random() < 0.9 AS settled, random() < 0.3 AS partial) f
     RETURNING id`,
  );
  await client.query(`UPDATE number_sequences SET next_value = next_value + $1 WHERE code = 'invoice'`, [rows.length]);

  const payments = await client.query(
    `WITH paid AS (
       SELECT i.id, i.customer_id, i.amount_paid, i.invoice_date, row_number() OVER () AS rn
       FROM invoices i JOIN new_subs s ON s.id = i.subscription_id WHERE i.amount_paid > 0),
     seq AS (SELECT next_value, prefix, padding FROM number_sequences WHERE code = 'payment')
     INSERT INTO payments (payment_reference, customer_id, invoice_id, method, amount, payment_date)
     SELECT seq.prefix || lpad((seq.next_value + p.rn - 1)::text, seq.padding, '0'), p.customer_id, p.id,
            (ARRAY['bank_transfer','card','cash','other'])[1 + (p.rn % 4)], p.amount_paid, LEAST(p.invoice_date + 7, CURRENT_DATE)
     FROM paid p CROSS JOIN seq RETURNING id`,
  );
  await client.query(`UPDATE number_sequences SET next_value = next_value + $1 WHERE code = 'payment'`, [payments.rowCount]);

  await client.query('COMMIT');
  await client.query('ANALYZE');
  console.log(`Seeded ${customers} customers, ${subscriptions} subscriptions, ${rows.length} invoices, ${payments.rowCount} payments`);
  await client.end();
}

main().catch(async (err) => {
  console.error(err);
  await client.query('ROLLBACK').catch(() => undefined);
  process.exit(1);
});
