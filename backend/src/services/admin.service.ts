// Staff, customer and catalogue configuration.
import { withTransaction } from '../config/database.js';
import * as catalog from '../repositories/catalog.repository.js';
import * as customers from '../repositories/customer.repository.js';
import * as users from '../repositories/user.repository.js';
import type { AuthUser } from '../types/index.js';
import { badRequest, conflict, notFound } from '../utils/http.js';
import { audit } from './audit.service.js';
import { hashPassword, issueResetLink, randomPasswordHash } from './auth.service.js';

const found = <T>(value: T | null | undefined, what: string): T => {
  if (!value) throw notFound(what);
  return value;
};

// ---- staff

export async function createStaff(actor: AuthUser, input: any) {
  if (await users.emailExists(input.email)) throw conflict('An account with this email address already exists');
  const profile = found(await users.findProfileByCode(input.profile), 'Permission profile');
  const passwordHash = await hashPassword(input.password);
  return withTransaction(async () => {
    const { id } = await users.insertUser({ role: 'staff', staffProfileId: profile.id, fullName: input.fullName, email: input.email, phone: input.phone, passwordHash, status: input.status });
    await audit(actor, 'staff.created', 'user', id, { email: input.email, profile: input.profile });
    return { id };
  });
}

export async function updateStaff(actor: AuthUser, id: string, input: any) {
  const current = found(await users.findStaffById(id), 'Staff member');
  if (await users.emailExists(input.email, id)) throw conflict('An account with this email address already exists');
  const profile = found(await users.findProfileByCode(input.profile), 'Permission profile');
  await withTransaction(async () => {
    await users.updateUser(id, { full_name: input.fullName, email: input.email, phone: input.phone, staff_profile_id: profile.id, status: input.status });
    await audit(actor, 'staff.updated', 'user', id, { from: { profile: current.profile, status: current.status }, to: { profile: input.profile, status: input.status } });
  });
  return { id };
}

export async function setStaffStatus(actor: AuthUser, id: string, status: string) {
  found(await users.findStaffById(id), 'Staff member');
  await users.updateUser(id, { status });
  await audit(actor, `staff.${status === 'active' ? 'activated' : 'deactivated'}`, 'user', id);
  return { id, status };
}

export async function initiateStaffReset(actor: AuthUser, id: string) {
  const staff = found<any>(await users.findStaffById(id), 'Staff member');
  await issueResetLink(id, staff.email, 'reset');
  await audit(actor, 'staff.password_reset_initiated', 'user', id);
  return { id };
}

export async function updateProfilePermissions(actor: AuthUser, code: string, permissions: string[]) {
  const updated = found(await users.updateProfilePermissions(code, permissions), 'Permission profile');
  await audit(actor, 'staff_profile.permissions_updated', 'staff_profile', code, { permissions });
  return updated;
}

// ---- customers

export async function createCustomer(actor: AuthUser, input: any) {
  if (await users.emailExists(input.email)) throw conflict('An account with this email address already exists');
  const passwordHash = input.password ? await hashPassword(input.password) : await randomPasswordHash();
  const result = await withTransaction(async () => {
    const { id: userId } = await users.insertUser({ role: 'customer', fullName: input.customerName, email: input.email, phone: input.phone, passwordHash, status: input.status });
    const { id } = await customers.insertCustomer({ ...input, userId, createdBy: actor.id });
    await audit(actor, 'customer.created', 'customer', id, { email: input.email });
    return { id, userId };
  });
  // Without a password chosen for them, the customer sets their own through an invitation link.
  if (!input.password) await issueResetLink(result.userId, input.email, 'invite');
  return { id: result.id };
}

export async function getCustomer(id: string) {
  const customer = found(await customers.findCustomerById(id), 'Customer');
  return { ...customer, summary: await customers.customerSummary(id) };
}

export async function updateCustomer(actor: AuthUser, id: string, input: any) {
  const current = found<any>(await customers.findCustomerById(id), 'Customer');
  if (await users.emailExists(input.email, current.userId)) throw conflict('An account with this email address already exists');
  await withTransaction(async () => {
    await customers.updateCustomer(id, input);
    await users.updateUser(current.userId, { full_name: input.customerName, email: input.email, phone: input.phone, status: input.status });
    await audit(actor, 'customer.updated', 'customer', id);
  });
  return { id };
}

export async function setCustomerStatus(actor: AuthUser, id: string, status: string) {
  const current = found<any>(await customers.findCustomerById(id), 'Customer');
  await users.updateUser(current.userId, { status });
  await audit(actor, `customer.${status === 'active' ? 'activated' : 'deactivated'}`, 'customer', id);
  return { id, status };
}

// ---- generic catalogue actions: save a record, keep an audit trail

async function audited<T>(actor: AuthUser, action: string, entity: string, id: string | null, fn: () => Promise<T>) {
  return withTransaction(async () => {
    const result = await fn();
    await audit(actor, action, entity, id ?? (result as any)?.id ?? null);
    return result;
  });
}

