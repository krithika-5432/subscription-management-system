import { withTransaction } from '../config/database.js';
import * as catalog from '../repositories/catalog.repository.js';
import { customerContact, findCustomerById } from '../repositories/customer.repository.js';
import { deleteLines, findLines, insertLines, QUOTATION_LINES, SUBSCRIPTION_LINES } from '../repositories/lineItems.js';
import * as repo from '../repositories/quotation.repository.js';
import { insertHistory, insertSubscription } from '../repositories/subscription.repository.js';
import { getSetting, nextNumber } from '../repositories/system.repository.js';
import type { AuthUser } from '../types/index.js';
import { addCycles, addDays, today } from '../utils/dates.js';
import { badRequest, conflict, notFound } from '../utils/http.js';
import { sendMail } from '../utils/mailer.js';
import { buildQuotationPdf } from '../utils/pdf.js';
import { audit, notifyPermission, notifyUser } from './audit.service.js';
import { priceDocument, requireSinglePlan } from './pricing.service.js';

export const preview = (input: { lines: any[]; discountId?: string | null }) => priceDocument(input.lines, input.discountId);

export async function getQuotation(id: string, customerId?: string) {
  const quotation = await repo.findQuotation(id, customerId);
  if (!quotation) throw notFound('Quotation');
  // A customer's portal view must not disclose unsent drafts.
  if (customerId && quotation.status === 'draft') throw notFound('Quotation');
  return { ...quotation, items: await findLines(QUOTATION_LINES, id) };
}

function assertDates(quotationDate: string, expiryDate: string) {
  if (expiryDate < quotationDate) throw badRequest('Expiry date must be on or after the quotation date');
}

export async function createQuotation(actor: AuthUser, input: any) {
  requireSinglePlan(input.lines);
  const quotationDate = input.quotationDate ?? today();
  assertDates(quotationDate, input.expiryDate);
  if (!(await findCustomerById(input.customerId))) throw badRequest('The selected customer does not exist');
  const calc = await priceDocument(input.lines, input.discountId, quotationDate);
  return withTransaction(async () => {
    const { id } = await repo.insertQuotation({ ...input, quotationDate, quotationNumber: await nextNumber('quotation'), createdBy: actor.id }, calc);
    await insertLines(QUOTATION_LINES, id, calc.lines);
    if (input.requestId) {
      const resolved = await repo.resolveRequest(input.requestId, 'quoted', actor.id, { quotationId: id });
      if (!resolved) throw conflict('This quotation request has already been handled');
    }
    await audit(actor, 'quotation.created', 'quotation', id);
    return { id };
  });
}

export async function updateQuotation(actor: AuthUser, id: string, input: any) {
  requireSinglePlan(input.lines);
  const quotationDate = input.quotationDate ?? today();
  assertDates(quotationDate, input.expiryDate);
  const calc = await priceDocument(input.lines, input.discountId, quotationDate);
  return withTransaction(async () => {
    const current = await repo.lockQuotation(id);
    if (!current) throw notFound('Quotation');
    if (current.status !== 'draft') throw conflict('Only draft quotations can be edited');
    await repo.updateQuotation(id, { ...input, quotationDate }, calc);
    await deleteLines(QUOTATION_LINES, id);
    await insertLines(QUOTATION_LINES, id, calc.lines);
    await audit(actor, 'quotation.updated', 'quotation', id);
    return { id };
  });
}

export async function deleteQuotation(actor: AuthUser, id: string) {
  await withTransaction(async () => {
    const current = await repo.lockQuotation(id);
    if (!current) throw notFound('Quotation');
    if (current.status !== 'draft') throw conflict('Only draft quotations can be deleted');
    await repo.deleteDraftQuotation(id);
    await audit(actor, 'quotation.deleted', 'quotation', id, { number: current.quotationNumber });
  });
}

