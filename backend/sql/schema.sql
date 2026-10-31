-- Subscription Management System schema (PostgreSQL 13+)

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------------ identity

CREATE TABLE roles (
  id         SMALLSERIAL PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE CHECK (code IN ('admin', 'staff', 'customer')),
  name       TEXT NOT NULL
);

CREATE TABLE staff_profiles (
  id          SMALLSERIAL PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE CHECK (code IN ('sales', 'operations', 'finance')),
  name        TEXT NOT NULL,
  description TEXT,
  permissions TEXT[] NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id          SMALLINT NOT NULL REFERENCES roles(id),
  staff_profile_id SMALLINT REFERENCES staff_profiles(id),
  full_name        TEXT NOT NULL,
  email            TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
  phone            TEXT,
  password_hash    TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  token_version    INTEGER NOT NULL DEFAULT 0,
  last_login_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_role ON users(role_id);
CREATE INDEX idx_users_profile ON users(staff_profile_id);
CREATE INDEX idx_users_status ON users(status);

CREATE TABLE password_reset_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reset_tokens_user ON password_reset_tokens(user_id);

CREATE TABLE customers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL UNIQUE REFERENCES users(id),
  customer_name   TEXT NOT NULL,
  company_name    TEXT,
  billing_address TEXT,
  tax_id          TEXT,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_customers_created ON customers(created_at DESC);
CREATE INDEX idx_customers_name ON customers(customer_name);

-- ------------------------------------------------------------------ catalogue

CREATE TABLE products (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  product_type TEXT NOT NULL CHECK (product_type IN ('software', 'service', 'support', 'hardware', 'other')),
  sales_price  NUMERIC(14, 2) NOT NULL CHECK (sales_price >= 0),
  cost_price   NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  description  TEXT,
  is_addon     BOOLEAN NOT NULL DEFAULT false,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_name ON products(name);

CREATE TABLE product_variants (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  additional_price NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (additional_price >= 0),
  is_configurable  BOOLEAN NOT NULL DEFAULT false,
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, name)
);

CREATE TABLE subscription_plans (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL UNIQUE,
  description       TEXT,
  price             NUMERIC(14, 2) NOT NULL CHECK (price >= 0),
  billing_frequency TEXT NOT NULL CHECK (billing_frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
  min_quantity      INTEGER NOT NULL DEFAULT 1 CHECK (min_quantity >= 1),
  term_cycles       INTEGER NOT NULL DEFAULT 12 CHECK (term_cycles >= 1),
  available_from    DATE,
  available_until   DATE,
  auto_close        BOOLEAN NOT NULL DEFAULT false,
  allow_early_close BOOLEAN NOT NULL DEFAULT true,
  allow_pause       BOOLEAN NOT NULL DEFAULT true,
  renewal_mode      TEXT NOT NULL DEFAULT 'manual' CHECK (renewal_mode IN ('auto', 'manual', 'none')),
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (available_until IS NULL OR available_from IS NULL OR available_until >= available_from)
);
CREATE INDEX idx_plans_status ON subscription_plans(status);

CREATE TABLE tax_rules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  rate        NUMERIC(5, 2) NOT NULL CHECK (rate >= 0 AND rate <= 100),
  applies_to  TEXT NOT NULL DEFAULT 'all' CHECK (applies_to IN ('all', 'products', 'plans')),
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE discounts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL UNIQUE,
  discount_type  TEXT NOT NULL CHECK (discount_type IN ('fixed', 'percentage')),
  value          NUMERIC(14, 2) NOT NULL CHECK (value > 0),
  min_purchase   NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (min_purchase >= 0),
  min_quantity   INTEGER NOT NULL DEFAULT 1 CHECK (min_quantity >= 1),
  start_date     DATE NOT NULL,
  end_date       DATE NOT NULL,
  usage_limit    INTEGER CHECK (usage_limit IS NULL OR usage_limit >= 1),
  scope          TEXT NOT NULL DEFAULT 'all' CHECK (scope IN ('all', 'selected')),
  auto_apply     BOOLEAN NOT NULL DEFAULT false,
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date),
  CHECK (discount_type <> 'percentage' OR value <= 100)
);
CREATE INDEX idx_discounts_active ON discounts(status, start_date, end_date);

