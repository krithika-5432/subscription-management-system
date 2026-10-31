import { Download } from 'lucide-react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { InvoicedVsReceived } from '../../components/charts';
import { ActionButton, Card, PageHeader, StatCard, StatGrid, StatusBadge } from '../../components/common/ui';
import { CustomerPicker } from '../../components/forms/fields';
import { FilterDate, FilterSelect, ListCard, type Column } from '../../components/tables/DataTable';
import { useAction } from '../../hooks/useAction';
import { useList } from '../../hooks/useList';
import { download } from '../../services/api';
import type { Row } from '../../types';
import { date, dateTime, METHOD_LABEL, money, titleCase } from '../../utils/format';

interface ReportDef {
  label: string;
  subtitle: string;
  kind: 'revenue' | 'invoice' | 'payment' | 'subscription' | 'renewal' | 'customer';
}

const REPORTS: Record<string, ReportDef> = {
  revenue: { label: 'Total revenue', subtitle: 'Invoiced and received, month by month.', kind: 'revenue' },
  payments: { label: 'Payment history', subtitle: 'Revenue received, payment by payment.', kind: 'payment' },
  invoices: { label: 'All invoices', subtitle: 'Every invoice, filtered by status and payment state.', kind: 'invoice' },
  outstanding: { label: 'Outstanding payments', subtitle: 'Confirmed invoices with a balance remaining.', kind: 'invoice' },
  overdue: { label: 'Overdue invoices', subtitle: 'Past their due date with a balance remaining.', kind: 'invoice' },
  paid: { label: 'Paid invoices', subtitle: 'Invoices settled in full.', kind: 'invoice' },
  unpaid: { label: 'Unpaid invoices', subtitle: 'Confirmed invoices not yet settled, including part-paid ones.', kind: 'invoice' },
  subscriptions: { label: 'Subscription summary', subtitle: 'All subscriptions, by status.', kind: 'subscription' },
  active: { label: 'Active subscriptions', subtitle: 'Subscriptions currently billing.', kind: 'subscription' },
  closed: { label: 'Closed subscriptions', subtitle: 'Subscriptions that have ended.', kind: 'subscription' },
  renewals: { label: 'Subscription renewals', subtitle: 'Manual and automatic renewals.', kind: 'renewal' },
  customers: { label: 'Customer summary', subtitle: 'Subscriptions and balances per customer.', kind: 'customer' },
};

const MONEY_KEYS = new Set(['invoiced', 'received', 'outstanding', 'total', 'amountPaid', 'amount', 'billed', 'paid']);
const DATE_KEYS = new Set(['invoiceDate', 'dueDate', 'paymentDate', 'startDate', 'expiryDate', 'previousExpiry', 'newExpiry']);
const STATUS_KEYS = new Set(['status', 'paymentStatus']);
const LINKS: Record<string, (r: Row) => string> = {
  invoiceNumber: (r) => `/app/invoices/${r.invoiceId ?? r.id}`,
  subscriptionNumber: (r) => `/app/subscriptions/${r.subscriptionId ?? r.id}`,
};
const SORTS: Record<string, string> = { invoiceNumber: 'invoiceNumber', customerName: 'customerName', invoiceDate: 'invoiceDate', dueDate: 'dueDate', total: 'total', outstanding: 'outstanding', status: 'status', paymentDate: 'paymentDate', amount: 'amount', startDate: 'startDate', expiryDate: 'expiryDate', billed: 'billed' };

function toColumn(c: { key: string; label: string }, sortable: boolean): Column {
  const isMoney = MONEY_KEYS.has(c.key);
  return {
    key: c.key,
    header: c.label,
    sort: sortable ? SORTS[c.key] : undefined,
    align: isMoney || ['payments', 'activeSubscriptions', 'totalSubscriptions'].includes(c.key) ? 'right' : undefined,
    render: (r) => {
      const v = r[c.key];
      if (LINKS[c.key]) return <Link to={LINKS[c.key](r)} className="font-semibold whitespace-nowrap text-brand-ink hover:underline">{v}</Link>;
      if (c.key === 'customerName' && r.customerId) return <Link to={`/app/customers/${r.customerId}`} className="hover:text-brand-ink">{v}</Link>;
      if (isMoney) return money(v);
      if (DATE_KEYS.has(c.key)) return <span className="whitespace-nowrap">{date(v)}</span>;
      if (STATUS_KEYS.has(c.key)) return <StatusBadge status={v} />;
      if (c.key === 'method') return METHOD_LABEL[v] ?? v;
      if (['billingFrequency', 'renewalType'].includes(c.key)) return titleCase(v);
      if (c.key === 'createdAt') return dateTime(v);
      return v ?? '-';
    },
  };
}

