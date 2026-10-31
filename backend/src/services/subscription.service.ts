import { withTransaction } from '../config/database.js';
import * as catalog from '../repositories/catalog.repository.js';
import { customerContact } from '../repositories/customer.repository.js';
import { deleteLines, findLines, insertLines, SUBSCRIPTION_LINES } from '../repositories/lineItems.js';
import { findRequest, resolveRequest } from '../repositories/quotation.repository.js';
import * as repo from '../repositories/subscription.repository.js';
import { getSetting, nextNumber } from '../repositories/system.repository.js';
import type { AuthUser } from '../types/index.js';
import { calculate, type PricedLine } from '../utils/calculation.js';
import { addCycles, addDays, diffDays, today, type Frequency } from '../utils/dates.js';
import { badRequest, conflict, notFound } from '../utils/http.js';
import { sendMail } from '../utils/mailer.js';
import { audit, notifyPermission, notifyUser } from './audit.service.js';
import { generateInvoiceForSubscription } from './billing.service.js';
import { priceCatalogLines, priceDocument, requireSinglePlan } from './pricing.service.js';

export type TransitionAction = 'send_quotation' | 'confirm' | 'activate' | 'pause' | 'resume' | 'close';

/** The lifecycle: Draft -> Quotation -> Confirmed -> Active -> Closed, with Active <-> Paused. */
const TRANSITIONS: Record<TransitionAction, { from: string[]; to: string }> = {
  send_quotation: { from: ['draft'], to: 'quotation' },
  confirm: { from: ['quotation'], to: 'confirmed' },
  activate: { from: ['confirmed'], to: 'active' },
  pause: { from: ['active'], to: 'paused' },
  resume: { from: ['paused'], to: 'active' },
  close: { from: ['draft', 'quotation', 'confirmed', 'active', 'paused'], to: 'closed' },
};

export async function getSubscription(id: string, customerId?: string) {
  const subscription = await repo.findSubscription(id, customerId);
  if (!subscription) throw notFound('Subscription');
  // A customer only sees a subscription once it has been agreed.
  if (customerId && ['draft', 'quotation'].includes(subscription.status)) throw notFound('Subscription');
  const [items, history, renewals] = await Promise.all([findLines(SUBSCRIPTION_LINES, id), repo.listHistory(id), repo.listRenewals(id)]);
  return { ...subscription, items, history, renewals };
}

async function documentFields(input: any) {
  const planLine = requireSinglePlan(input.lines);
  const plan = await catalog.findPlan(planLine.planId!);
  if (!plan) throw badRequest('The selected plan does not exist');
  const calc = await priceDocument(input.lines, input.discountId, input.startDate);
  const expiryDate = input.expiryDate || addCycles(input.startDate, plan.billingFrequency, plan.termCycles);
  if (expiryDate <= input.startDate) throw badRequest('Expiry date must be after the start date');
  const billing = await getSetting('billing');
  return {
    calc,
    fields: {
      planId: plan.id,
      discountId: calc.discount?.id ?? null,
      billingFrequency: plan.billingFrequency,
      startDate: input.startDate,
      expiryDate,
      paymentTermsDays: input.paymentTermsDays ?? billing.defaultPaymentTermsDays ?? 15,
      subtotal: calc.subtotal,
      discountTotal: calc.discountTotal,
      taxTotal: calc.taxTotal,
      total: calc.total,
      notes: input.notes,
    },
  };
}

export async function createSubscription(actor: AuthUser, input: any) {
  const { calc, fields } = await documentFields(input);
  return withTransaction(async () => {
    const { id } = await repo.insertSubscription({
      ...fields,
      subscriptionNumber: await nextNumber('subscription'),
      customerId: input.customerId,
      status: 'draft',
      createdBy: actor.id,
    });
    await insertLines(SUBSCRIPTION_LINES, id, calc.lines);
    await repo.insertHistory(id, null, 'draft', 'Subscription created', actor.id);
    await audit(actor, 'subscription.created', 'subscription', id);
    return { id };
  });
}

export async function updateSubscription(actor: AuthUser, id: string, input: any) {
  const { calc, fields } = await documentFields(input);
  return withTransaction(async () => {
    const current = await repo.lockSubscription(id);
    if (!current) throw notFound('Subscription');
    if (!['draft', 'quotation'].includes(current.status)) throw conflict('Only draft or quotation subscriptions can be edited');
    await repo.updateSubscriptionDocument(id, fields);
    await deleteLines(SUBSCRIPTION_LINES, id);
    await insertLines(SUBSCRIPTION_LINES, id, calc.lines);
    await audit(actor, 'subscription.updated', 'subscription', id);
    return { id };
  });
}