CREATE TABLE discount_products (
  discount_id UUID NOT NULL REFERENCES discounts(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  PRIMARY KEY (discount_id, product_id)
);

CREATE TABLE discount_plans (
  discount_id UUID NOT NULL REFERENCES discounts(id) ON DELETE CASCADE,
  plan_id     UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
  PRIMARY KEY (discount_id, plan_id)
);

-- ------------------------------------------------------------------ quotations

CREATE TABLE quotation_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL UNIQUE,
  description   TEXT,
  validity_days INTEGER NOT NULL DEFAULT 30 CHECK (validity_days >= 1),
  terms         TEXT,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE quotation_template_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES quotation_templates(id) ON DELETE CASCADE,
  item_type   TEXT NOT NULL CHECK (item_type IN ('product', 'plan')),
  product_id  UUID REFERENCES products(id),
  variant_id  UUID REFERENCES product_variants(id),
  plan_id     UUID REFERENCES subscription_plans(id),
  quantity    INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  position    INTEGER NOT NULL DEFAULT 0,
  CHECK ((item_type = 'product' AND product_id IS NOT NULL) OR (item_type = 'plan' AND plan_id IS NOT NULL))
);
CREATE INDEX idx_template_items_template ON quotation_template_items(template_id);

CREATE TABLE quotations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_number TEXT NOT NULL UNIQUE,
  customer_id      UUID NOT NULL REFERENCES customers(id),
  template_id      UUID REFERENCES quotation_templates(id),
  discount_id      UUID REFERENCES discounts(id),
  quotation_date   DATE NOT NULL,
  expiry_date      DATE NOT NULL,
  subtotal         NUMERIC(14, 2) NOT NULL DEFAULT 0,
  discount_total   NUMERIC(14, 2) NOT NULL DEFAULT 0,
  tax_total        NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total            NUMERIC(14, 2) NOT NULL DEFAULT 0,
  terms            TEXT,
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired')),
  sent_at          TIMESTAMPTZ,
  responded_at     TIMESTAMPTZ,
  rejection_reason TEXT,
  created_by       UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expiry_date >= quotation_date)
);
CREATE INDEX idx_quotations_customer ON quotations(customer_id);
CREATE INDEX idx_quotations_status_expiry ON quotations(status, expiry_date);
CREATE INDEX idx_quotations_created ON quotations(created_at DESC);

CREATE TABLE quotation_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id    UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  item_type       TEXT NOT NULL CHECK (item_type IN ('product', 'plan')),
  product_id      UUID REFERENCES products(id),
  variant_id      UUID REFERENCES product_variants(id),
  plan_id         UUID REFERENCES subscription_plans(id),
  description     TEXT NOT NULL,
  quantity        INTEGER NOT NULL CHECK (quantity >= 1),
  unit_price      NUMERIC(14, 2) NOT NULL CHECK (unit_price >= 0),
  line_subtotal   NUMERIC(14, 2) NOT NULL,
  discount_name   TEXT,
  discount_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  tax_amount      NUMERIC(14, 2) NOT NULL DEFAULT 0,
  tax_details     JSONB NOT NULL DEFAULT '[]',
  line_total      NUMERIC(14, 2) NOT NULL,
  position        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_quotation_items_quotation ON quotation_items(quotation_id);

-- ------------------------------------------------------------------ subscriptions