function SummaryCards({ summary, kind }: { summary: Row; kind: ReportDef['kind'] }) {
  const cards: [string, string | number][] =
    kind === 'revenue' ? [['Total revenue invoiced', money(summary.totalRevenue)], ['Revenue received', money(summary.revenueReceived)], ['Outstanding', money(summary.outstanding)], ['Payments', summary.payments]]
    : kind === 'invoice' ? [['Invoices', summary.invoices], ['Total', money(summary.total)], ['Paid', money(summary.paid)], ['Outstanding', money(summary.outstanding)]]
    : kind === 'payment' ? [['Payments', summary.payments], ['Received', money(summary.received)], ['Voided', money(summary.voided)]]
    : kind === 'subscription' ? [['Subscriptions', summary.subscriptions], ['Active', summary.active], ['Closed', summary.closed], ['Value per cycle', money(summary.billingValue)]]
    : kind === 'renewal' ? [['Renewals', summary.renewals], ['Automatic', summary.automatic], ['Manual', summary.manual]]
    : [['Customers', summary.customers]];
  return (
    <StatGrid>
      {cards.map(([label, value]) => (
        <StatCard key={label} label={label} value={typeof value === 'number' ? value.toLocaleString('en-IN') : value} />
      ))}
    </StatGrid>
  );
}

function Report({ type, def }: { type: string; def: ReportDef }) {
  const list = useList(`/reports/${type}`);
  const act = useAction();
  const raw = list.raw;
  const columns: Column[] = (raw?.columns ?? []).map((c: { key: string; label: string }) => toColumn(c, def.kind !== 'revenue' && def.kind !== 'renewal'));
  return (
    <>
      <div className="no-print mb-5 flex flex-wrap items-end gap-2 rounded-lg border border-line bg-surface p-3">
        {!['customers'].includes(type) && (
          <>
            <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-2">
              Month
              <input type="month" value={list.param('month')} onChange={(e) => list.setParams({ month: e.target.value, from: '', to: '' })} className="h-9 rounded-md border border-line-strong bg-surface px-2 text-sm font-normal text-ink" />
            </label>
            <FilterDate label="From" value={list.param('from')} onChange={(v) => list.setParams({ from: v, month: '' })} />
            <FilterDate label="To" value={list.param('to')} onChange={(v) => list.setParams({ to: v, month: '' })} />
          </>
        )}
        <CustomerPicker compact value={list.param('customerId')} onChange={(v) => list.setParam('customerId', v)} />
        {type === 'subscriptions' && <FilterSelect label="Subscription status" value={list.param('subscriptionStatus')} onChange={(v) => list.setParam('subscriptionStatus', v)} options={['draft', 'quotation', 'confirmed', 'active', 'paused', 'closed'].map((s) => [s, titleCase(s)])} />}
        {def.kind === 'invoice' && <FilterSelect label="Payment status" value={list.param('paymentStatus')} onChange={(v) => list.setParam('paymentStatus', v)} options={[['unpaid', 'Unpaid'], ['partial', 'Partially paid'], ['paid', 'Paid']]} />}
        {type === 'invoices' && <FilterSelect label="Invoice status" value={list.param('invoiceStatus')} onChange={(v) => list.setParam('invoiceStatus', v)} options={[['draft', 'Draft'], ['confirmed', 'Confirmed'], ['paid', 'Paid'], ['cancelled', 'Cancelled']]} />}
        {def.kind === 'payment' && <FilterSelect label="Payment status" value={list.param('paymentStatus')} onChange={(v) => list.setParam('paymentStatus', v)} options={[['completed', 'Completed'], ['voided', 'Voided']]} />}
        <div className="ml-auto">
          <ActionButton variant="secondary" icon={Download} onAction={() => act(() => download(`/reports/${type}/export`, `${type}-report.csv`, { ...list.queryParams, page: undefined, pageSize: undefined }))}>Export CSV</ActionButton>
        </div>
      </div>
      {raw?.summary && <SummaryCards summary={raw.summary} kind={def.kind} />}
      {raw?.chart && (
        <Card title="Invoiced and received by month" className="mb-5">
          <InvoicedVsReceived data={raw.chart} />
        </Card>
      )}
      <ListCard list={list} columns={columns} hideSearch={def.kind === 'revenue'} placeholder="Search this report" />
    </>
  );
}

export default function ReportsPage() {
  const { type } = useParams();
  const navigate = useNavigate();
  if (!type) return <Navigate to="/app/reports/revenue" replace />;
  const def = REPORTS[type];
  if (!def) return <Navigate to="/app/reports/revenue" replace />;
  return (
    <>
      <PageHeader title={def.label} subtitle={def.subtitle} crumbs={[{ label: 'Dashboard', to: '/app/dashboard' }, { label: 'Reports' }, { label: def.label }]} />
      <div className="no-print mb-4">
        <label className="inline-flex items-center gap-2 text-xs font-semibold text-ink-2">
          Report
          <select value={type} onChange={(e) => navigate(`/app/reports/${e.target.value}`)} className="h-9 rounded-md border border-line-strong bg-surface px-2 text-sm font-normal text-ink">
            {Object.entries(REPORTS).map(([key, r]) => (
              <option key={key} value={key}>{r.label}</option>
            ))}
          </select>
        </label>
      </div>
      <Report key={type} type={type} def={def} />
    </>
  );
}
