import { AlertOctagon, CalendarClock, CheckCircle2, CircleDollarSign, Receipt, Repeat, Users, Wallet } from 'lucide-react';
import { useState } from 'react';
import { RevenueArea, StatusBars } from '../../components/charts';
import { invoiceColumns, paymentColumns, subscriptionColumns } from '../../components/common/shared';
import { Button, Card, Loaded, PageHeader, StatCard, StatGrid } from '../../components/common/ui';
import { CustomerPicker } from '../../components/forms/fields';
import { FilterDate, FilterSelect, Table } from '../../components/tables/DataTable';
import { useFetch } from '../../hooks/useFetch';
import { get } from '../../services/api';
import type { Row } from '../../types';
import { money } from '../../utils/format';

const EMPTY = { from: '', to: '', subscriptionStatus: '', customerId: '', invoiceStatus: '' };
const none = (text: string) => <p className="p-6 text-center text-sm text-ink-3">{text}</p>;

export default function AdminDashboard() {
  const [filters, setFilters] = useState(EMPTY);
  const state = useFetch<Row>(() => get('/dashboard/admin', filters), [JSON.stringify(filters)]);
  const set = (patch: Partial<typeof EMPTY>) => setFilters((f) => ({ ...f, ...patch }));
  const compactSubs = subscriptionColumns('/app/subscriptions').filter((c) => !['startDate', 'total'].includes(c.key));
  const compactInvoices = invoiceColumns('/app/invoices').filter((c) => !['invoiceDate', 'total'].includes(c.key));

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Financial and operational overview." />
      <div className="mb-5 flex flex-wrap items-end gap-2 rounded-lg border border-line bg-surface p-3">
        <FilterDate label="From" value={filters.from} onChange={(from) => set({ from })} />
        <FilterDate label="To" value={filters.to} onChange={(to) => set({ to })} />
        <CustomerPicker compact value={filters.customerId} onChange={(customerId) => set({ customerId })} />
        <FilterSelect label="Subscription" value={filters.subscriptionStatus} onChange={(subscriptionStatus) => set({ subscriptionStatus })} options={[['draft', 'Draft'], ['quotation', 'Quotation'], ['confirmed', 'Confirmed'], ['active', 'Active'], ['paused', 'Paused'], ['closed', 'Closed']]} />
        <FilterSelect label="Invoice" value={filters.invoiceStatus} onChange={(invoiceStatus) => set({ invoiceStatus })} options={[['draft', 'Draft'], ['confirmed', 'Confirmed'], ['paid', 'Paid'], ['cancelled', 'Cancelled']]} />
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
              <StatCard label="Total customers" value={d.customers.toLocaleString('en-IN')} icon={Users} to="/app/customers" />
              <StatCard label="Total subscriptions" value={d.subscriptions.total.toLocaleString('en-IN')} icon={Repeat} to="/app/subscriptions" />
              <StatCard label="Active subscriptions" value={d.subscriptions.active.toLocaleString('en-IN')} icon={CheckCircle2} tone="ok" to="/app/subscriptions?status=active" />
              <StatCard label="Expiring soon" value={d.subscriptions.expiringSoon.toLocaleString('en-IN')} hint={`Within ${d.expiringDays} days`} icon={CalendarClock} tone="warn" to={`/app/subscriptions?expiringWithin=${d.expiringDays}`} />
              <StatCard label="Revenue received" value={money(d.finance.revenueReceived)} icon={CircleDollarSign} tone="ok" to="/app/reports/revenue" />
              <StatCard label="Outstanding amount" value={money(d.finance.outstandingAmount)} icon={Wallet} tone="warn" to="/app/reports/outstanding" />
              <StatCard label="Overdue invoices" value={d.finance.overdueInvoices.toLocaleString('en-IN')} hint={`${money(d.finance.overdueAmount)} overdue`} icon={AlertOctagon} tone="bad" to="/app/reports/overdue" />
              <StatCard label="Total invoices" value={d.finance.totalInvoices.toLocaleString('en-IN')} icon={Receipt} to="/app/invoices" />
            </StatGrid>
            <div className="mb-5 grid gap-5 xl:grid-cols-3">
              <Card title="Monthly revenue received" className="xl:col-span-2">
                <RevenueArea data={d.revenue} />
              </Card>
              <Card title="Subscription status">
                <StatusBars data={d.statuses} order={['active', 'paused', 'confirmed', 'quotation', 'draft', 'closed']} />
              </Card>
            </div>
            <div className="grid gap-5 xl:grid-cols-2">
              <Card title="Overdue invoices" flush>
                <Table columns={compactInvoices} rows={d.overdue} empty={none('No overdue invoices')} />
              </Card>
              <Card title="Upcoming subscription expirations" flush>
                <Table columns={compactSubs} rows={d.expiring} empty={none('Nothing is expiring soon')} />
              </Card>
              <Card title="Recent subscriptions" flush>
                <Table columns={compactSubs} rows={d.recentSubscriptions} empty={none('No subscriptions yet')} />
              </Card>
              <Card title="Recent payments" flush>
                <Table columns={paymentColumns('/app/invoices').filter((c) => !['method', 'status'].includes(c.key))} rows={d.recentPayments} empty={none('No payments in this period')} />
              </Card>
              <Card title="Recent invoices" flush className="xl:col-span-2">
                <Table columns={invoiceColumns('/app/invoices')} rows={d.recentInvoices} empty={none('No invoices in this period')} />
              </Card>
            </div>
          </>
        )}
      </Loaded>
    </>
  );
}
