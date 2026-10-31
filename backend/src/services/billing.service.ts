import { pool, withTransaction } from '../config/database.js';
import * as billing from '../repositories/billing.repository.js';
import * as catalog from '../repositories/catalog.repository.js';
import { customerContact } from '../repositories/customer.repository.js';
import { findLines, INVOICE_LINES, insertLines, SUBSCRIPTION_LINES } from '../repositories/lineItems.js';
import * as subs from '../repositories/subscription.repository.js';
import { getSetting, nextNumber } from '../repositories/system.repository.js';
import type { AuthUser } from '../types/index.js';
import { calculate, discountIneligibleReason, recalcLineWithStoredTax, toPaise, fromPaise, type DiscountRule, type PricedLine } from '../utils/calculation.js';
import { addCycles, addDays, today } from '../utils/dates.js';
import { badRequest, conflict, notFound } from '../utils/http.js';
import { sendMail } from '../utils/mailer.js';
import { buildInvoicePdf } from '../utils/pdf.js';
import { audit, notifyPermission, notifyUser } from './audit.service.js';
import { expireQuotations } from './quotation.service.js';
import { processExpiries, sendRenewalReminders } from './subscription.service.js';

// ---- discount selection for the next invoice

async function chooseInvoiceDiscount(subscriptionDiscountId: string | null, lines: PricedLine[], onDate: string): Promise<DiscountRule | null> {
  if (subscriptionDiscountId) {
    await catalog.lockDiscount(subscriptionDiscountId);
    const discount = await catalog.findDiscount(subscriptionDiscountId);
    // An expired or exhausted discount simply stops applying; the subscription carries on at full price.
    if (discount && !discountIneligibleReason(discount, lines, onDate)) return discount;
  }
  const candidates = (await catalog.autoApplyCandidates(onDate)).filter((d) => !discountIneligibleReason(d, lines, onDate));
  if (!candidates.length) return null;
  const taxes: never[] = [];
  const best = candidates
    .map((d) => ({ d, saved: toPaise(calculate(lines, d, taxes).discountTotal) }))
    .sort((a, b) => b.saved - a.saved)[0].d;
  await catalog.lockDiscount(best.id);
  const fresh = await catalog.findDiscount(best.id);
  return fresh && !discountIneligibleReason(fresh, lines, onDate) ? fresh : null;
}

// ---- invoice generation

/** Generates the invoice for one due billing period. Row lock plus the unique index make a duplicate impossible. */
export async function generateInvoiceForSubscription(subscriptionId: string, actor: AuthUser | null, onDate = today()): Promise<{ id: string } | null> {
  return withTransaction(async () => {
    const sub = await subs.lockSubscription(subscriptionId);
    if (!sub) throw notFound('Subscription');
    if (sub.status !== 'active' || sub.nextBillingDate > onDate || sub.nextBillingDate >= sub.expiryDate) return null;

    const periodStart: string = sub.nextBillingDate;
    const nextCycle = sub.billedCycles + 1;
    const nextBilling = addCycles(sub.billingAnchorDate, sub.billingFrequency, nextCycle);
    const items = await findLines<any>(SUBSCRIPTION_LINES, sub.id);
    // Agreed subscription prices carry over; discount eligibility and active tax rules are evaluated for this invoice.
    const lines: PricedLine[] = items.map((l) => ({
      itemType: l.itemType,
      productId: l.productId,
      variantId: l.variantId,
      planId: l.planId,
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
    }));
    const discount = await chooseInvoiceDiscount(sub.discountId, lines, onDate);
    const calc = calculate(lines, discount, await catalog.activeTaxRules());
    const settings = await getSetting('billing');

    const { id } = await billing.insertInvoice({
      invoiceNumber: await nextNumber('invoice'),
      customerId: sub.customerId,
      subscriptionId: sub.id,
      invoiceDate: onDate,
      dueDate: addDays(onDate, sub.paymentTermsDays),
      periodStart,
      periodEnd: addDays(nextBilling, -1),
      subtotal: calc.subtotal,
      discountTotal: calc.discountTotal,
      taxTotal: calc.taxTotal,
      total: calc.total,
      notes: settings.invoiceNotes,
      createdBy: actor?.id ?? null,
    });
    await insertLines(INVOICE_LINES, id, calc.lines);
    if (calc.discount) await catalog.insertDiscountUsage(calc.discount.id, id, sub.customerId, calc.discountTotal);
    await subs.advanceBilling(sub.id, nextCycle, nextBilling);
    await audit(actor, 'invoice.generated', 'invoice', id, { subscriptionId: sub.id, periodStart });
    await notifyPermission('invoices.manage', 'Invoice ready for review', `A draft invoice was generated for ${sub.subscriptionNumber}.`, `/app/invoices/${id}`);
    return { id };
  });
}