const statusAction = (status: string) => (status === 'active' ? 'activated' : 'deactivated');

export const getProduct = async (id: string) => found(await catalog.findProduct(id), 'Product');
export const createProduct = (actor: AuthUser, input: any) => audited(actor, 'product.created', 'product', null, () => catalog.insertProduct(input));
export const updateProduct = async (actor: AuthUser, id: string, input: any) =>
  found(await audited(actor, 'product.updated', 'product', id, () => catalog.updateProduct(id, input)), 'Product');
export const setProductStatus = async (actor: AuthUser, id: string, status: string) =>
  found(await audited(actor, `product.${statusAction(status)}`, 'product', id, () => catalog.setProductStatus(id, status)), 'Product');
export const createVariant = (actor: AuthUser, productId: string, input: any) =>
  audited(actor, 'product.variant_created', 'product', productId, () => catalog.insertVariant(productId, input));
export const updateVariant = async (actor: AuthUser, productId: string, id: string, input: any) =>
  found(await audited(actor, 'product.variant_updated', 'product', productId, () => catalog.updateVariant(productId, id, input)), 'Variant');

export const getPlan = async (id: string) => found(await catalog.findPlan(id), 'Plan');
export const createPlan = (actor: AuthUser, input: any) => audited(actor, 'plan.created', 'plan', null, () => catalog.insertPlan(input));
export const updatePlan = async (actor: AuthUser, id: string, input: any) =>
  found(await audited(actor, 'plan.updated', 'plan', id, () => catalog.updatePlan(id, input)), 'Plan');
export const setPlanStatus = async (actor: AuthUser, id: string, status: string) =>
  found(await audited(actor, `plan.${statusAction(status)}`, 'plan', id, () => catalog.setPlanStatus(id, status)), 'Plan');

export const getTax = async (id: string) => found(await catalog.findTax(id), 'Tax rule');
export const createTax = (actor: AuthUser, input: any) => audited(actor, 'tax.created', 'tax_rule', null, () => catalog.insertTax(input));
export const updateTax = async (actor: AuthUser, id: string, input: any) =>
  found(await audited(actor, 'tax.updated', 'tax_rule', id, () => catalog.updateTax(id, input)), 'Tax rule');
export const setTaxStatus = async (actor: AuthUser, id: string, status: string) =>
  found(await audited(actor, `tax.${statusAction(status)}`, 'tax_rule', id, () => catalog.setTaxStatus(id, status)), 'Tax rule');

export const getDiscount = async (id: string) => found(await catalog.findDiscount(id), 'Discount');
export const createDiscount = (actor: AuthUser, input: any) =>
  audited(actor, 'discount.created', 'discount', null, async () => {
    const created = await catalog.insertDiscount(input);
    await catalog.replaceDiscountTargets(created.id, input.scope === 'selected' ? input.productIds : [], input.scope === 'selected' ? input.planIds : []);
    return created;
  });
export const updateDiscount = async (actor: AuthUser, id: string, input: any) => {
  return found(
    await audited(actor, 'discount.updated', 'discount', id, async () => {
      const updated = await catalog.updateDiscount(id, input);
      if (updated) await catalog.replaceDiscountTargets(id, input.scope === 'selected' ? input.productIds : [], input.scope === 'selected' ? input.planIds : []);
      return updated;
    }),
    'Discount',
  );
};
export const setDiscountStatus = async (actor: AuthUser, id: string, status: string) =>
  found(await audited(actor, `discount.${statusAction(status)}`, 'discount', id, () => catalog.setDiscountStatus(id, status)), 'Discount');

export const getTemplate = async (id: string) => found(await catalog.findTemplate(id), 'Template');
export const createTemplate = (actor: AuthUser, input: any) =>
  audited(actor, 'template.created', 'quotation_template', null, async () => {
    const created = await catalog.insertTemplate(input);
    await catalog.replaceTemplateItems(created.id, input.items);
    return created;
  });
export const updateTemplate = async (actor: AuthUser, id: string, input: any) =>
  found(
    await audited(actor, 'template.updated', 'quotation_template', id, async () => {
      const updated = await catalog.updateTemplate(id, input);
      if (updated) await catalog.replaceTemplateItems(id, input.items);
      return updated;
    }),
    'Template',
  );
export const setTemplateStatus = async (actor: AuthUser, id: string, status: string) =>
  found(await audited(actor, `template.${statusAction(status)}`, 'quotation_template', id, () => catalog.setTemplateStatus(id, status)), 'Template');
export async function duplicateTemplate(actor: AuthUser, id: string) {
  const source = found(await catalog.findTemplate(id), 'Template');
  if (!source.items.length) throw badRequest('This template has no lines to copy');
  return createTemplate(actor, { ...source, name: `${source.name} (copy) ${Date.now().toString(36)}`, status: 'inactive', items: source.items });
}