CREATE TABLE subscriptions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_number  TEXT NOT NULL UNIQUE,
  customer_id          UUID NOT NULL REFERENCES customers(id),
  plan_id              UUID NOT NULL REFERENCES subscription_plans(id),
  quotation_id         UUID UNIQUE REFERENCES quotations(id),
  discount_id          UUID REFERENCES discounts(id),
  billing_frequency    TEXT NOT NULL CHECK (billing_frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
  start_date           DATE NOT NULL,
  expiry_date          DATE NOT NULL,
  billing_anchor_date  DATE NOT NULL,
  billed_cycles        INTEGER NOT NULL DEFAULT 0,
  next_billing_date    DATE NOT NULL,
  payment_terms_days   INTEGER NOT NULL DEFAULT 15 CHECK (payment_terms_days >= 0),
  subtotal             NUMERIC(14, 2) NOT NULL DEFAULT 0,
  discount_total       NUMERIC(14, 2) NOT NULL DEFAULT 0,
  tax_total            NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total                NUMERIC(14, 2) NOT NULL DEFAULT 0,
  status               TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft', 'quotation', 'confirmed', 'active', 'paused', 'closed')),
  notes                TEXT,
  paused_at            DATE,
  activated_at         TIMESTAMPTZ,
  closed_at            TIMESTAMPTZ,
  close_reason         TEXT,
  renewal_reminder_for DATE,
  created_by           UUID REFERENCES users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expiry_date > start_date)
);
CREATE INDEX idx_subscriptions_customer ON subscriptions(customer_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_plan ON subscriptions(plan_id);
CREATE INDEX idx_subscriptions_expiry ON subscriptions(status, expiry_date);
CREATE INDEX idx_subscriptions_billing ON subscriptions(status, next_billing_date);
CREATE INDEX idx_subscriptions_created ON subscriptions(created_at DESC);

CREATE TABLE subscription_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  item_type       TEXT NOT NULL CHECK (item_type IN ('product', 'plan')),
  product_id      UUID REFERENCES products(id),
  variant_id      UUID REFERENCES product_variants(id),
  plan_id         UUID REFERENCES subscription_plans(id),
  description     TEXT NOT NULL,
  quantity        INTEGER NOT NULL CHECK (quantity >= 1),
  unit_price      NUMERIC(14, 2) NOT NULL CHECK (unit_price >= 0),
  line_subtotal   NUMERIC(14, 2) NOT NULL,
  discount_name   TEXT,
  discount_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  tax_amount      NUMERIC(14, 2) NOT NULL DEFAULT 0,
  tax_details     JSONB NOT NULL DEFAULT '[]',
  line_total      NUMERIC(14, 2) NOT NULL,
  position        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_subscription_items_subscription ON subscription_items(subscription_id);

CREATE TABLE subscription_history (
  id              BIGSERIAL PRIMARY KEY,
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  from_status     TEXT,
  to_status       TEXT NOT NULL,
  note            TEXT,
  changed_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_subscription_history_subscription ON subscription_history(subscription_id, created_at DESC);

CREATE TABLE subscription_renewals (
  id              BIGSERIAL PRIMARY KEY,
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  previous_expiry DATE NOT NULL,
  new_expiry      DATE NOT NULL,
  renewal_type    TEXT NOT NULL CHECK (renewal_type IN ('auto', 'manual')),
  renewed_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (subscription_id, previous_expiry),
  CHECK (new_expiry > previous_expiry)
);
CREATE INDEX idx_subscription_renewals_created ON subscription_renewals(created_at DESC);

-- Customer-initiated requests for a new quotation or an add-on to an existing subscription.
CREATE TABLE quotation_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     UUID NOT NULL REFERENCES customers(id),
  request_type    TEXT NOT NULL CHECK (request_type IN ('quotation', 'addon')),
  plan_id         UUID REFERENCES subscription_plans(id),
  plan_quantity   INTEGER CHECK (plan_quantity IS NULL OR plan_quantity >= 1),
  product_id      UUID REFERENCES products(id),
  variant_id      UUID REFERENCES product_variants(id),
  product_quantity INTEGER CHECK (product_quantity IS NULL OR product_quantity >= 1),
  subscription_id UUID REFERENCES subscriptions(id),
  notes           TEXT,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'quoted', 'approved', 'declined')),
  quotation_id    UUID REFERENCES quotations(id),
  response_note   TEXT,
  handled_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((request_type = 'quotation' AND plan_id IS NOT NULL)
      OR (request_type = 'addon' AND product_id IS NOT NULL AND subscription_id IS NOT NULL))
);
CREATE INDEX idx_quotation_requests_customer ON quotation_requests(customer_id);
CREATE INDEX idx_quotation_requests_status ON quotation_requests(status, created_at DESC);

-- ------------------------------------------------------------------ billing

