

INSERT INTO roles (code, name) VALUES
  ('admin', 'Admin'), ('staff', 'Internal Staff'), ('customer', 'Customer');

INSERT INTO staff_profiles (code, name, description, permissions) VALUES
  ('sales', 'Sales Staff', 'Registers customers and prepares quotations.',
   ARRAY['customers.view','customers.manage','products.view','plans.view','templates.view','quotations.view','quotations.manage','subscriptions.view','discounts.view']),
  ('operations', 'Operations Staff', 'Runs subscriptions, renewals, invoicing and payment recording.',
   ARRAY['customers.view','products.view','plans.view','subscriptions.view','subscriptions.manage','invoices.view','invoices.manage','payments.view','payments.record']),
  ('finance', 'Finance Staff', 'Monitors revenue, outstanding amounts and overdue invoices.',
   ARRAY['customers.view','subscriptions.view','invoices.view','payments.view','reports.view']);

INSERT INTO users (role_id, staff_profile_id, full_name, email, phone, password_hash) VALUES
  ((SELECT id FROM roles WHERE code = 'admin'), NULL, 'Asha Raman', 'admin@brightloop.in', '+91 98000 00001',
   '$2b$10$3RkofwSqS1l8A6lgxnDENOUAJIcfTHexUhoZYlfJAGNeJsCebRqWu'),
  ((SELECT id FROM roles WHERE code = 'staff'), (SELECT id FROM staff_profiles WHERE code = 'sales'), 'Vikram Shah', 'sales@brightloop.in', '+91 98000 00002',
   '$2b$10$wgIKdh8.4VP3YY.xTGJyLOhH9m9PBYBaLcc.nAmciSkMCkmY2XHEK'),
  ((SELECT id FROM roles WHERE code = 'staff'), (SELECT id FROM staff_profiles WHERE code = 'operations'), 'Meera Iyer', 'ops@brightloop.in', '+91 98000 00003',
   '$2b$10$V7uT.X8QPNhJPQLiVojPoOrG1OrwkJsGpOWNJavHT/iZAkzv2ahCi'),
  ((SELECT id FROM roles WHERE code = 'staff'), (SELECT id FROM staff_profiles WHERE code = 'finance'), 'Rohan Das', 'finance@brightloop.in', '+91 98000 00004',
   '$2b$10$CLryZNb/oPaUwqaXvy8HTekVdPjcxGXjaKJP9V6UFDge3wc5bt5aG'),
  ((SELECT id FROM roles WHERE code = 'customer'), NULL, 'Priya Nair', 'customer@acme.example', '+91 98000 00005',
   '$2b$10$nJ7Tx2W7lCF7p5JoVI/KMujTrnYqZoPum3UuKRZXdngRrkGZOI7lG');

INSERT INTO customers (user_id, customer_name, company_name, billing_address, tax_id)
SELECT id, 'Priya Nair', 'Acme Industries Pvt Ltd', '14 MG Road, Bengaluru, Karnataka 560001', '29ABCDE1234F1Z5'
FROM users WHERE email = 'customer@acme.example';

INSERT INTO settings (key, value) VALUES
  ('company', '{"name":"Brightloop Technologies","email":"admin@brightloop.in","phone":"+91 80 4000 0000","address":"Bengaluru, Karnataka, India","taxId":"29AAACB0000A1Z5","website":"https://brightloop.in"}'),
  ('billing', '{"defaultPaymentTermsDays":15,"expiringSoonDays":30,"invoiceNotes":"Thank you for your business."}'),
  ('notifications', '{"emailQuotationSent":true,"emailInvoiceSent":true,"emailPaymentReceived":true,"emailRenewalReminder":true}');

INSERT INTO number_sequences (code, prefix, next_value, padding) VALUES
  ('quotation', 'QUO-', 1, 5), ('subscription', 'SUB-', 1, 5), ('invoice', 'INV-', 1, 5), ('payment', 'PAY-', 1, 5);

INSERT INTO tax_rules (name, rate, applies_to, description) VALUES
  ('GST 18%', 18.00, 'all', 'Goods and Services Tax at the standard SaaS rate.');

INSERT INTO products (name, product_type, sales_price, cost_price, description, is_addon) VALUES
  ('Software Subscription', 'software', 2000.00, 400.00, 'Core platform seat.', false),
  ('Onboarding Service', 'service', 15000.00, 6000.00, 'Guided setup and data migration.', false),
  ('Priority Support', 'support', 1500.00, 500.00, 'Four-hour response time, every day.', true),
  ('Advanced Analytics', 'software', 2500.00, 700.00, 'Cohort and retention analytics module.', true);

INSERT INTO product_variants (product_id, name, additional_price, is_configurable)
SELECT p.id, v.name, v.price, v.configurable FROM products p
CROSS JOIN (VALUES ('Basic', 0.00, false), ('Professional', 560.00, false), ('Enterprise', 0.00, true)) AS v(name, price, configurable)
WHERE p.name = 'Software Subscription';

INSERT INTO subscription_plans (name, description, price, billing_frequency, min_quantity, term_cycles, available_from, auto_close, renewal_mode) VALUES
  ('Starter Monthly', 'For small teams getting started.', 4999.00, 'monthly', 1, 12, '2025-01-01', false, 'manual'),
  ('Growth Monthly', 'For growing businesses with several teams.', 9999.00, 'monthly', 1, 12, '2025-01-01', false, 'auto'),
  ('Enterprise Yearly', 'Annual agreement for large organisations.', 99999.00, 'yearly', 1, 1, '2025-01-01', false, 'manual'),
  ('Weekly Pilot', 'Short pilot that closes automatically at the end of its term.', 1499.00, 'weekly', 1, 4, '2025-01-01', true, 'none');

INSERT INTO discounts (name, discount_type, value, min_purchase, min_quantity, start_date, end_date, usage_limit, scope, auto_apply) VALUES
  ('Launch 10%', 'percentage', 10.00, 1000.00, 1, '2025-01-01', '2030-12-31', 1000, 'all', false),
  ('Flat 500 Off', 'fixed', 500.00, 4000.00, 1, '2025-01-01', '2030-12-31', 500, 'all', false);

INSERT INTO quotation_templates (name, description, validity_days, terms) VALUES
  ('Standard SaaS Agreement', 'Growth plan with core platform seats.', 30, 'Payment is due according to the invoice terms. Prices exclude applicable taxes until calculated on the quotation.'),
  ('Enterprise Rollout', 'Annual plan with onboarding.', 45, 'Annual agreement billed in advance. Onboarding is delivered within 30 days of activation.');

INSERT INTO quotation_template_items (template_id, item_type, plan_id, quantity, position)
SELECT t.id, 'plan', p.id, 1, 0 FROM quotation_templates t, subscription_plans p
WHERE (t.name, p.name) IN (('Standard SaaS Agreement', 'Growth Monthly'), ('Enterprise Rollout', 'Enterprise Yearly'));

INSERT INTO quotation_template_items (template_id, item_type, product_id, variant_id, quantity, position)
SELECT t.id, 'product', p.id, v.id, 5, 1 FROM quotation_templates t, products p
JOIN product_variants v ON v.product_id = p.id AND v.name = 'Professional'
WHERE t.name = 'Standard SaaS Agreement' AND p.name = 'Software Subscription';

INSERT INTO quotation_template_items (template_id, item_type, product_id, quantity, position)
SELECT t.id, 'product', p.id, 1, 1 FROM quotation_templates t, products p
WHERE t.name = 'Enterprise Rollout' AND p.name = 'Onboarding Service';
