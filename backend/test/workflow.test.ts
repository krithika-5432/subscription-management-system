// End-to-end API tests against a running server and a seeded database. Run with: npm test
// API_URL defaults to the local dev server. The tests create their own customers, so they can run repeatedly.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, test } from 'node:test';
import 'dotenv/config';
import pg from 'pg';
import { addCycles, addDays } from '../src/utils/dates.js';

// Time-driven rules are tested by moving dates in the database, the only part of this suite that bypasses the API.
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
pg.types.setTypeParser(1082, (value) => value);
const sql = async (text: string, params: unknown[] = []) => (await db.query(text, params)).rows;
after(() => db.end());

const API = process.env.API_URL ?? 'http://localhost:5000/api';
const run = Date.now().toString(36);
const today = new Date().toLocaleDateString('en-CA');
const PASSWORD = 'Testing@1234';
const daysFromToday = (days: number) => addDays(today, days);
const addDaysTo = addDays;
const monthsFromToday = (months: number) => {
  if (months >= 0) return addCycles(today, 'monthly', months);
  const [y, m, d] = today.split('-').map(Number);
  const index = y * 12 + (m - 1) + months;
  const last = new Date(Date.UTC(Math.floor(index / 12), (index % 12) + 1, 0)).getUTCDate();
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
};

interface Result {
  status: number;
  body: any;
}

async function call(method: string, path: string, token?: string, body?: unknown): Promise<Result> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: any = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* PDF or CSV */
  }
  return { status: res.status, body: parsed };
}

const must = async (promise: Promise<Result>, status = 200) => {
  const r = await promise;
  assert.equal(r.status, status, JSON.stringify(r.body));
  return r.body.data;
};

const login = async (email: string, password: string) => (await must(call('POST', '/auth/login', undefined, { email, password }))).token as string;

let admin: string, sales: string, ops: string, finance: string, customerA: string, customerB: string;
let customerAId: string, customerBId: string;
let plan: any, addon: any, percentDiscount: any;

const registerCustomer = async (label: string) => {
  const email = `${label}-${run}@example.test`;
  const reg = await must(call('POST', '/auth/register', undefined, { customerName: `Test ${label}`, companyName: 'Test Co', email, phone: '+91 90000 11111', password: PASSWORD }), 201);
  return { token: reg.token as string, customerId: reg.user.customerId as string };
};

const quote = (customerId: string, extra: object = {}) => ({
  customerId,
  expiryDate: '2099-01-01',
  terms: 'Test terms',
  lines: [{ itemType: 'plan', planId: plan.id, quantity: 2 }],
  ...extra,
});

/** Runs the full path to an active subscription and returns its first draft invoice. */
async function activeSubscription(customerToken: string, customerId: string, extra: object = {}) {
  const { id: quotationId } = await must(call('POST', '/quotations', sales, quote(customerId, extra)), 201);
  await must(call('POST', `/quotations/${quotationId}/send`, sales));
  await must(call('POST', `/portal/quotations/${quotationId}/accept`, customerToken));
  const { subscriptionId } = await must(call('POST', `/quotations/${quotationId}/convert`, sales, {}), 201);
  await must(call('POST', `/subscriptions/${subscriptionId}/transition`, ops, { action: 'activate' }));
  const invoices = await must(call('GET', `/invoices?subscriptionId=${subscriptionId}`, ops));
  return { quotationId, subscriptionId, invoice: invoices[0] };
}

before(async () => {
  [admin, sales, ops, finance] = await Promise.all([
    login('admin@brightloop.in', 'Admin@1234'),
    login('sales@brightloop.in', 'Sales@1234'),
    login('ops@brightloop.in', 'Ops@12345'),
    login('finance@brightloop.in', 'Finance@1234'),
  ]);
  ({ token: customerA, customerId: customerAId } = await registerCustomer('a'));
  ({ token: customerB, customerId: customerBId } = await registerCustomer('b'));
  plan = await must(call('POST', '/plans', admin, { name: `Test Plan ${run}`, price: 1000, billingFrequency: 'monthly', minQuantity: 2, termCycles: 12, renewalMode: 'manual' }), 201);
  addon = await must(call('POST', '/products', admin, { name: `Test Addon ${run}`, productType: 'support', salesPrice: 500, isAddon: true }), 201);
  percentDiscount = await must(call('POST', '/discounts', admin, { name: `Test 10 ${run}`, discountType: 'percentage', value: 10, startDate: '2020-01-01', endDate: '2099-01-01', usageLimit: 1 }), 201);
});

