import type { Request, Response } from 'express';
import { z } from 'zod';
import * as catalog from '../repositories/catalog.repository.js';
import * as customers from '../repositories/customer.repository.js';
import { listAudit } from '../repositories/system.repository.js';
import * as users from '../repositories/user.repository.js';
import * as admin from '../services/admin.service.js';
import * as system from '../services/system.service.js';
import { ASSIGNABLE_PERMISSIONS } from '../types/index.js';
import { badRequest, ok, okPage, pagingSchema, param } from '../utils/http.js';
import * as v from '../validators/catalog.validators.js';
import { statusBody } from '../validators/common.js';

const q = <T extends z.ZodRawShape>(shape: T) => pagingSchema.extend(shape);
const opt = z.string().max(100).optional();

const id = (req: Request) => param(req.params.id);
const statusOf = (req: Request) => statusBody.parse(req.body).status;

// staff
export const listStaff = async (req: Request, res: Response) => okPage(res, await users.listStaff(q({ status: opt, profile: opt }).parse(req.query)));
export const getStaff = async (req: Request, res: Response) => ok(res, await users.findStaffById(id(req)).then((s) => s ?? Promise.reject(badRequest('Staff member not found'))));
export const createStaff = async (req: Request, res: Response) => ok(res, await admin.createStaff(req.user!, v.staffCreateSchema.parse(req.body)), 201);
export const updateStaff = async (req: Request, res: Response) => ok(res, await admin.updateStaff(req.user!, id(req), v.staffUpdateSchema.parse(req.body)));
export const setStaffStatus = async (req: Request, res: Response) => ok(res, await admin.setStaffStatus(req.user!, id(req), statusOf(req)));
export const resetStaffPassword = async (req: Request, res: Response) => ok(res, await admin.initiateStaffReset(req.user!, id(req)));
export const listProfiles = async (_req: Request, res: Response) => ok(res, { profiles: await users.listProfiles(), available: ASSIGNABLE_PERMISSIONS });
export const updateProfile = async (req: Request, res: Response) =>
  ok(res, await admin.updateProfilePermissions(req.user!, param(req.params.code), v.profilePermissionsSchema.parse(req.body).permissions));

// customers
export const listCustomers = async (req: Request, res: Response) => okPage(res, await customers.listCustomers(q({ status: opt, from: opt, to: opt }).parse(req.query)));
export const getCustomer = async (req: Request, res: Response) => ok(res, await admin.getCustomer(id(req)));
export const createCustomer = async (req: Request, res: Response) => ok(res, await admin.createCustomer(req.user!, v.customerCreateSchema.parse(req.body)), 201);
export const updateCustomer = async (req: Request, res: Response) => ok(res, await admin.updateCustomer(req.user!, id(req), v.customerUpdateSchema.parse(req.body)));
export const setCustomerStatus = async (req: Request, res: Response) => ok(res, await admin.setCustomerStatus(req.user!, id(req), statusOf(req)));

// products
export const listProducts = async (req: Request, res: Response) => okPage(res, await catalog.listProducts(q({ status: opt, productType: opt, isAddon: opt }).parse(req.query)));
export const getProduct = async (req: Request, res: Response) => ok(res, await admin.getProduct(id(req)));
export const createProduct = async (req: Request, res: Response) => ok(res, await admin.createProduct(req.user!, v.productSchema.parse(req.body)), 201);
export const updateProduct = async (req: Request, res: Response) => ok(res, await admin.updateProduct(req.user!, id(req), v.productSchema.parse(req.body)));
export const setProductStatus = async (req: Request, res: Response) => ok(res, await admin.setProductStatus(req.user!, id(req), statusOf(req)));
export const createVariant = async (req: Request, res: Response) => ok(res, await admin.createVariant(req.user!, id(req), v.variantSchema.parse(req.body)), 201);
export const updateVariant = async (req: Request, res: Response) =>
  ok(res, await admin.updateVariant(req.user!, id(req), param(req.params.variantId), v.variantSchema.parse(req.body)));

