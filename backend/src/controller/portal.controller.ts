import type { Request, Response } from 'express';
import { z } from 'zod';
import * as billingRepo from '../repositories/billing.repository.js';
import * as quotationRepo from '../repositories/quotation.repository.js';
import * as subscriptionRepo from '../repositories/subscription.repository.js';
import * as billing from '../services/billing.service.js';
import * as quotations from '../services/quotation.service.js';
import { customerDashboard } from '../services/report.service.js';
import * as subscriptions from '../services/subscription.service.js';
import * as system from '../services/system.service.js';
import { today } from '../utils/dates.js';
import { ok, okPage, pagingSchema, param } from '../utils/http.js';
import { customerRequestSchema, rejectSchema } from '../validators/catalog.validators.js';
import { sendPdf } from './sales.controller.js';

const opt = z.string().max(100).optional();
const id = (req: Request) => param(req.params.id);
const customerId = (req: Request) => req.user!.customerId!;

export const dashboard = async (req: Request, res: Response) => ok(res, await customerDashboard(req.user!));
export const catalog = async (_req: Request, res: Response) => ok(res, await system.portalCatalog());
export const addons = async (_req: Request, res: Response) => ok(res, await system.portalAddons());

export const createRequest = async (req: Request, res: Response) => ok(res, await system.createCustomerRequest(req.user!, customerRequestSchema.parse(req.body)), 201);
export const listRequests = async (req: Request, res: Response) =>
  okPage(res, await quotationRepo.listRequests({ ...pagingSchema.extend({ status: opt, requestType: opt }).parse(req.query), customerId: customerId(req) }));

export const listQuotations = async (req: Request, res: Response) => {
  const query = pagingSchema.extend({ status: opt }).parse(req.query);
  okPage(res, await quotationRepo.listQuotations({ ...query, customerId: customerId(req), hideStatuses: ['draft'] }, today()));
};

export const getQuotation = async (req: Request, res: Response) => ok(res, await quotations.getQuotation(id(req), customerId(req)));
export const acceptQuotation = async (req: Request, res: Response) => ok(res, await quotations.respondToQuotation(req.user!, id(req), true));
export const rejectQuotation = async (req: Request, res: Response) => ok(res, await quotations.respondToQuotation(req.user!, id(req), false, rejectSchema.parse(req.body ?? {}).reason));
export const quotationPdf = async (req: Request, res: Response) => {
  const { number, pdf } = await quotations.quotationPdf(id(req), customerId(req));
  sendPdf(res, number, pdf);
};

export const listSubscriptions = async (req: Request, res: Response) => {
  const query = pagingSchema.extend({ status: opt }).parse(req.query);
  okPage(res, await subscriptionRepo.listSubscriptions({ ...query, customerId: customerId(req), hideStatuses: ['draft', 'quotation'] }, today()));
};
export const getSubscription = async (req: Request, res: Response) => ok(res, await subscriptions.getSubscription(id(req), customerId(req)));

export const listInvoices = async (req: Request, res: Response) => {
  const query = pagingSchema.extend({ status: opt, paymentStatus: opt, from: opt, to: opt }).parse(req.query);
  okPage(res, await billingRepo.listInvoices({ ...query, customerId: customerId(req), hideStatuses: ['draft'] }, today()));
};
export const getInvoice = async (req: Request, res: Response) => ok(res, await billing.getInvoice(id(req), customerId(req)));
export const invoicePdf = async (req: Request, res: Response) => {
  const { number, pdf } = await billing.invoicePdf(id(req), customerId(req));
  sendPdf(res, number, pdf);
};

export const listPayments = async (req: Request, res: Response) => {
  const query = pagingSchema.extend({ status: opt, method: opt, from: opt, to: opt }).parse(req.query);
  okPage(res, await billingRepo.listPayments({ ...query, customerId: customerId(req) }));
};