test('passwords must meet the policy, emails must be unique', async () => {
  const body = { customerName: 'X', email: `weak-${run}@example.test`, phone: '+91 90000 22222', password: 'alllowercase' };
  assert.equal((await call('POST', '/auth/register', undefined, body)).status, 400);
  assert.equal((await call('POST', '/auth/register', undefined, { ...body, password: 'Short@1' })).status, 400);
  assert.equal((await call('POST', '/auth/register', undefined, { ...body, email: 'admin@brightloop.in', password: PASSWORD })).status, 409);
  assert.equal((await call('POST', '/auth/login', undefined, { email: 'admin@brightloop.in', password: 'Wrong@12345' })).status, 401);
});

test('logout revokes the token', async () => {
  const token = await login('sales@brightloop.in', 'Sales@1234');
  // Logout bumps the shared token version, so sign the suite's sales token back in afterwards.
  assert.equal((await call('POST', '/auth/logout', token)).status, 200);
  assert.equal((await call('GET', '/auth/me', token)).status, 401);
  sales = await login('sales@brightloop.in', 'Sales@1234');
});

test('forgot-password never reveals whether an account exists', async () => {
  const known = await call('POST', '/auth/forgot-password', undefined, { email: 'finance@brightloop.in' });
  const unknown = await call('POST', '/auth/forgot-password', undefined, { email: `nobody-${run}@example.test` });
  assert.equal(known.status, 200);
  assert.deepEqual(known.body, unknown.body);
  assert.equal((await call('POST', '/auth/reset-password', undefined, { token: 'x'.repeat(64), password: PASSWORD })).status, 400);
});

test('role and permission boundaries on the API', async () => {
  const expectations: [string, string, string, number][] = [
    ['GET', '/customers', customerA, 403],
    ['GET', '/dashboard/admin', customerA, 403],
    ['GET', '/invoices', customerA, 403],
    ['GET', '/reports/revenue', customerA, 403],
    ['GET', '/customers', '', 401],
    ['GET', '/staff', sales, 403],
    ['GET', '/settings', sales, 403],
    ['GET', '/taxes', sales, 403],
    ['GET', '/invoices', sales, 403],
    ['GET', '/payments', sales, 403],
    ['GET', '/reports/revenue', sales, 403],
    ['GET', '/dashboard/finance', sales, 403],
    ['GET', '/dashboard/sales', sales, 200],
    ['GET', '/quotations', ops, 403],
    ['GET', '/reports/revenue', ops, 403],
    ['GET', '/dashboard/operations', ops, 200],
    ['GET', '/subscriptions', ops, 200],
    ['GET', '/quotations', finance, 403],
    ['GET', '/staff', finance, 403],
    ['GET', '/reports/revenue', finance, 200],
    ['GET', '/dashboard/finance', finance, 200],
    ['GET', '/dashboard/admin', finance, 403],
    ['GET', '/portal/dashboard', admin, 403],
    ['GET', '/portal/dashboard', sales, 403],
    ['GET', '/staff', admin, 200],
  ];
  for (const [method, path, token, status] of expectations) {
    assert.equal((await call(method, path, token || undefined)).status, status, `${method} ${path}`);
  }
  // Writes that must be Admin-only.
  assert.equal((await call('POST', '/discounts', sales, {})).status, 403);
  assert.equal((await call('POST', '/taxes', ops, {})).status, 403);
  assert.equal((await call('POST', '/staff', finance, {})).status, 403);
  assert.equal((await call('POST', '/payments', finance, {})).status, 403);
  assert.equal((await call('POST', '/products', sales, {})).status, 403);
});

test('input validation rejects bad values', async () => {
  assert.equal((await call('POST', '/products', admin, { name: 'Bad', productType: 'software', salesPrice: -1 })).status, 400);
  assert.equal((await call('POST', '/plans', admin, { name: 'Bad', price: 1, billingFrequency: 'hourly' })).status, 400);
  assert.equal((await call('POST', '/discounts', admin, { name: 'Bad', discountType: 'percentage', value: 150, startDate: '2026-01-01', endDate: '2027-01-01' })).status, 400);
  assert.equal((await call('POST', '/discounts', admin, { name: 'Bad', discountType: 'fixed', value: 5, startDate: '2027-01-01', endDate: '2026-01-01' })).status, 400);
  assert.equal((await call('POST', '/quotations', sales, quote(customerAId, { lines: [{ itemType: 'plan', planId: plan.id, quantity: 1 }] }))).status, 400, 'below plan minimum');
  assert.equal((await call('POST', '/quotations', sales, quote(customerAId, { lines: [{ itemType: 'plan', planId: plan.id, quantity: -2 }] }))).status, 400);
  assert.equal((await call('POST', '/quotations', sales, quote(customerAId, { expiryDate: '2001-01-01' }))).status, 400);
  assert.equal((await call('GET', '/customers/not-a-uuid', admin)).status, 400);
  const sqlish = await call('GET', `/customers?search=${encodeURIComponent("' OR 1=1; DROP TABLE users; --")}&sortBy=${encodeURIComponent('email; DROP TABLE users')}`, admin);
  assert.equal(sqlish.status, 200);
  assert.equal(sqlish.body.data.length, 0);
});

