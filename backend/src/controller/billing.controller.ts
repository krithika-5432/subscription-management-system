import type { Request, Response } from 'express';
import { z } from 'zod';
import * as repo from '../repositories/billing.repository.js';
import * as billing from '../services/billing.service.js';
import { today } from '../utils/dates.js';
import { ok, okPage, pagingSchema, param } from '../utils/http.js';
import * as v from '../validators/catalog.validators.js';
import { sendPdf } from './sales.controller.js';

const opt = z.string().max(100).optional();
const id = (req: Request) => param(req.params.id);

const invoiceQuery = pagingSchema.extend({ status: opt, paymentStatus: opt, customerId: opt, subscriptionId: opt, from: opt, to: opt, overdue: opt });
export const listInvoices = async (req: Request, res: Response) => okPage(res, await repo.listInvoices(invoiceQuery.parse(req.query), today()));
export const getInvoice = async (req: Request, res: Response) => ok(res, await billing.getInvoice(id(req)));
export const updateInvoice = async (req: Request, res: Response) => ok(res, await billing.updateDraftInvoice(req.user!, id(req), v.invoiceUpdateSchema.parse(req.body)));
export const confirmInvoice = async (req: Request, res: Response) => ok(res, await billing.confirmInvoice(req.user!, id(req)));
export const cancelInvoice = async (req: Request, res: Response) => ok(res, await billing.cancelInvoice(req.user!, id(req)));
export const sendInvoice = async (req: Request, res: Response) => ok(res, await billing.sendInvoice(req.user!, id(req)));
export const invoicePdf = async (req: Request, res: Response) => {
  const { number, pdf } = await billing.invoicePdf(id(req));
  sendPdf(res, number, pdf);
};
export const runBilling = async (req: Request, res: Response) => ok(res, await billing.runBillingCycle(req.user!));
export const generateForSubscription = async (req: Request, res: Response) => ok(res, { invoice: await billing.generateInvoiceForSubscription(id(req), req.user!) });

const paymentQuery = pagingSchema.extend({ status: opt, method: opt, customerId: opt, invoiceId: opt, from: opt, to: opt });
export const listPayments = async (req: Request, res: Response) => okPage(res, await repo.listPayments(paymentQuery.parse(req.query)));
export const getPayment = async (req: Request, res: Response) => ok(res, await billing.getPayment(id(req)));
export const recordPayment = async (req: Request, res: Response) => ok(res, await billing.recordPayment(req.user!, v.paymentSchema.parse(req.body)), 201);
export const voidPayment = async (req: Request, res: Response) => ok(res, await billing.voidPayment(req.user!, id(req), v.voidSchema.parse(req.body).reason));