/** Generates every invoice due today. Each runs in its own transaction, so one failure cannot undo the others. */
export async function generateDueInvoices(actor: AuthUser | null, onDate = today()) {
  let generated = 0;
  let failed = 0;
  const skip = new Set<string>();
  for (;;) {
    const due = (await withTransaction(() => subs.dueForBilling(onDate, 200))).filter((s) => !skip.has(s.id));
    if (!due.length) break;
    for (const { id } of due) {
      try {
        // A subscription that is several cycles behind produces one invoice per loop pass.
        if (await generateInvoiceForSubscription(id, actor, onDate)) generated += 1;
        else skip.add(id);
      } catch (err) {
        console.error(`Invoice generation failed for subscription ${id}:`, err);
        failed += 1;
        skip.add(id);
      }
    }
  }
  return { generated, failed };
}

const BILLING_LOCK_KEY = 727_001;

/** One full scheduled pass. The advisory lock stops overlapping runs, including across server processes. */
export async function runBillingCycle(actor: AuthUser | null = null) {
  const lock = await pool.connect();
  try {
    const { rows } = await lock.query('SELECT pg_try_advisory_lock($1) AS acquired', [BILLING_LOCK_KEY]);
    if (!rows[0].acquired) return { skipped: true, generated: 0, failed: 0, processedExpiries: 0, expiredQuotations: 0, reminders: 0 };
    try {
      const onDate = today();
      const expired = await expireQuotations(onDate);
      // Renew and close first, so a renewed subscription can bill its new period in the same pass.
      const processedExpiries = await processExpiries(onDate);
      const { generated, failed } = await generateDueInvoices(actor, onDate);
      const reminders = await sendRenewalReminders(onDate);
      return { skipped: false, generated, failed, processedExpiries, expiredQuotations: expired.length, reminders };
    } finally {
      await lock.query('SELECT pg_advisory_unlock($1)', [BILLING_LOCK_KEY]);
    }
  } finally {
    lock.release();
  }
}

// ---- invoice lifecycle

export async function getInvoice(id: string, customerId?: string) {
  const invoice = await billing.findInvoice(id, customerId);
  if (!invoice) throw notFound('Invoice');
  // Drafts are internal until they are confirmed.
  if (customerId && invoice.status === 'draft') throw notFound('Invoice');
  const [items, payments] = await Promise.all([
    findLines(INVOICE_LINES, id),
    billing.listPayments({ page: 1, pageSize: 100, invoiceId: id }),
  ]);
  return { ...invoice, items, payments: payments.rows };
}

export async function updateDraftInvoice(actor: AuthUser, id: string, input: { dueDate: string; notes: string | null; lines: any[] }) {
  return withTransaction(async () => {
    const invoice = await billing.lockInvoice(id);
    if (!invoice) throw notFound('Invoice');
    if (invoice.status !== 'draft') throw conflict('Only draft invoices can be edited');
    if (input.dueDate < invoice.invoiceDate) throw badRequest('Due date cannot be before the invoice date');
    const existing = await findLines<any>(INVOICE_LINES, id);
    if (input.lines.length !== existing.length || !existing.every((l) => input.lines.some((n) => n.id === l.id))) {
      throw badRequest('The invoice lines do not match this invoice');
    }
    const updated = existing.map((line) => {
      const edit = input.lines.find((n) => n.id === line.id);
      return { id: line.id, ...recalcLineWithStoredTax({ ...line, description: edit.description, quantity: edit.quantity, unitPrice: edit.unitPrice }) };
    });
    for (const line of updated) await billing.updateInvoiceLine(line.id, line);
    const sum = (key: 'lineSubtotal' | 'discountAmount' | 'taxAmount' | 'lineTotal') => fromPaise(updated.reduce((s, l) => s + toPaise(l[key]), 0));
    await billing.updateInvoiceDraft(id, { dueDate: input.dueDate, notes: input.notes, subtotal: sum('lineSubtotal'), discountTotal: sum('discountAmount'), taxTotal: sum('taxAmount'), total: sum('lineTotal') });
    await audit(actor, 'invoice.updated', 'invoice', id);
    return { id };
  });
}

export async function confirmInvoice(actor: AuthUser, id: string) {
  return withTransaction(async () => {
    const invoice = await billing.lockInvoice(id);
    if (!invoice) throw notFound('Invoice');
    if (invoice.status !== 'draft') throw conflict('Only draft invoices can be confirmed');
    // A zero-value invoice has nothing to collect, so it settles on confirmation.
    await billing.confirmInvoice(id, toPaise(invoice.total) === 0);
    const contact = await customerContact(invoice.customerId);
    await notifyUser(contact!.userId, 'New invoice', `Invoice ${invoice.invoiceNumber} is due on ${invoice.dueDate}.`, `/portal/invoices/${id}`);
    await audit(actor, 'invoice.confirmed', 'invoice', id);
    return { id };
  });
}