export async function transition(actor: AuthUser, id: string, action: TransitionAction, reason?: string | null) {
  const result = await withTransaction(async () => {
    const current = await repo.lockSubscription(id);
    if (!current) throw notFound('Subscription');
    const rule = TRANSITIONS[action];
    if (!rule.from.includes(current.status)) throw conflict(`A ${current.status} subscription cannot be moved to ${rule.to}`);
    const plan = await catalog.findPlan(current.planId);
    const onDate = today();
    const state: Parameters<typeof repo.setSubscriptionState>[1] = { status: rule.to };

    if (action === 'activate') {
      state.activatedAt = true;
    }
    if (action === 'pause') {
      if (!plan.allowPause) throw conflict(`${plan.name} does not allow pausing`);
      state.pausedAt = onDate;
    }
    if (action === 'resume') {
      // Paused time is not billed: every future date moves forward by the length of the pause.
      const days = Math.max(0, diffDays(onDate, current.pausedAt ?? onDate));
      state.expiryDate = addDays(current.expiryDate, days);
      state.anchor = addDays(current.billingAnchorDate, days);
      state.nextBillingDate = addDays(current.nextBillingDate, days);
    }
    if (action === 'close') {
      if (['active', 'paused'].includes(current.status) && !plan.allowEarlyClose && current.expiryDate > onDate) {
        throw conflict(`${plan.name} does not allow early closure`);
      }
      state.closed = true;
      state.closeReason = reason ?? null;
    }

    await repo.setSubscriptionState(id, state);
    await repo.insertHistory(id, current.status, rule.to, reason ?? null, actor.id);
    await audit(actor, `subscription.${action}`, 'subscription', id, { from: current.status, to: rule.to });
    const contact = await customerContact(current.customerId);
    if (['activate', 'pause', 'resume', 'close'].includes(action)) {
      await notifyUser(contact!.userId, 'Subscription updated', `${current.subscriptionNumber} is now ${rule.to}.`, `/portal/subscriptions/${id}`);
    }
    return { id, status: rule.to };
  });
  // Bill immediately when activation makes a period due. The scheduler would otherwise do this on its next run.
  if (action === 'activate') await generateInvoiceForSubscription(id, actor).catch((err) => console.error(err));
  return result;
}

async function applyRenewal(current: { id: string; expiryDate: string; billingFrequency: Frequency; subscriptionNumber: string; customerId: string }, termCycles: number, type: 'auto' | 'manual', actor: AuthUser | null) {
  // A late renewal continues from the old expiry date, so no billing period is skipped.
  const newExpiry = addCycles(current.expiryDate, current.billingFrequency, termCycles);
  await repo.extendExpiry(current.id, newExpiry);
  await repo.insertRenewal(current.id, current.expiryDate, newExpiry, type, actor?.id ?? null);
  await repo.insertHistory(current.id, 'active', 'active', `${type === 'auto' ? 'Automatically renewed' : 'Renewed'} until ${newExpiry}`, actor?.id ?? null);
  await audit(actor, 'subscription.renewed', 'subscription', current.id, { type, previousExpiry: current.expiryDate, newExpiry });
  const contact = await customerContact(current.customerId);
  await notifyUser(contact!.userId, 'Subscription renewed', `${current.subscriptionNumber} now runs until ${newExpiry}.`, `/portal/subscriptions/${current.id}`);
  return newExpiry;
}

export async function renewSubscription(actor: AuthUser, id: string) {
  return withTransaction(async () => {
    const current = await repo.lockSubscription(id);
    if (!current) throw notFound('Subscription');
    if (current.status !== 'active') throw conflict('Only active subscriptions can be renewed');
    const plan = await catalog.findPlan(current.planId);
    if (plan.renewalMode === 'none') throw conflict(`${plan.name} does not allow renewal`);
    return { id, expiryDate: await applyRenewal(current, plan.termCycles, 'manual', actor) };
  });
}