test('quotation to payment, with correct totals at every step', async () => {
  const { quotationId, subscriptionId, invoice } = await activeSubscription(customerA, customerAId);

  const quotation = await must(call('GET', `/quotations/${quotationId}`, sales));
  assert.equal(quotation.status, 'accepted');
  assert.equal(quotation.subtotal, '2000.00');
  assert.equal(quotation.taxTotal, '360.00');
  assert.equal(quotation.total, '2360.00');
  assert.equal(quotation.items[0].taxDetails[0].rate, '18.00');

  const subscription = await must(call('GET', `/subscriptions/${subscriptionId}`, ops));
  assert.equal(subscription.status, 'active');
  assert.match(subscription.subscriptionNumber, /^SUB-/);
  assert.ok(subscription.history.length >= 2);

  // Activation generates exactly one draft invoice for the first period.
  assert.equal(invoice.status, 'draft');
  assert.equal(invoice.total, '2360.00');
  assert.equal(invoice.outstanding, '2360.00');
  assert.equal((await call('POST', '/payments', ops, { invoiceId: invoice.id, method: 'cash', amount: 1, paymentDate: today })).status, 409, 'draft cannot take payment');

  // Duplicate generation is refused for the same period.
  const again = await must(call('POST', `/subscriptions/${subscriptionId}/generate-invoice`, ops));
  assert.equal(again.invoice, null);
  assert.equal((await must(call('GET', `/invoices?subscriptionId=${subscriptionId}`, ops))).length, 1);

  // Drafts stay hidden from the customer.
  assert.equal((await call('GET', `/portal/invoices/${invoice.id}`, customerA)).status, 404);

  // Editing a draft recalculates with the captured tax rate.
  const detail = await must(call('GET', `/invoices/${invoice.id}`, ops));
  await must(call('PUT', `/invoices/${invoice.id}`, ops, {
    dueDate: detail.dueDate, notes: 'edited',
    lines: [{ id: detail.items[0].id, description: detail.items[0].description, quantity: 2, unitPrice: 1500 }],
  }));
  assert.equal((await must(call('GET', `/invoices/${invoice.id}`, ops))).total, '3540.00');

  await must(call('POST', `/invoices/${invoice.id}/confirm`, ops));
  assert.equal((await call('POST', `/invoices/${invoice.id}/confirm`, ops)).status, 409, 'cannot confirm twice');
  assert.equal((await call('PUT', `/invoices/${invoice.id}`, ops, { dueDate: detail.dueDate, lines: [{ id: detail.items[0].id, description: 'x', quantity: 1, unitPrice: 1 }] })).status, 409, 'confirmed is not editable');
  await must(call('POST', `/invoices/${invoice.id}/send`, ops));

  // Partial then full payment, with overpayment and duplicates refused.
  assert.equal((await call('POST', '/payments', ops, { invoiceId: invoice.id, method: 'cash', amount: 99999, paymentDate: today })).status, 400);
  assert.equal((await call('POST', '/payments', ops, { invoiceId: invoice.id, method: 'cash', amount: -5, paymentDate: today })).status, 400);
  const key = crypto.randomUUID();
  const first = await must(call('POST', '/payments', ops, { invoiceId: invoice.id, method: 'bank_transfer', amount: 1000, paymentDate: today, idempotencyKey: key }), 201);
  assert.equal(first.outstanding, '2540.00');
  assert.equal(first.invoiceStatus, 'confirmed');
  const repeat = await must(call('POST', '/payments', ops, { invoiceId: invoice.id, method: 'bank_transfer', amount: 1000, paymentDate: today, idempotencyKey: key }), 201);
  assert.equal(repeat.id, first.id);
  assert.equal(repeat.duplicate, true);
  let current = await must(call('GET', `/invoices/${invoice.id}`, finance));
  assert.equal(current.amountPaid, '1000.00');
  assert.equal(current.paymentStatus, 'partial');
  assert.equal(current.status, 'confirmed');

  assert.equal((await call('POST', `/invoices/${invoice.id}/cancel`, ops)).status, 409, 'cannot cancel with payments');

  const second = await must(call('POST', '/payments', ops, { invoiceId: invoice.id, method: 'card', amount: 2540, paymentDate: today }), 201);
  assert.equal(second.invoiceStatus, 'paid');
  assert.equal(second.outstanding, '0.00');
  assert.equal((await call('POST', '/payments', ops, { invoiceId: invoice.id, method: 'card', amount: 1, paymentDate: today })).status, 409, 'paid invoice takes no payment');

  // Voiding reopens the invoice and restores the balance.
  await must(call('POST', `/payments/${second.id}/void`, ops, { reason: 'Bounced' }));
  current = await must(call('GET', `/invoices/${invoice.id}`, finance));
  assert.equal(current.status, 'confirmed');
  assert.equal(current.outstanding, '2540.00');
  await must(call('POST', '/payments', ops, { invoiceId: invoice.id, method: 'card', amount: 2540, paymentDate: today }), 201);

  // PDFs download for the owner.
  const pdf = await fetch(`${API}/portal/invoices/${invoice.id}/pdf`, { headers: { Authorization: `Bearer ${customerA}` } });
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString(), '%PDF');
});

