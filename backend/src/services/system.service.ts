import { withTransaction } from '../config/database.js';
import * as catalog from '../repositories/catalog.repository.js';
import { findRequest, insertRequest } from '../repositories/quotation.repository.js';
import { findSubscription } from '../repositories/subscription.repository.js';
import * as system from '../repositories/system.repository.js';
import type { AuthUser } from '../types/index.js';
import { today } from '../utils/dates.js';
import { badRequest, forbidden, notFound } from '../utils/http.js';
import { audit, notifyPermission } from './audit.service.js';

const can = (user: AuthUser, permission: string) => user.role === 'admin' || user.permissions.includes(permission);

/** Searches only the record types the user may see. Customers are served their own lists by the portal. */
export async function globalSearch(user: AuthUser, term: string) {
  if (user.role === 'customer') throw forbidden();
  const like = `%${term.replace(/[\\%_]/g, '\\$&')}%`;
  const [customers, quotations, subscriptions, invoices, payments] = await Promise.all([
    can(user, 'customers.view') ? system.searchCustomers(like) : [],
    can(user, 'quotations.view') ? system.searchQuotations(like) : [],
    can(user, 'subscriptions.view') ? system.searchSubscriptions(like) : [],
    can(user, 'invoices.view') ? system.searchInvoices(like) : [],
    can(user, 'payments.view') ? system.searchPayments(like) : [],
  ]);
  return { customers, quotations, subscriptions, invoices, payments };
}

export async function getSettings() {
  const [rows, sequences] = await Promise.all([system.getAllSettings(), system.listSequences()]);
  return { ...Object.fromEntries(rows.map((r: any) => [r.key, r.value])), sequences };
}

export async function saveSettings(actor: AuthUser, key: string, value: unknown) {
  await system.saveSetting(key, value);
  await audit(actor, 'settings.updated', 'settings', key);
}

export async function saveSequence(actor: AuthUser, code: string, input: { prefix: string; nextValue: number; padding: number }) {
  const updated = await system.updateSequence(code, input.prefix, input.nextValue, input.padding);
  if (!updated) throw notFound('Number sequence');
  await audit(actor, 'settings.sequence_updated', 'settings', code, input);
}

export async function publicInfo() {
  const company = await system.getSetting('company');
  return { name: company.name, email: company.email, website: company.website };
}

export const availablePlans = () => catalog.listAvailablePlans(today());

const withoutCost = (product: any) => {
  const { costPrice: _hidden, ...rest } = product;
  return rest;
};

export async function portalCatalog() {
  const [plans, products] = await Promise.all([availablePlans(), catalog.listProducts({ page: 1, pageSize: 100, status: 'active' })]);
  return { plans, products: products.rows.map(withoutCost) };
}

export async function portalAddons() {
  const products = await catalog.listProducts({ page: 1, pageSize: 100, status: 'active', isAddon: 'true' });
  return products.rows.map(withoutCost);
}

export async function createCustomerRequest(user: AuthUser, input: any) {
  const customerId = user.customerId!;
  if (input.requestType === 'quotation') {
    const plans = await availablePlans();
    const plan = plans.find((p: any) => p.id === input.planId);
    if (!plan) throw badRequest('This plan is not currently available');
    if (input.planQuantity < plan.minQuantity) throw badRequest(`${plan.name} has a minimum quantity of ${plan.minQuantity}`);
  } else {
    // Ownership comes from the session: another customer's subscription reads as not found.
    const subscription = await findSubscription(input.subscriptionId, customerId);
    if (!subscription) throw notFound('Subscription');
    if (!['active', 'paused', 'confirmed'].includes(subscription.status)) throw badRequest('Add-ons can only be requested for a live subscription');
    const product: any = await catalog.findProduct(input.productId);
    if (!product || product.status !== 'active' || !product.isAddon) throw badRequest('This add-on is not available');
  }
  if (input.productId) {
    const product: any = await catalog.findProduct(input.productId);
    if (!product || product.status !== 'active') throw badRequest('This product is not available');
    if (input.variantId && !product.variants.some((v: any) => v.id === input.variantId && v.status === 'active')) {
      throw badRequest('This variant is not available for the selected product');
    }
  }
  return withTransaction(async () => {
    const { id } = await insertRequest(customerId, input);
    await audit(user, input.requestType === 'addon' ? 'request.addon_created' : 'request.quotation_created', 'quotation_request', id);
    const inbox = input.requestType === 'addon' ? 'subscriptions.manage' : 'quotations.manage';
    const link = input.requestType === 'addon' ? '/app/renewals' : '/app/quotations?tab=requests';
    await notifyPermission(inbox, input.requestType === 'addon' ? 'New add-on request' : 'New quotation request', `A customer submitted a request.`, link);
    return { id };
  });
}

export const getRequest = async (id: string) => {
  const request = await findRequest(id);
  if (!request) throw notFound('Request');
  return request;
};
