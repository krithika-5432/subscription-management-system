import type { Request, Response } from 'express';
import { z } from 'zod';
import * as reports from '../services/report.service.js';
import { forbidden, ok, pagingSchema, param } from '../utils/http.js';

const opt = z.string().max(100).optional();
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a YYYY-MM month').optional().or(z.literal('').transform(() => undefined));
const dashboardQuery = z.object({ from: opt, to: opt, month, customerId: opt, subscriptionStatus: opt, invoiceStatus: opt });
const clean = <T extends Record<string, unknown>>(values: T) =>
  Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v === '' ? undefined : v])) as T;

export const dashboard = async (req: Request, res: Response) => {
  const user = req.user!;
  const kind = param(req.params.kind);
  if (user.role === 'customer') throw forbidden();
  if (kind !== 'admin' && user.role !== 'admin' && user.profile !== kind) throw forbidden();
  if (kind === 'admin' && user.role !== 'admin') throw forbidden();
  const filters = clean(dashboardQuery.parse(req.query));
  switch (kind) {
    case 'admin':
      return ok(res, await reports.adminDashboard(filters));
    case 'sales':
      return ok(res, await reports.salesDashboard());
    case 'operations':
      return ok(res, await reports.operationsDashboard());
    case 'finance':
      return ok(res, await reports.financeDashboard(filters));
    default:
      throw forbidden();
  }
};

const reportQuery = pagingSchema.extend({ from: opt, to: opt, month, customerId: opt, subscriptionStatus: opt, invoiceStatus: opt, paymentStatus: opt });

export const report = async (req: Request, res: Response) => {
  const result = await reports.runReport(param(req.params.type), clean(reportQuery.parse(req.query)));
  res.json({
    success: true,
    data: { columns: result.columns, summary: result.summary, chart: result.chart ?? null, rows: result.page.rows },
    meta: { total: result.page.total, page: result.page.page, pageSize: result.page.pageSize, totalPages: Math.ceil(result.page.total / result.page.pageSize) },
  });
};

export const exportReport = async (req: Request, res: Response) => {
  const type = param(req.params.type);
  const csv = await reports.exportReportCsv(type, clean(reportQuery.parse(req.query)));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${type}-report.csv"`);
  res.send(`﻿${csv}`);
};