/** Applies each plan's expiry rule: auto renew, or close. Manual-renewal plans wait for staff on the Renewals page. */
export async function processExpiries(onDate = today()) {
  let processed = 0;
  for (;;) {
    const handled = await withTransaction(async () => {
      const batch = await repo.dueForExpiry(onDate, 100);
      for (const sub of batch) {
        if (sub.renewalMode === 'auto') {
          await applyRenewal(sub, sub.termCycles, 'auto', null);
        } else {
          await repo.setSubscriptionState(sub.id, { status: 'closed', closed: true, closeReason: 'Closed automatically at the end of the plan period' });
          await repo.insertHistory(sub.id, 'active', 'closed', 'Closed automatically at the end of the plan period', null);
          await audit(null, 'subscription.auto_closed', 'subscription', sub.id);
        }
      }
      return batch.length;
    });
    processed += handled;
    if (handled < 100) return processed;
  }
}

export async function sendRenewalReminders(onDate = today()) {
  const billing = await getSetting('billing');
  const notifications = await getSetting('notifications');
  const due = await repo.dueForReminder(onDate, billing.expiringSoonDays ?? 30);
  for (const sub of due) {
    const contact = await customerContact(sub.customerId);
    await notifyUser(contact!.userId, 'Subscription expiring soon', `${sub.subscriptionNumber} expires on ${sub.expiryDate}.`, `/portal/subscriptions/${sub.id}`);
    if (notifications.emailRenewalReminder) {
      sendMail({ to: contact!.email, subject: `${sub.subscriptionNumber} expires on ${sub.expiryDate}`, text: `Hello ${contact!.customerName},\n\nYour subscription ${sub.subscriptionNumber} expires on ${sub.expiryDate}.` });
    }
    await repo.markReminded(sub.id, sub.expiryDate);
  }
  return due.length;
}

/** Approving an add-on changes the subscription from its next invoice onward; invoices already issued stay as they are. */
export async function approveAddon(actor: AuthUser, requestId: string) {
  return withTransaction(async () => {
    const request = await findRequest(requestId);
    if (!request || request.requestType !== 'addon') throw notFound('Add-on request');
    if (request.status !== 'pending') throw conflict('This request has already been handled');
    const sub = await repo.lockSubscription(request.subscriptionId);
    if (!sub || !['active', 'paused', 'confirmed'].includes(sub.status)) throw conflict('Add-ons can only be added to a live subscription');

    const { lines: priced } = await priceCatalogLines([{ itemType: 'product', productId: request.productId, variantId: request.variantId, quantity: request.productQuantity ?? 1 } as any]);
    const existing = await findLines<any>(SUBSCRIPTION_LINES, sub.id);
    const taxRules = await catalog.activeTaxRules();
    const addonCalc = calculate(priced, null, taxRules);
    await insertLines(SUBSCRIPTION_LINES, sub.id, addonCalc.lines, existing.length);

    const allLines: PricedLine[] = [...existing, ...priced];
    const discount = sub.discountId ? await catalog.findDiscount(sub.discountId) : null;
    const totals = calculate(allLines, discount, taxRules);
    await repo.updateSubscriptionTotals(sub.id, totals);
    await resolveRequest(requestId, 'approved', actor.id);
    await repo.insertHistory(sub.id, sub.status, sub.status, `Add-on approved: ${priced[0].description} x ${priced[0].quantity}`, actor.id);
    await audit(actor, 'subscription.addon_approved', 'subscription', sub.id, { requestId });
    const contact = await customerContact(sub.customerId);
    await notifyUser(contact!.userId, 'Add-on approved', `${priced[0].description} will appear from your next invoice on ${sub.subscriptionNumber}.`, `/portal/subscriptions/${sub.id}`);
    return { id: sub.id };
  });
}

export async function declineRequest(actor: AuthUser, requestId: string, note: string | null) {
  return withTransaction(async () => {
    const request = await findRequest(requestId);
    if (!request) throw notFound('Request');
    const updated = await resolveRequest(requestId, 'declined', actor.id, { note });
    if (!updated) throw conflict('This request has already been handled');
    await audit(actor, 'request.declined', 'quotation_request', requestId);
    const contact = await customerContact(request.customerId);
    await notifyUser(contact!.userId, 'Request declined', note ?? 'Your request could not be approved. Please contact your account manager.', '/portal/quotations');
    return { id: requestId };
  });
}

export const nextSubscriptionNumber = () => nextNumber('subscription');
export { notifyPermission };