test('quotations cannot be converted twice or before acceptance', async () => {
  const { id } = await must(call('POST', '/quotations', sales, quote(customerAId)), 201);
  assert.equal((await call('POST', `/quotations/${id}/convert`, sales, {})).status, 409);
  assert.equal((await call('POST', `/portal/quotations/${id}/accept`, customerA)).status, 404, 'customer cannot see a draft');
  await must(call('POST', `/quotations/${id}/send`, sales));
  assert.equal((await call('PUT', `/quotations/${id}`, sales, quote(customerAId))).status, 409, 'sent quotation is locked');
  await must(call('POST', `/portal/quotations/${id}/accept`, customerA));
  assert.equal((await call('POST', `/portal/quotations/${id}/reject`, customerA, {})).status, 409);
  await must(call('POST', `/quotations/${id}/convert`, sales, {}), 201);
  assert.equal((await call('POST', `/quotations/${id}/convert`, sales, {})).status, 409);
});

test('a quotation can be accepted on its expiry date but not after it', async () => {
  const yesterday = daysFromToday(-1);
  const onTime = await must(call('POST', '/quotations', sales, quote(customerAId, { quotationDate: yesterday, expiryDate: today })), 201);
  await must(call('POST', `/quotations/${onTime.id}/send`, sales));
  assert.equal((await must(call('POST', `/portal/quotations/${onTime.id}/accept`, customerA))).status, 'accepted');

  const late = await must(call('POST', '/quotations', sales, quote(customerAId)), 201);
  await must(call('POST', `/quotations/${late.id}/send`, sales));
  await sql(`UPDATE quotations SET quotation_date = $2, expiry_date = $2 WHERE id = $1`, [late.id, yesterday]);
  assert.equal((await must(call('POST', `/portal/quotations/${late.id}/accept`, customerA))).status, 'expired');
  assert.equal((await must(call('GET', `/quotations/${late.id}`, sales))).status, 'expired');
  assert.equal((await call('POST', `/quotations/${late.id}/convert`, sales, {})).status, 409);
});

test('the billing run expires overdue sent quotations', async () => {
  const { id } = await must(call('POST', '/quotations', sales, quote(customerAId)), 201);
  await must(call('POST', `/quotations/${id}/send`, sales));
  await sql(`UPDATE quotations SET quotation_date = $2, expiry_date = $2 WHERE id = $1`, [id, daysFromToday(-3)]);
  await must(call('POST', '/invoices/run-billing', ops));
  assert.equal((await must(call('GET', `/quotations/${id}`, sales))).status, 'expired');
});

test('a subscription behind on billing catches up one invoice per period, without duplicates', async () => {
  const { subscriptionId, invoice } = await activeSubscription(customerA, customerAId);
  // Rewind so the first invoice's period started 3 months ago, leaving 3 further periods due.
  const start = monthsFromToday(-3);
  await sql(`UPDATE invoices SET period_start = $2, period_end = $3, invoice_date = $2, due_date = $3 WHERE id = $1`, [invoice.id, start, daysFromToday(-1)]);
  await sql(`UPDATE subscriptions SET start_date = $2, billing_anchor_date = $2, next_billing_date = $3, billed_cycles = 1 WHERE id = $1`, [subscriptionId, start, monthsFromToday(-2)]);

  await must(call('POST', '/invoices/run-billing', ops));
  const invoices = await must(call('GET', `/invoices?subscriptionId=${subscriptionId}&pageSize=50`, ops));
  assert.equal(invoices.length, 4);
  const periods = invoices.map((i: any) => i.periodStart);
  assert.equal(new Set(periods).size, 4, 'each period billed once');

  await must(call('POST', '/invoices/run-billing', ops));
  assert.equal((await must(call('GET', `/invoices?subscriptionId=${subscriptionId}&pageSize=50`, ops))).length, 4, 'second run adds nothing');
});

