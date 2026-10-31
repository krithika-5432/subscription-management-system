import type { Request, Response } from 'express';
import { z } from 'zod';
import * as quotationRepo from '../repositories/quotation.repository.js';
import * as subscriptionRepo from '../repositories/subscription.repository.js';
import * as quotations from '../services/quotation.service.js';
import * as subscriptions from '../services/subscription.service.js';
import { getRequest } from '../services/system.service.js';
import { today } from '../utils/dates.js';
import { ok, okPage, pagingSchema, param } from '../utils/http.js';
import * as v from '../validators/catalog.validators.js';

const opt = z.string().max(100).optional();
const within = z.coerce.number().int().min(1).max(3650).optional();
const id = (req: Request) => param(req.params.id);

const quotationQuery = pagingSchema.extend({ status: opt, customerId: opt, from: opt, to: opt, expiringWithin: within });
export const listQuotations = async (req: Request, res: Response) => okPage(res, await quotationRepo.listQuotations(quotationQuery.parse(req.query), today()));
export const getQuotation = async (req: Request, res: Response) => ok(res, await quotations.getQuotation(id(req)));
export const previewQuotation = async (req: Request, res: Response) => ok(res, await quotations.preview(v.documentSchema.parse(req.body)));
export const createQuotation = async (req: Request, res: Response) => ok(res, await quotations.createQuotation(req.user!, v.quotationSchema.parse(req.body)), 201);
export const updateQuotation = async (req: Request, res: Response) => ok(res, await quotations.updateQuotation(req.user!, id(req), v.quotationSchema.parse(req.body)));
export const deleteQuotation = async (req: Request, res: Response) => {
  await quotations.deleteQuotation(req.user!, id(req));
  ok(res, { deleted: true });
};
export const sendQuotation = async (req: Request, res: Response) => ok(res, await quotations.sendQuotation(req.user!, id(req)));
export const convertQuotation = async (req: Request, res: Response) => ok(res, await quotations.convertToSubscription(req.user!, id(req), v.convertSchema.parse(req.body ?? {})), 201);
export const templateDefaults = async (req: Request, res: Response) => ok(res, await quotations.templateDefaults(id(req)));
export const quotationPdf = async (req: Request, res: Response) => {
  const { number, pdf } = await quotations.quotationPdf(id(req));
  sendPdf(res, number, pdf);
};

export function sendPdf(res: Response, name: string, pdf: Buffer) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/[^A-Za-z0-9._-]/g, '_')}.pdf"`);
  res.send(pdf);
}

const requestQuery = pagingSchema.extend({ status: opt, requestType: opt, customerId: opt });
export const listRequests = async (req: Request, res: Response) => okPage(res, await quotationRepo.listRequests(requestQuery.parse(req.query)));
export const getRequest_ = async (req: Request, res: Response) => ok(res, await getRequest(id(req)));
export const declineRequest = async (req: Request, res: Response) => ok(res, await subscriptions.declineRequest(req.user!, id(req), v.declineRequestSchema.parse(req.body ?? {}).note));
export const approveAddon = async (req: Request, res: Response) => ok(res, await subscriptions.approveAddon(req.user!, id(req)));

const subscriptionQuery = pagingSchema.extend({ status: opt, customerId: opt, planId: opt, from: opt, to: opt, expiringWithin: within });
export const listSubscriptions = async (req: Request, res: Response) => okPage(res, await subscriptionRepo.listSubscriptions(subscriptionQuery.parse(req.query), today()));
export const getSubscription = async (req: Request, res: Response) => ok(res, await subscriptions.getSubscription(id(req)));
export const createSubscription = async (req: Request, res: Response) => ok(res, await subscriptions.createSubscription(req.user!, v.subscriptionCreateSchema.parse(req.body)), 201);
export const updateSubscription = async (req: Request, res: Response) => ok(res, await subscriptions.updateSubscription(req.user!, id(req), v.subscriptionUpdateSchema.parse(req.body)));
export const transitionSubscription = async (req: Request, res: Response) => {
  const body = v.transitionSchema.parse(req.body);
  ok(res, await subscriptions.transition(req.user!, id(req), body.action, body.reason));
};
export const renewSubscription = async (req: Request, res: Response) => ok(res, await subscriptions.renewSubscription(req.user!, id(req)));
