import { AlertOctagon, CheckCircle2, CircleDollarSign, Clock, CreditCard, Repeat, Wallet } from 'lucide-react';
import { useState } from 'react';
import { InvoicedVsReceived, StatusBars } from '../../components/charts';
import { invoiceColumns, paymentColumns } from '../../components/common/shared';
import { Button, Card, Loaded, PageHeader, StatCard, StatGrid } from '../../components/common/ui';
import { CustomerPicker } from '../../components/forms/fields';
import { FilterDate, FilterSelect, Table } from '../../components/tables/DataTable';
import { useFetch } from '../../hooks/useFetch';
import { get } from '../../services/api';
import type { Row } from '../../types';
import { money } from '../../utils/format';

const EMPTY = { month: '', from: '', to: '', customerId: '', invoiceStatus: '' };

export default function FinanceDashboard() {
  const [filters, setFilters] = useState(EMPTY);
  const state = useFetch<Row>(() => get('/dashboard/finance', filters), [JSON.stringify(filters)]);
  const set = (patch: Partial<typeof EMPTY>) => setFilters((f) => ({ ...f, ...patch }));

  return (
    <>
      <PageHeader title="Finance Dashboard" subtitle="Revenue, balances and overdue invoices, calculated from recorded transactions." />
      <div className="mb-5 flex flex-wrap items-end gap-2 rounded-lg border border-line bg-surface p-3">
        <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-2">
          Month
          <input type="month" value={filters.month} onChange={(e) => set({ month: e.target.value, from: '', to: '' })} className="h-9 rounded-md border border-line-strong bg-surface px-2 text-sm font-normal text-ink" />
        </label>
        <FilterDate label="From" value={filters.from} onChange={(from) => set({ from, month: '' })} />
        <FilterDate label="To" value={filters.to} onChange={(to) => set({ to, month: '' })} />
        <CustomerPicker compact value={filters.customerId} onChange={(customerId) => set({ customerId })} />
        <FilterSelect label="Invoice status" value={filters.invoiceStatus} onChange={(invoiceStatus) => set({ invoiceStatus })} options={[['confirmed', 'Confirmed'], ['paid', 'Paid'], ['draft', 'Draft'], ['cancelled', 'Cancelled']]} />
        {JSON.stringify(filters) !== JSON.stringify(EMPTY) && (
          <Button variant="ghost" small onClick={() => setFilters(EMPTY)}>
            Clear filters
          </Button>
        )}
      </div>
      <Loaded state={state}>
        {(d) => (
          <>
            <StatGrid>
              <StatCard label="Active subscriptions" value={d.subscriptions.active.toLocaleString('en-IN')} icon={Repeat} to="/app/reports/active" />
              <StatCard label="Revenue received" value={money(d.finance.revenueReceived)} icon={CircleDollarSign} tone="ok" to="/app/reports/revenue" />
              <StatCard label="Total payments" value={d.finance.totalPayments.toLocaleString('en-IN')} icon={CreditCard} to="/app/payments" />
              <StatCard label="Outstanding amount" value={money(d.finance.outstandingAmount)} icon={Wallet} tone="warn" to="/app/reports/outstanding" />
              <StatCard label="Overdue invoices" value={d.finance.overdueInvoices.toLocaleString('en-IN')} hint={`${money(d.finance.overdueAmount)} overdue`} icon={AlertOctagon} tone="bad" to="/app/reports/overdue" />
              <StatCard label="Paid invoices" value={d.finance.paidInvoices.toLocaleString('en-IN')} icon={CheckCircle2} tone="ok" to="/app/reports/paid" />
              <StatCard label="Unpaid invoices" value={d.finance.unpaidInvoices.toLocaleString('en-IN')} icon={Clock} to="/app/reports/unpaid" />
            </StatGrid>
            <div className="mb-5 grid gap-5 xl:grid-cols-3">
              <Card title="Monthly revenue: invoiced and received" className="xl:col-span-2">
                <InvoicedVsReceived data={d.revenue} />
              </Card>
              <Card title="Invoice status">
                <StatusBars data={d.invoiceStatuses} order={['paid', 'confirmed', 'overdue', 'draft']} />
              </Card>
            </div>
            <div className="grid gap-5 xl:grid-cols-2">
              <Card title="Overdue invoices" flush>
                <Table columns={invoiceColumns('/app/invoices').filter((c) => !['invoiceDate', 'total'].includes(c.key))} rows={d.overdue} empty={<p className="p-6 text-center text-sm text-ink-3">No overdue invoices</p>} />
              </Card>
              <Card title="Recent payments" flush>
                <Table columns={paymentColumns('/app/invoices').filter((c) => !['method', 'status'].includes(c.key))} rows={d.recentPayments} empty={<p className="p-6 text-center text-sm text-ink-3">No payments in this period</p>} />
              </Card>
            </div>
          </>
        )}
      </Loaded>
    </>
  );
}