export async function cancelInvoice(actor: AuthUser, id: string) {
  return withTransaction(async () => {
    const invoice = await billing.lockInvoice(id);
    if (!invoice) throw notFound('Invoice');
    if (!['draft', 'confirmed'].includes(invoice.status)) throw conflict(`A ${invoice.status} invoice cannot be cancelled`);
    if (toPaise(invoice.amountPaid) > 0) throw conflict('This invoice has payments. Void them before cancelling.');
    await billing.cancelInvoice(id);
    await catalog.releaseDiscountUsage(id);
    await audit(actor, 'invoice.cancelled', 'invoice', id);
    return { id };
  });
}

export async function invoicePdf(id: string, customerId?: string) {
  const invoice = await getInvoice(id, customerId);
  const contact = await customerContact(invoice.customerId);
  return { number: invoice.invoiceNumber, pdf: await buildInvoicePdf(invoice, contact!, await getSetting('company')) };
}

export async function sendInvoice(actor: AuthUser, id: string) {
  const invoice = await billing.findInvoice(id);
  if (!invoice) throw notFound('Invoice');
  if (!['confirmed', 'paid'].includes(invoice.status)) throw conflict('Confirm the invoice before sending it');
  const contact = (await customerContact(invoice.customerId))!;
  await billing.markInvoiceSent(id);
  await audit(actor, 'invoice.sent', 'invoice', id);
  await notifyUser(contact.userId, 'Invoice sent', `Invoice ${invoice.invoiceNumber} has been sent to ${contact.email}.`, `/portal/invoices/${id}`);
  const settings = await getSetting('notifications');
  if (settings.emailInvoiceSent) {
    const { pdf, number } = await invoicePdf(id);
    sendMail({
      to: contact.email,
      subject: `Invoice ${number}`,
      text: `Hello ${contact.customerName},\n\nInvoice ${number} is attached. Amount due: INR ${invoice.outstanding}, by ${invoice.dueDate}.`,
      attachments: [{ filename: `${number}.pdf`, content: pdf }],
    });
  }
  return { id };
}

// ---- payments

export async function recordPayment(actor: AuthUser, input: any) {
  if (input.paymentDate > today()) throw badRequest('Payment date cannot be in the future');
  if (input.idempotencyKey) {
    const existing = await billing.findPaymentByKey(input.idempotencyKey);
    if (existing) return { id: existing.id, duplicate: true };
  }
  const result = await withTransaction(async () => {
    const invoice = await billing.lockInvoice(input.invoiceId);
    if (!invoice) throw notFound('Invoice');
    if (invoice.status !== 'confirmed') throw conflict(invoice.status === 'draft' ? 'Confirm the invoice before recording a payment' : `This invoice is ${invoice.status}`);
    if (input.paymentDate < invoice.invoiceDate) throw badRequest('Payment date cannot be before the invoice date');
    if (toPaise(input.amount) > toPaise(invoice.outstanding)) throw badRequest(`Payment exceeds the outstanding balance of ${invoice.outstanding}`);
    const { id } = await billing.insertPayment({
      ...input,
      paymentReference: await nextNumber('payment'),
      customerId: invoice.customerId,
      recordedBy: actor.id,
    });
    const balance = await billing.syncInvoicePayments(input.invoiceId);
    await audit(actor, 'payment.recorded', 'payment', id, { invoiceId: input.invoiceId, amount: input.amount });
    const contact = await customerContact(invoice.customerId);
    await notifyUser(contact!.userId, 'Payment received', `We received INR ${input.amount} for invoice ${invoice.invoiceNumber}.`, `/portal/invoices/${invoice.id}`);
    return { id, invoiceNumber: invoice.invoiceNumber, contact, balance };
  });
  const settings = await getSetting('notifications');
  if (settings.emailPaymentReceived) {
    sendMail({
      to: result.contact!.email,
      subject: `Payment received for ${result.invoiceNumber}`,
      text: `Hello ${result.contact!.customerName},\n\nWe received your payment of INR ${input.amount} for invoice ${result.invoiceNumber}. Remaining balance: INR ${result.balance.outstanding}.`,
    });
  }
  return { id: result.id, invoiceStatus: result.balance.status, outstanding: result.balance.outstanding };
}

export async function voidPayment(actor: AuthUser, id: string, reason: string) {
  return withTransaction(async () => {
    const payment = await billing.lockPayment(id);
    if (!payment) throw notFound('Payment');
    await billing.lockInvoice(payment.invoiceId);
    if (payment.status !== 'completed') throw conflict('This payment has already been voided');
    await billing.voidPayment(id, reason);
    await billing.syncInvoicePayments(payment.invoiceId);
    await audit(actor, 'payment.voided', 'payment', id, { reason });
    return { id };
  });
}

export async function getPayment(id: string, customerId?: string) {
  const payment = await billing.findPayment(id, customerId);
  if (!payment) throw notFound('Payment');
  return payment;
}
