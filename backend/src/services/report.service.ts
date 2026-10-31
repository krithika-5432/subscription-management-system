import * as reports from '../repositories/report.repository.js';
import { getSetting } from '../repositories/system.repository.js';
import { countAvailablePlans } from '../repositories/catalog.repository.js';
import type { AuthUser } from '../types/index.js';
import { today } from '../utils/dates.js';
import { badRequest } from '../utils/http.js';

type Row = Record<string, any>;
type ReportFilters = reports.ReportFilters;

export interface DashboardFilters {
  from?: string;
  to?: string;
  month?: string;
  customerId?: string;
  subscriptionStatus?: string;
  invoiceStatus?: string;
}

function monthRange(month?: string): { from?: string; to?: string } {
  if (!month) return {};
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

const expiringDays = async () => (await getSetting('billing')).expiringSoonDays ?? 30;

export async function adminDashboard(f: DashboardFilters) {
  const date = today();
  const days = await expiringDays();
  const scope = { from: f.from, to: f.to, customerId: f.customerId };
  const subScope = { customerId: f.customerId, status: f.subscriptionStatus };
  const invoiceScope = { ...scope, status: f.invoiceStatus };
  const [customers, subscriptions, finance, statuses, revenue, recentSubscriptions, recentPayments, recentInvoices, overdue, expiring] = await Promise.all([
    reports.countCustomers(),
    reports.subscriptionCounts(date, days, subScope),
    reports.financeTotals(date, { ...scope, invoiceStatus: f.invoiceStatus }),
    reports.subscriptionStatusBreakdown(subScope),
    reports.monthlyRevenue(scope),
    reports.recentSubscriptions(subScope),
    reports.recentPayments(scope),
    reports.recentInvoices(date, invoiceScope),
    reports.overdueInvoices(date, scope),
    reports.upcomingExpirations(date, days, { customerId: f.customerId }),
  ]);
  return { customers, subscriptions, finance, statuses, revenue, recentSubscriptions, recentPayments, recentInvoices, overdue, expiring, expiringDays: days };
}

export async function salesDashboard() {
  const date = today();
  const days = await expiringDays();
  const [customers, quotations, pendingRequests, activity] = await Promise.all([
    reports.countCustomers(),
    reports.quotationCounts(date, days),
    reports.countPendingRequests(),
    reports.recentCustomerActivity(),
  ]);
  return { customers, quotations, pendingRequests, activity, expiringDays: days };
}

export async function operationsDashboard() {
  const date = today();
  const days = await expiringDays();
  const [subscriptions, renewalsDue, activity, expiring] = await Promise.all([
    reports.subscriptionCounts(date, days),
    reports.countRenewalsDue(date, days),
    reports.recentBillingActivity(),
    reports.upcomingExpirations(date, days),
  ]);
  return { subscriptions, renewalsDue, activity, expiring, expiringDays: days };
}

export async function financeDashboard(f: DashboardFilters) {
  const date = today();
  const days = await expiringDays();
  const range = f.month ? monthRange(f.month) : { from: f.from, to: f.to };
  const scope = { ...range, customerId: f.customerId };
  const [finance, subscriptions, revenue, invoiceStatuses, overdue, recentPayments] = await Promise.all([
    reports.financeTotals(date, { ...scope, invoiceStatus: f.invoiceStatus }),
    reports.subscriptionCounts(date, days, { customerId: f.customerId }),
    reports.monthlyRevenue(scope),
    reports.invoiceStatusBreakdown(date, { ...scope, invoiceStatus: f.invoiceStatus }),
    reports.overdueInvoices(date, scope, 10),
    reports.recentPayments(scope, 8),
  ]);
  return { finance, subscriptions, revenue, invoiceStatuses, overdue, recentPayments };
}

export async function customerDashboard(user: AuthUser) {
  const date = today();
  const days = await expiringDays();
  const customerId = user.customerId!;
  const [summary, availablePlans, recentPayments, expiring] = await Promise.all([
    reports.customerDashboard(customerId, date, days),
    countAvailablePlans(date),
    reports.recentPayments({ customerId }, 5),
    reports.upcomingExpirations(date, days, { customerId }, 5),
  ]);
  return { ...summary, availablePlans, recentPayments, expiring, expiringDays: days };
}

// ---- reports

interface Column {
  key: string;
  label: string;
}

const INVOICE_COLUMNS: Column[] = [
  { key: 'invoiceNumber', label: 'Invoice' },
  { key: 'customerName', label: 'Customer' },
  { key: 'invoiceDate', label: 'Invoice date' },
  { key: 'dueDate', label: 'Due date' },
  { key: 'total', label: 'Total' },
  { key: 'amountPaid', label: 'Paid' },
  { key: 'outstanding', label: 'Outstanding' },
  { key: 'status', label: 'Status' },
  { key: 'paymentStatus', label: 'Payment status' },
];
const PAYMENT_COLUMNS: Column[] = [
  { key: 'paymentReference', label: 'Reference' },
  { key: 'customerName', label: 'Customer' },
  { key: 'invoiceNumber', label: 'Invoice' },
  { key: 'method', label: 'Method' },
  { key: 'paymentDate', label: 'Date' },
  { key: 'amount', label: 'Amount' },
  { key: 'status', label: 'Status' },
];
const SUBSCRIPTION_COLUMNS: Column[] = [
  { key: 'subscriptionNumber', label: 'Subscription' },
  { key: 'customerName', label: 'Customer' },
  { key: 'planName', label: 'Plan' },
  { key: 'billingFrequency', label: 'Billing' },
  { key: 'startDate', label: 'Start' },
  { key: 'expiryDate', label: 'Expiry' },
  { key: 'total', label: 'Value per cycle' },
  { key: 'status', label: 'Status' },
];

interface ReportResult {
  columns: Column[];
  summary: Row;
  page: { rows: Row[]; total: number; page: number; pageSize: number };
  chart?: Row[];
}

const invoicePreset = (preset: { status?: string; overdue?: boolean; outstandingOnly?: boolean }) => async (q: ReportFilters): Promise<ReportResult> => {
  const date = today();
  const [page, summary] = await Promise.all([reports.invoiceReport(q, date, preset), reports.invoiceReportSummary(q, date, preset)]);
  return { columns: INVOICE_COLUMNS, summary, page };
};

const subscriptionPreset = (status?: string) => async (q: ReportFilters): Promise<ReportResult> => {
  const [page, summary] = await Promise.all([reports.subscriptionReport(q, status), reports.subscriptionReportSummary(q, status)]);
  return { columns: SUBSCRIPTION_COLUMNS, summary, page };
};

const REPORTS: Record<string, (q: ReportFilters) => Promise<ReportResult>> = {
  revenue: async (q) => {
    const date = today();
    const chart = await reports.monthlyRevenue(q, 12);
    const finance = await reports.financeTotals(date, q);
    const start = (q.page - 1) * q.pageSize;
    return {
      columns: [
        { key: 'label', label: 'Month' },
        { key: 'invoiced', label: 'Invoiced' },
        { key: 'received', label: 'Received' },
        { key: 'outstanding', label: 'Still outstanding' },
        { key: 'payments', label: 'Payments' },
      ],
      summary: {
        totalRevenue: finance.totalInvoiced,
        revenueReceived: finance.revenueReceived,
        outstanding: finance.outstandingAmount,
        payments: finance.totalPayments,
      },
      chart,
      page: { rows: [...chart].reverse().slice(start, start + q.pageSize), total: chart.length, page: q.page, pageSize: q.pageSize },
    };
  },
  payments: async (q) => {
    const [page, summary] = await Promise.all([reports.paymentReport(q), reports.paymentReportSummary(q)]);
    return { columns: PAYMENT_COLUMNS, summary, page };
  },
  invoices: invoicePreset({}),
  outstanding: invoicePreset({ outstandingOnly: true }),
  overdue: invoicePreset({ overdue: true }),
  paid: invoicePreset({ status: 'paid' }),
  unpaid: invoicePreset({ status: 'confirmed' }),
  subscriptions: subscriptionPreset(),
  active: subscriptionPreset('active'),
  closed: subscriptionPreset('closed'),
  renewals: async (q) => {
    const [page, summary] = await Promise.all([reports.renewalReport(q), reports.renewalReportSummary(q)]);
    return {
      columns: [
        { key: 'subscriptionNumber', label: 'Subscription' },
        { key: 'customerName', label: 'Customer' },
        { key: 'previousExpiry', label: 'Previous expiry' },
        { key: 'newExpiry', label: 'New expiry' },
        { key: 'renewalType', label: 'Type' },
        { key: 'renewedByName', label: 'Renewed by' },
      ],
      summary,
      page,
    };
  },
  customers: async (q) => {
    const page = await reports.customerSummaryReport(q);
    return {
      columns: [
        { key: 'customerName', label: 'Customer' },
        { key: 'companyName', label: 'Company' },
        { key: 'activeSubscriptions', label: 'Active' },
        { key: 'totalSubscriptions', label: 'All subscriptions' },
        { key: 'billed', label: 'Billed' },
        { key: 'paid', label: 'Paid' },
        { key: 'outstanding', label: 'Outstanding' },
      ],
      summary: { customers: page.total },
      page,
    };
  },
};

export async function runReport(type: string, input: ReportFilters & { month?: string }) {
  const report = REPORTS[type];
  if (!report) throw badRequest('Unknown report');
  const range = input.month ? monthRange(input.month) : { from: input.from, to: input.to };
  return report({ ...input, ...range });
}

const csvCell = (value: unknown) => {
  if (value === null || value === undefined) return '';
  const text = String(value);
  // Prefixing formula characters stops a spreadsheet from executing customer-entered text.
  const safe = /^[=+@\t\r-]/.test(text) && Number.isNaN(Number(text)) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export async function exportReportCsv(type: string, input: ReportFilters & { month?: string }) {
  const header = await runReport(type, { ...input, page: 1, pageSize: 1 });
  const lines = [header.columns.map((c) => csvCell(c.label)).join(',')];
  const pageSize = 1000;
  for (let page = 1; page <= 50; page += 1) {
    const { page: result } = await runReport(type, { ...input, page, pageSize });
    for (const row of result.rows) lines.push(header.columns.map((c) => csvCell(row[c.key])).join(','));
    if (page * pageSize >= result.total) break;
  }
  return lines.join('\r\n');
}