test('the database itself refuses a duplicate invoice for a billing period', async () => {
  const { invoice } = await activeSubscription(customerA, customerAId);
  await assert.rejects(
    sql(
      `INSERT INTO invoices (invoice_number, customer_id, subscription_id, invoice_date, due_date, period_start, period_end)
       SELECT 'DUP-' || invoice_number, customer_id, subscription_id, invoice_date, due_date, period_start, period_end FROM invoices WHERE id = $1`,
      [invoice.id],
    ),
    /uq_invoices_subscription_period/,
  );
});

test('overdue is driven by due date and unpaid balance', async () => {
  const { invoice } = await activeSubscription(customerA, customerAId);
  await must(call('POST', `/invoices/${invoice.id}/confirm`, ops));
  const isOverdue = async () => (await must(call('GET', `/invoices?overdue=true&customerId=${customerAId}&pageSize=100`, finance))).some((i: any) => i.id === invoice.id);
  assert.equal(await isOverdue(), false, 'not yet due');
  await sql(`UPDATE invoices SET invoice_date = $2, due_date = $2 WHERE id = $1`, [invoice.id, daysFromToday(-1)]);
  assert.equal(await isOverdue(), true, 'past due with a balance');
  await must(call('POST', '/payments', ops, { invoiceId: invoice.id, method: 'cash', amount: 100, paymentDate: today }), 201);
  assert.equal(await isOverdue(), true, 'a partial payment leaves it overdue');
  await must(call('POST', '/payments', ops, { invoiceId: invoice.id, method: 'cash', amount: 2260, paymentDate: today }), 201);
  assert.equal(await isOverdue(), false, 'settled');
});

const expirySubscription = async (planBody: object) => {
  const p = await must(call('POST', '/plans', admin, { name: `Expiry ${crypto.randomUUID()}`, price: 100, billingFrequency: 'monthly', termCycles: 12, ...planBody }), 201);
  const { id } = await must(call('POST', '/subscriptions', ops, { customerId: customerAId, startDate: today, lines: [{ itemType: 'plan', planId: p.id, quantity: 1 }] }), 201);
  for (const action of ['send_quotation', 'confirm', 'activate']) await must(call('POST', `/subscriptions/${id}/transition`, ops, { action }));
  await sql(`UPDATE subscriptions SET start_date = $2, expiry_date = $3 WHERE id = $1`, [id, monthsFromToday(-12), today]);
  return id as string;
};

test('at expiry each plan follows its renewal configuration', async () => {
  const auto = await expirySubscription({ renewalMode: 'auto' });
  const manual = await expirySubscription({ renewalMode: 'manual' });
  const autoClose = await expirySubscription({ renewalMode: 'manual', autoClose: true });
  const noRenewal = await expirySubscription({ renewalMode: 'none' });
  await must(call('POST', '/invoices/run-billing', ops));

  const renewed = await must(call('GET', `/subscriptions/${auto}`, ops));
  assert.equal(renewed.status, 'active');
  assert.equal(renewed.expiryDate, monthsFromToday(12));
  assert.equal(renewed.renewals[0].renewalType, 'auto');

  const waiting = await must(call('GET', `/subscriptions/${manual}`, ops));
  assert.equal(waiting.status, 'active');
  assert.equal(waiting.expiryDate, today, 'manual renewal waits for staff');

  assert.equal((await must(call('GET', `/subscriptions/${autoClose}`, ops))).status, 'closed');
  assert.equal((await must(call('GET', `/subscriptions/${noRenewal}`, ops))).status, 'closed');

  // Running again must not renew a second time.
  await must(call('POST', '/invoices/run-billing', ops));
  assert.equal((await must(call('GET', `/subscriptions/${auto}`, ops))).renewals.length, 1);
});