CREATE TABLE invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number  TEXT NOT NULL UNIQUE,
  customer_id     UUID NOT NULL REFERENCES customers(id),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id),
  invoice_date    DATE NOT NULL,
  due_date        DATE NOT NULL,
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  subtotal        NUMERIC(14, 2) NOT NULL DEFAULT 0,
  discount_total  NUMERIC(14, 2) NOT NULL DEFAULT 0,
  tax_total       NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total           NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  amount_paid     NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  outstanding     NUMERIC(14, 2) GENERATED ALWAYS AS (total - amount_paid) STORED,
  payment_status  TEXT GENERATED ALWAYS AS (
                    CASE WHEN amount_paid <= 0 AND total > 0 THEN 'unpaid'
                         WHEN amount_paid < total THEN 'partial'
                         ELSE 'paid' END
                  ) STORED,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'paid', 'cancelled')),
  notes           TEXT,
  sent_at         TIMESTAMPTZ,
  confirmed_at    TIMESTAMPTZ,
  paid_at         TIMESTAMPTZ,
  cancelled_at    TIMESTAMPTZ,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (due_date >= invoice_date),
  CHECK (period_end >= period_start),
  CHECK (amount_paid <= total),
  CHECK (status <> 'paid' OR amount_paid >= total)
);
-- One live invoice per subscription billing period: the database enforces duplicate prevention.
CREATE UNIQUE INDEX uq_invoices_subscription_period ON invoices(subscription_id, period_start) WHERE status <> 'cancelled';
CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_invoices_subscription ON invoices(subscription_id);
CREATE INDEX idx_invoices_status_due ON invoices(status, due_date);
CREATE INDEX idx_invoices_date ON invoices(invoice_date DESC);
CREATE INDEX idx_invoices_payment_status ON invoices(payment_status);

CREATE TABLE invoice_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  item_type       TEXT NOT NULL CHECK (item_type IN ('product', 'plan')),
  product_id      UUID REFERENCES products(id),
  variant_id      UUID REFERENCES product_variants(id),
  plan_id         UUID REFERENCES subscription_plans(id),
  description     TEXT NOT NULL,
  quantity        INTEGER NOT NULL CHECK (quantity >= 1),
  unit_price      NUMERIC(14, 2) NOT NULL CHECK (unit_price >= 0),
  line_subtotal   NUMERIC(14, 2) NOT NULL,
  discount_name   TEXT,
  discount_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  tax_amount      NUMERIC(14, 2) NOT NULL DEFAULT 0,
  tax_details     JSONB NOT NULL DEFAULT '[]',
  line_total      NUMERIC(14, 2) NOT NULL,
  position        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_invoice_items_invoice ON invoice_items(invoice_id);

CREATE TABLE discount_usage (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discount_id UUID NOT NULL REFERENCES discounts(id),
  invoice_id  UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id),
  amount      NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (discount_id, invoice_id)
);
CREATE INDEX idx_discount_usage_discount ON discount_usage(discount_id);

CREATE TABLE payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_reference TEXT NOT NULL UNIQUE,
  customer_id       UUID NOT NULL REFERENCES customers(id),
  invoice_id        UUID NOT NULL REFERENCES invoices(id),
  method            TEXT NOT NULL CHECK (method IN ('bank_transfer', 'cash', 'card', 'other')),
  amount            NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  payment_date      DATE NOT NULL,
  notes             TEXT,
  status            TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'voided')),
  idempotency_key   UUID UNIQUE,
  voided_at         TIMESTAMPTZ,
  void_reason       TEXT,
  recorded_by       UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_customer ON payments(customer_id);
CREATE INDEX idx_payments_invoice ON payments(invoice_id);
CREATE INDEX idx_payments_status_date ON payments(status, payment_date DESC);
CREATE INDEX idx_payments_method ON payments(method);

-- ------------------------------------------------------------------ system

CREATE TABLE notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  message    TEXT NOT NULL,
  link       TEXT,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user ON notifications(user_id, read_at, created_at DESC);

CREATE TABLE audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES users(id),
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

CREATE TABLE settings (
  key        TEXT PRIMARY KEY CHECK (key IN ('company', 'billing', 'notifications')),
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Gapless reference numbering. Rows are locked by UPDATE ... RETURNING inside the caller's transaction.
CREATE TABLE number_sequences (
  code       TEXT PRIMARY KEY CHECK (code IN ('quotation', 'subscription', 'invoice', 'payment')),
  prefix     TEXT NOT NULL,
  next_value BIGINT NOT NULL DEFAULT 1 CHECK (next_value >= 1),
  padding    INTEGER NOT NULL DEFAULT 5 CHECK (padding BETWEEN 1 AND 12),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['staff_profiles','users','customers','products','product_variants','subscription_plans',
    'tax_rules','discounts','quotation_templates','quotations','subscriptions','quotation_requests','invoices',
    'payments','settings','number_sequences']
  LOOP
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated BEFORE UPDATE ON %1$I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
  END LOOP;
END $$;