// plans
export const listPlans = async (req: Request, res: Response) => okPage(res, await catalog.listPlans(q({ status: opt, billingFrequency: opt }).parse(req.query)));
export const getPlan = async (req: Request, res: Response) => ok(res, await admin.getPlan(id(req)));
export const createPlan = async (req: Request, res: Response) => ok(res, await admin.createPlan(req.user!, v.planSchema.parse(req.body)), 201);
export const updatePlan = async (req: Request, res: Response) => ok(res, await admin.updatePlan(req.user!, id(req), v.planSchema.parse(req.body)));
export const setPlanStatus = async (req: Request, res: Response) => ok(res, await admin.setPlanStatus(req.user!, id(req), statusOf(req)));

// taxes
export const listTaxes = async (req: Request, res: Response) => okPage(res, await catalog.listTaxes(q({ status: opt }).parse(req.query)));
export const getTax = async (req: Request, res: Response) => ok(res, await admin.getTax(id(req)));
export const createTax = async (req: Request, res: Response) => ok(res, await admin.createTax(req.user!, v.taxSchema.parse(req.body)), 201);
export const updateTax = async (req: Request, res: Response) => ok(res, await admin.updateTax(req.user!, id(req), v.taxSchema.parse(req.body)));
export const setTaxStatus = async (req: Request, res: Response) => ok(res, await admin.setTaxStatus(req.user!, id(req), statusOf(req)));

// discounts
export const listDiscounts = async (req: Request, res: Response) => okPage(res, await catalog.listDiscounts(q({ status: opt, discountType: opt }).parse(req.query)));
export const getDiscount = async (req: Request, res: Response) => ok(res, await admin.getDiscount(id(req)));
export const createDiscount = async (req: Request, res: Response) => ok(res, await admin.createDiscount(req.user!, v.discountSchema.parse(req.body)), 201);
export const updateDiscount = async (req: Request, res: Response) => ok(res, await admin.updateDiscount(req.user!, id(req), v.discountSchema.parse(req.body)));
export const setDiscountStatus = async (req: Request, res: Response) => ok(res, await admin.setDiscountStatus(req.user!, id(req), statusOf(req)));

// templates
export const listTemplates = async (req: Request, res: Response) => okPage(res, await catalog.listTemplates(q({ status: opt }).parse(req.query)));
export const getTemplate = async (req: Request, res: Response) => ok(res, await admin.getTemplate(id(req)));
export const createTemplate = async (req: Request, res: Response) => ok(res, await admin.createTemplate(req.user!, v.templateSchema.parse(req.body)), 201);
export const updateTemplate = async (req: Request, res: Response) => ok(res, await admin.updateTemplate(req.user!, id(req), v.templateSchema.parse(req.body)));
export const setTemplateStatus = async (req: Request, res: Response) => ok(res, await admin.setTemplateStatus(req.user!, id(req), statusOf(req)));
export const duplicateTemplate = async (req: Request, res: Response) => ok(res, await admin.duplicateTemplate(req.user!, id(req)), 201);

// settings, audit
export const getSettings = async (_req: Request, res: Response) => ok(res, await system.getSettings());
export const saveSettings = async (req: Request, res: Response) => {
  const key = param(req.params.key) as keyof typeof v.settingsSchemas;
  const schema = v.settingsSchemas[key];
  if (!schema) throw badRequest('Unknown settings group');
  await system.saveSettings(req.user!, key, schema.parse(req.body));
  ok(res, await system.getSettings());
};
export const saveSequence = async (req: Request, res: Response) => {
  await system.saveSequence(req.user!, param(req.params.code), v.sequenceSchema.parse(req.body));
  ok(res, await system.getSettings());
};
export const listAuditLogs = async (req: Request, res: Response) => okPage(res, await listAudit(q({ entityType: opt }).parse(req.query)));