test('resuming moves billing and expiry forward by the paused time', async () => {
  const created = await must(call('POST', '/subscriptions', ops, { customerId: customerAId, startDate: today, lines: [{ itemType: 'plan', planId: plan.id, quantity: 2 }] }), 201);
  for (const action of ['send_quotation', 'confirm', 'activate', 'pause']) await must(call('POST', `/subscriptions/${created.id}/transition`, ops, { action }));
  const paused = await must(call('GET', `/subscriptions/${created.id}`, ops));
  await sql(`UPDATE subscriptions SET paused_at = $2 WHERE id = $1`, [created.id, daysFromToday(-10)]);
  await must(call('POST', '/invoices/run-billing', ops));
  assert.equal((await must(call('GET', `/invoices?subscriptionId=${created.id}`, ops))).length, 1, 'paused subscriptions are not billed');
  await must(call('POST', `/subscriptions/${created.id}/transition`, ops, { action: 'resume' }));
  const resumed = await must(call('GET', `/subscriptions/${created.id}`, ops));
  assert.equal(resumed.expiryDate, addDaysTo(paused.expiryDate, 10));
  assert.equal(resumed.nextBillingDate, addDaysTo(paused.nextBillingDate, 10));
});

test('a reset token works once and not after expiry', async () => {
  const email = `reset-${run}@example.test`;
  const reg = await must(call('POST', '/auth/register', undefined, { customerName: 'Reset', email, phone: '+91 90000 44444', password: PASSWORD }), 201);
  const raw = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const hash = createHash('sha256').update(raw).digest('hex');
  const userId = reg.user.id;
  await sql(`INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, now() - interval '1 minute')`, [userId, hash]);
  assert.equal((await call('POST', '/auth/reset-password', undefined, { token: raw, password: 'Changed@1234' })).status, 400, 'expired');
  await sql(`UPDATE password_reset_tokens SET expires_at = now() + interval '1 hour' WHERE token_hash = $1`, [hash]);
  await must(call('POST', '/auth/reset-password', undefined, { token: raw, password: 'Changed@1234' }));
  assert.equal((await call('POST', '/auth/reset-password', undefined, { token: raw, password: 'Again@12345' })).status, 400, 'single use');
  assert.equal((await call('GET', '/auth/me', reg.token)).status, 401, 'old sessions are revoked');
  await login(email, 'Changed@1234');
  const stored = await sql(`SELECT password_hash FROM users WHERE id = $1`, [userId]);
  assert.match(stored[0].password_hash, /^\$2[aby]\$12\$/, 'bcrypt hash');
});

test('customers are isolated from each other', async () => {
  const { quotationId, subscriptionId, invoice } = await activeSubscription(customerA, customerAId);
  await must(call('POST', `/invoices/${invoice.id}/confirm`, ops));
  for (const path of [`/portal/quotations/${quotationId}`, `/portal/quotations/${quotationId}/pdf`, `/portal/subscriptions/${subscriptionId}`, `/portal/invoices/${invoice.id}`, `/portal/invoices/${invoice.id}/pdf`]) {
    assert.equal((await call('GET', path, customerB)).status, 404, path);
    assert.equal((await call('GET', path, customerA)).status, 200, path);
  }
  assert.equal((await call('POST', `/portal/quotations/${quotationId}/reject`, customerB, {})).status, 404);
  // A supplied customerId must be ignored: B's lists stay empty.
  for (const path of ['invoices', 'subscriptions', 'quotations', 'payments']) {
    const page = await must(call('GET', `/portal/${path}?customerId=${customerAId}`, customerB));
    assert.equal(page.length, 0, path);
  }
  assert.equal((await call('POST', '/portal/requests', customerB, { requestType: 'addon', subscriptionId, productId: addon.id })).status, 404);
  assert.ok(customerBId);
});

test('subscription lifecycle rules', async () => {
  const created = await must(call('POST', '/subscriptions', ops, { customerId: customerAId, startDate: today, lines: [{ itemType: 'plan', planId: plan.id, quantity: 2 }] }), 201);
  const move = (action: string, reason?: string) => call('POST', `/subscriptions/${created.id}/transition`, ops, { action, reason });
  assert.equal((await move('activate')).status, 409, 'draft cannot skip to active');
  await must(move('send_quotation'));
  assert.equal((await move('activate')).status, 409, 'quotation cannot skip to active');
  await must(move('confirm'));
  await must(move('activate'));
  assert.equal((await move('activate')).status, 409);
  assert.equal((await call('PUT', `/subscriptions/${created.id}`, ops, { startDate: today, lines: [{ itemType: 'plan', planId: plan.id, quantity: 3 }] })).status, 409, 'active is locked');
  await must(move('pause'));
  assert.equal((await call('POST', `/subscriptions/${created.id}/renew`, ops)).status, 409, 'paused cannot renew');
  await must(move('resume'));

  const before = await must(call('GET', `/subscriptions/${created.id}`, ops));
  await must(call('POST', `/subscriptions/${created.id}/renew`, ops));
  const after = await must(call('GET', `/subscriptions/${created.id}`, ops));
  assert.ok(after.expiryDate > before.expiryDate);
  assert.equal(after.renewals.length, 1);

  await must(move('close', 'Customer left'));
  assert.equal((await move('resume')).status, 409, 'closed is final');
  assert.equal((await must(call('GET', `/subscriptions/${created.id}`, ops))).status, 'closed');
});

