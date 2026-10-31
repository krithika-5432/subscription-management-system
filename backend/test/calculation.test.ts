import assert from 'node:assert/strict';
import { test } from 'node:test';
import PDFDocument from 'pdfkit';
import { buildInvoicePdf, COLS } from '../src/utils/pdf.js';
import { calculate, discountIneligibleReason, type DiscountRule, type PricedLine } from '../src/utils/calculation.js';
import { addCycles } from '../src/utils/dates.js';

const plan: PricedLine = { itemType: 'plan', planId: 'plan-1', description: 'Plan', quantity: 2, unitPrice: '999.99' };
const product: PricedLine = { itemType: 'product', productId: 'prod-1', description: 'Product', quantity: 1, unitPrice: '100.01' };
const gst = { id: 't1', name: 'GST', rate: '18.00', appliesTo: 'all' as const };

const discount = (over: Partial<DiscountRule> = {}): DiscountRule => ({
  id: 'd1', name: 'Promo', discountType: 'percentage', value: '10.00', minPurchase: '0', minQuantity: 1, startDate: '2026-01-01',
  endDate: '2026-12-31', usageLimit: null, usageCount: 0, scope: 'all', status: 'active', productIds: [], planIds: [], ...over,
});

test('totals are exact and free of floating point error', () => {
  const r = calculate([plan, product], null, [gst]);
  assert.equal(r.subtotal, '2099.99');
  assert.equal(r.taxTotal, '378.00');
  assert.equal(r.total, '2477.99');
});

test('percentage discount reduces the taxable amount', () => {
  const r = calculate([plan], discount(), [gst]);
  assert.equal(r.subtotal, '1999.98');
  assert.equal(r.discountTotal, '200.00');
  assert.equal(r.taxTotal, '324.00');
  assert.equal(r.total, '2123.98');
});

test('fixed discount is capped at the eligible amount and allocated with no lost paise', () => {
  const r = calculate([plan, product], discount({ discountType: 'fixed', value: '100.00' }), []);
  assert.equal(r.discountTotal, '100.00');
  const sum = r.lines.reduce((s, l) => s + Math.round(Number(l.discountAmount) * 100), 0);
  assert.equal(sum, 10000);
  const capped = calculate([product], discount({ discountType: 'fixed', value: '500.00' }), []);
  assert.equal(capped.total, '0.00');
});

test('selected-scope discount touches only eligible lines', () => {
  const r = calculate([plan, product], discount({ scope: 'selected', productIds: ['prod-1'] }), []);
  assert.equal(r.lines[0].discountAmount, '0.00');
  assert.equal(r.lines[1].discountAmount, '10.00');
});

test('tax rules honour their target', () => {
  const planOnly = { ...gst, appliesTo: 'plans' as const };
  const productsOnly = { ...gst, appliesTo: 'products' as const };
  assert.equal(calculate([product], null, [planOnly]).taxTotal, '0.00');
  assert.equal(calculate([plan], null, [productsOnly]).taxTotal, '0.00');
  assert.equal(calculate([product], null, [productsOnly]).taxTotal, '18.00');
});

test('discount eligibility rules', () => {
  const on = '2026-06-01';
  assert.equal(discountIneligibleReason(discount(), [plan], on), null);
  assert.match(discountIneligibleReason(discount({ status: 'inactive' }), [plan], on)!, /not active/);
  assert.match(discountIneligibleReason(discount({ endDate: '2026-05-31' }), [plan], on)!, /expired/);
  assert.match(discountIneligibleReason(discount({ startDate: '2026-07-01' }), [plan], on)!, /not started/);
  assert.match(discountIneligibleReason(discount({ usageLimit: 3, usageCount: 3 }), [plan], on)!, /usage limit/);
  assert.match(discountIneligibleReason(discount({ minPurchase: '5000' }), [plan], on)!, /minimum purchase/);
  assert.match(discountIneligibleReason(discount({ minQuantity: 5 }), [plan], on)!, /minimum quantity/);
  assert.match(discountIneligibleReason(discount({ scope: 'selected' }), [plan], on)!, /does not apply/);
});

test('invoice PDF columns do not overlap and fit large amounts on one line', () => {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.font('Helvetica').fontSize(9);
  const needed = doc.widthOfString('99,99,999.99');
  const columns = Object.values(COLS);
  for (const money of [COLS.unit, COLS.disc, COLS.tax, COLS.total]) assert.ok(money.width >= needed, `${money.width} < ${needed}`);
  columns.forEach((col, i) => {
    if (i > 0) assert.ok(col.x >= columns[i - 1].x + columns[i - 1].width, `column ${i} overlaps`);
  });
  const last = columns[columns.length - 1];
  assert.ok(last.x + last.width <= 545, 'stays inside the page margin');
});

test('generated invoice PDF is one valid page for a normal invoice', async () => {
  const line = { description: 'Growth Monthly (monthly)', quantity: 5, unitPrice: '1234567.89', discountAmount: '123456.79', taxAmount: '2000000.00', lineTotal: '8999999.99', taxDetails: [{ name: 'GST 18%', rate: '18.00', amount: '2000000.00' }] };
  const pdf = await buildInvoicePdf(
    { invoiceNumber: 'INV-1', invoiceDate: '2026-01-01', dueDate: '2026-01-16', periodStart: '2026-01-01', periodEnd: '2026-01-31', subscriptionNumber: 'SUB-1', status: 'confirmed', items: [line, line], subtotal: '1', discountTotal: '1', total: '1', amountPaid: '0', outstanding: '1', notes: 'Thanks' },
    { customerName: 'A Customer', companyName: 'A Company', email: 'a@example.test', billingAddress: '1 Road', taxId: 'X' },
    { name: 'Brightloop', address: 'Bengaluru', email: 'b@example.test' },
  );
  const text = pdf.toString('latin1');
  assert.equal(text.slice(0, 5), '%PDF-');
  assert.equal((text.match(/\/Type \/Page\b/g) ?? []).length, 1);
});

test('billing dates clamp to month end without drifting', () => {
  assert.equal(addCycles('2026-01-31', 'monthly', 1), '2026-02-28');
  assert.equal(addCycles('2026-01-31', 'monthly', 2), '2026-03-31');
  assert.equal(addCycles('2024-02-29', 'yearly', 1), '2025-02-28');
  assert.equal(addCycles('2026-12-15', 'monthly', 1), '2027-01-15');
  assert.equal(addCycles('2026-01-01', 'weekly', 2), '2026-01-15');
  assert.equal(addCycles('2026-02-28', 'daily', 1), '2026-03-01');
});