export async function sendQuotation(actor: AuthUser, id: string) {
  const quotation = await withTransaction(async () => {
    const current = await repo.lockQuotation(id);
    if (!current) throw notFound('Quotation');
    if (current.status !== 'draft') throw conflict('Only draft quotations can be sent');
    if (current.expiryDate < today()) throw badRequest('The expiry date has passed. Update it before sending.');
    await repo.setQuotationStatus(id, 'sent');
    const contact = (await customerContact(current.customerId))!;
    await notifyUser(contact.userId, 'New quotation received', `Quotation ${current.quotationNumber} is ready for your review.`, `/portal/quotations/${id}`);
    await audit(actor, 'quotation.sent', 'quotation', id);
    return { ...current, contact };
  });
  const settings = await getSetting('notifications');
  if (settings.emailQuotationSent) {
    const full = await getQuotation(id);
    sendMail({
      to: quotation.contact.email,
      subject: `Quotation ${quotation.quotationNumber}`,
      text: `Hello ${quotation.contact.customerName},\n\nYour quotation ${quotation.quotationNumber} is attached. It is valid until ${quotation.expiryDate}. You can accept or reject it in your customer portal.`,
      attachments: [{ filename: `${quotation.quotationNumber}.pdf`, content: await buildQuotationPdf(full, quotation.contact, await getSetting('company')) }],
    });
  }
  return { id };
}

/** Accept or reject, callable only with the customer's own id taken from the verified session. */
export async function respondToQuotation(actor: AuthUser, id: string, accept: boolean, reason?: string | null) {
  return withTransaction(async () => {
    const current = await repo.lockQuotation(id, actor.customerId!);
    if (!current || current.status === 'draft') throw notFound('Quotation');
    if (current.status !== 'sent') throw conflict(`This quotation has already been ${current.status}`);
    if (current.expiryDate < today()) {
      await repo.setQuotationStatus(id, 'expired');
      return { id, status: 'expired' };
    }
    const status = accept ? 'accepted' : 'rejected';
    await repo.setQuotationStatus(id, status, { reason });
    await audit(actor, `quotation.${status}`, 'quotation', id);
    await notifyPermission('quotations.view', `Quotation ${status}`, `${current.quotationNumber} was ${status} by the customer.`, `/app/quotations/${id}`);
    return { id, status };
  });
}

export async function convertToSubscription(actor: AuthUser, id: string, input: { startDate?: string | null }) {
  return withTransaction(async () => {
    const quotation = await repo.lockQuotation(id);
    if (!quotation) throw notFound('Quotation');
    if (quotation.status !== 'accepted') throw conflict('Only accepted quotations can be converted');
    const existing = await repo.findQuotation(id);
    if (existing.subscriptionId) throw conflict('This quotation has already been converted');

    const lines = await findLines<any>(QUOTATION_LINES, id);
    const planLine = lines.find((l) => l.itemType === 'plan');
    if (!planLine) throw badRequest('This quotation has no subscription plan');
    const plan = await catalog.findPlan(planLine.planId);

    const startDate = input.startDate || today();
    const billing = await getSetting('billing');
    const { id: subscriptionId } = await insertSubscription({
      subscriptionNumber: await nextNumber('subscription'),
      customerId: quotation.customerId,
      planId: plan.id,
      quotationId: id,
      discountId: quotation.discountId,
      billingFrequency: plan.billingFrequency,
      startDate,
      expiryDate: addCycles(startDate, plan.billingFrequency, plan.termCycles),
      paymentTermsDays: billing.defaultPaymentTermsDays ?? 15,
      subtotal: quotation.subtotal,
      discountTotal: quotation.discountTotal,
      taxTotal: quotation.taxTotal,
      total: quotation.total,
      status: 'confirmed',
      createdBy: actor.id,
    });
    await insertLines(SUBSCRIPTION_LINES, subscriptionId, lines);
    await insertHistory(subscriptionId, 'quotation', 'confirmed', `Created from quotation ${quotation.quotationNumber}`, actor.id);
    await audit(actor, 'quotation.converted', 'quotation', id, { subscriptionId });
    await notifyPermission('subscriptions.manage', 'Subscription awaiting activation', `A subscription was created from ${quotation.quotationNumber}.`, `/app/subscriptions/${subscriptionId}`);
    return { subscriptionId };
  });
}

export const expireQuotations = (onDate = today()) => repo.expireSentQuotations(onDate);

/** Pre-fills a quotation form from a template: sales staff get its lines, terms and validity. */
export async function templateDefaults(templateId: string) {
  const template = await catalog.findTemplate(templateId);
  if (!template) throw notFound('Template');
  return { ...template, expiryDate: addDays(today(), template.validityDays) };
}

export async function quotationPdf(id: string, customerId?: string) {
  const quotation = await getQuotation(id, customerId);
  const contact = await customerContact(quotation.customerId);
  return { number: quotation.quotationNumber, pdf: await buildQuotationPdf(quotation, contact!, await getSetting('company')) };
}