test('plan rules for pause and early closure are enforced', async () => {
  const strict = await must(call('POST', '/plans', admin, { name: `Strict ${run}`, price: 10, billingFrequency: 'weekly', allowPause: false, allowEarlyClose: false, renewalMode: 'none' }), 201);
  const { id } = await must(call('POST', '/subscriptions', ops, { customerId: customerAId, startDate: today, lines: [{ itemType: 'plan', planId: strict.id, quantity: 1 }] }), 201);
  for (const action of ['send_quotation', 'confirm', 'activate']) await must(call('POST', `/subscriptions/${id}/transition`, ops, { action }));
  assert.equal((await call('POST', `/subscriptions/${id}/transition`, ops, { action: 'pause' })).status, 409);
  assert.equal((await call('POST', `/subscriptions/${id}/transition`, ops, { action: 'close' })).status, 409);
  assert.equal((await call('POST', `/subscriptions/${id}/renew`, ops)).status, 409);
});

test('discount usage limit stops the discount on later invoices', async () => {
  const q = await must(call('POST', '/quotations/preview', sales, { lines: [{ itemType: 'plan', planId: plan.id, quantity: 2 }], discountId: percentDiscount.id }));
  assert.equal(q.discountTotal, '200.00');
  assert.equal(q.total, '2124.00');
  const first = await activeSubscription(customerA, customerAId, { discountId: percentDiscount.id });
  assert.equal(first.invoice.discountTotal, '200.00');
  // The limit of 1 is now used: a second subscription is invoiced at full price.
  const second = await must(call('POST', '/quotations', sales, quote(customerAId)), 201);
  assert.ok(second.id);
  const preview = await call('POST', '/quotations/preview', sales, { lines: [{ itemType: 'plan', planId: plan.id, quantity: 2 }], discountId: percentDiscount.id });
  assert.equal(preview.status, 400);
  assert.match(preview.body.error.message, /usage limit/);
  // Cancelling the invoice releases the use.
  await must(call('POST', `/invoices/${first.invoice.id}/cancel`, ops));
  await must(call('POST', '/quotations/preview', sales, { lines: [{ itemType: 'plan', planId: plan.id, quantity: 2 }], discountId: percentDiscount.id }));
});

test('historical invoices keep their original tax after a rate change', async () => {
  const { invoice } = await activeSubscription(customerA, customerAId);
  const taxes = await must(call('GET', '/taxes?search=GST', admin));
  const gst = taxes[0];
  await must(call('PUT', `/taxes/${gst.id}`, admin, { name: gst.name, rate: 28, appliesTo: gst.appliesTo, description: gst.description, status: gst.status }));
  try {
    const stored = await must(call('GET', `/invoices/${invoice.id}`, ops));
    assert.equal(stored.taxTotal, '360.00');
    assert.equal(stored.items[0].taxDetails[0].rate, '18.00');
    const fresh = await must(call('POST', '/quotations/preview', sales, { lines: [{ itemType: 'plan', planId: plan.id, quantity: 2 }] }));
    assert.equal(fresh.taxTotal, '560.00');
  } finally {
    await must(call('PUT', `/taxes/${gst.id}`, admin, { name: gst.name, rate: gst.rate, appliesTo: gst.appliesTo, description: gst.description, status: gst.status }));
  }
});

test('add-on requests need approval and change only future billing', async () => {
  const { subscriptionId, invoice } = await activeSubscription(customerA, customerAId);
  const { id: requestId } = await must(call('POST', '/portal/requests', customerA, { requestType: 'addon', subscriptionId, productId: addon.id, productQuantity: 1 }), 201);
  const before = await must(call('GET', `/subscriptions/${subscriptionId}`, ops));
  assert.equal(before.items.length, 1, 'no change before approval');
  assert.equal((await call('POST', `/requests/${requestId}/approve-addon`, sales)).status, 403);
  await must(call('POST', `/requests/${requestId}/approve-addon`, ops));
  assert.equal((await call('POST', `/requests/${requestId}/approve-addon`, ops)).status, 409, 'cannot approve twice');
  const after = await must(call('GET', `/subscriptions/${subscriptionId}`, ops));
  assert.equal(after.items.length, 2);
  assert.equal(after.total, '2950.00');
  assert.equal((await must(call('GET', `/invoices/${invoice.id}`, ops))).total, '2360.00', 'issued invoice unchanged');
});

test('staff management and profile changes take effect immediately', async () => {
  const email = `staff-${run}@example.test`;
  const staff = await must(call('POST', '/staff', admin, { fullName: 'New Staff', email, phone: '+91 90000 33333', password: PASSWORD, profile: 'finance' }), 201);
  assert.equal((await call('POST', '/staff', admin, { fullName: 'Dup', email, phone: '+91 90000 33333', password: PASSWORD, profile: 'finance' })).status, 409);
  const token = await login(email, PASSWORD);
  assert.equal((await call('GET', '/reports/revenue', token)).status, 200);
  await must(call('PUT', `/staff/${staff.id}`, admin, { fullName: 'New Staff', email, phone: '+91 90000 33333', profile: 'sales', status: 'active' }));
  assert.equal((await call('GET', '/reports/revenue', token)).status, 403, 'new profile applies to the existing token');
  await must(call('PATCH', `/staff/${staff.id}/status`, admin, { status: 'inactive' }));
  assert.equal((await call('GET', '/auth/me', token)).status, 401, 'deactivation is immediate');
  assert.equal((await call('POST', '/auth/login', undefined, { email, password: PASSWORD })).status, 403);
});

test('dashboards and reports reflect recorded transactions', async () => {
  const before = await must(call('GET', '/dashboard/finance', finance));
  const { invoice } = await activeSubscription(customerA, customerAId);
  await must(call('POST', `/invoices/${invoice.id}/confirm`, ops));
  await must(call('POST', '/payments', ops, { invoiceId: invoice.id, method: 'cash', amount: 360, paymentDate: today }), 201);
  const after = await must(call('GET', '/dashboard/finance', finance));
  assert.equal((Number(after.finance.revenueReceived) - Number(before.finance.revenueReceived)).toFixed(2), '360.00');
  assert.equal((Number(after.finance.outstandingAmount) - Number(before.finance.outstandingAmount)).toFixed(2), '2000.00');
  for (const type of ['revenue', 'payments', 'outstanding', 'overdue', 'paid', 'unpaid', 'subscriptions', 'active', 'closed', 'renewals', 'customers']) {
    const r = await call('GET', `/reports/${type}?pageSize=5`, finance);
    assert.equal(r.status, 200, type);
    assert.ok(Array.isArray(r.body.data.rows), type);
  }
  const unpaid = await must(call('GET', `/reports/unpaid?customerId=${customerAId}&pageSize=100`, finance));
  assert.ok(unpaid.rows.some((r: any) => r.id === invoice.id));
  const csv = await call('GET', `/reports/payments/export?customerId=${customerAId}`, finance);
  assert.equal(csv.status, 200);
  assert.match(String(csv.body), /Reference/);
  const adminDash = await must(call('GET', `/dashboard/admin?customerId=${customerAId}`, admin));
  assert.ok(adminDash.subscriptions.active >= 1);
  const search = await must(call('GET', `/search?q=${invoice.invoiceNumber}`, finance));
  assert.equal(search.invoices[0].id, invoice.id);
  assert.equal(search.quotations.length, 0, 'finance search excludes quotations');
});

test('concurrent billing runs do not create duplicates', async () => {
  const runs = await Promise.all([1, 2, 3].map(() => call('POST', '/invoices/run-billing', ops)));
  for (const r of runs) assert.equal(r.status, 200);
  const { id } = await must(call('POST', '/subscriptions', ops, { customerId: customerAId, startDate: today, lines: [{ itemType: 'plan', planId: plan.id, quantity: 2 }] }), 201);
  for (const action of ['send_quotation', 'confirm']) await must(call('POST', `/subscriptions/${id}/transition`, ops, { action }));
  await Promise.all([
    call('POST', `/subscriptions/${id}/transition`, ops, { action: 'activate' }),
    call('POST', `/subscriptions/${id}/generate-invoice`, ops),
    call('POST', `/subscriptions/${id}/generate-invoice`, ops),
    call('POST', '/invoices/run-billing', ops),
  ]);
  await call('POST', `/subscriptions/${id}/generate-invoice`, ops);
  assert.equal((await must(call('GET', `/invoices?subscriptionId=${id}`, ops))).length, 1);
});
