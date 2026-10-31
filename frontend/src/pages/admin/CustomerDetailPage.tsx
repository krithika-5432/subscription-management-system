import { Pencil, Power } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { invoiceColumns, paymentColumns, quotationColumns, subscriptionColumns } from '../../components/common/shared';
import { Button, buttonClass, Card, DefinitionList, Loaded, PageHeader, StatCard, StatGrid, StatusBadge, Tabs } from '../../components/common/ui';
import { ListCard, type Column } from '../../components/tables/DataTable';
import { useAuth } from '../../context/AuthContext';
import { useFeedback } from '../../context/FeedbackContext';
import { useAction } from '../../hooks/useAction';
import { useFetch } from '../../hooks/useFetch';
import { useList } from '../../hooks/useList';
import { get, patch } from '../../services/api';
import type { Row } from '../../types';
import { date, money } from '../../utils/format';
import { CustomerForm } from './CustomersPage';

function RelatedList({ endpoint, customerId, columns, placeholder }: { endpoint: string; customerId: string; columns: Column[]; placeholder: string }) {
  const list = useList(endpoint, { fixed: { customerId }, pageSize: 10 });
  return <ListCard list={list} columns={columns} placeholder={placeholder} />;
}

export default function CustomerDetailPage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const feedback = useFeedback();
  const act = useAction();
  const state = useFetch<Row>(() => get(`/customers/${id}`), [id]);
  const [editing, setEditing] = useState(false);
  const [search, setSearch] = useSearchParams();
  const tab = search.get('tab') ?? 'quotations';

  const tabs = [
    can('quotations.view') && { key: 'quotations', label: 'Quotations' },
    can('subscriptions.view') && { key: 'subscriptions', label: 'Subscriptions' },
    can('invoices.view') && { key: 'invoices', label: 'Invoices' },
    can('payments.view') && { key: 'payments', label: 'Payments' },
  ].filter(Boolean) as { key: string; label: string }[];
  const active = tabs.some((t) => t.key === tab) ? tab : tabs[0]?.key;

  return (
    <Loaded state={state}>
      {(c) => (
        <>
          <PageHeader
            title={c.customerName}
            subtitle={c.companyName}
            crumbs={[{ label: 'Dashboard', to: '/app/dashboard' }, { label: 'Customers', to: '/app/customers' }, { label: c.customerName }]}
            actions={
              <>
                {can('quotations.manage') && <Link to={`/app/quotations/new?customerId=${c.id}`} className={buttonClass('secondary')}>New quotation</Link>}
                {can('customers.manage') && (
                  <>
                    <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>Edit</Button>
                    <Button
                      variant="secondary"
                      icon={Power}
                      onClick={async () => {
                        const next = c.status === 'active' ? 'inactive' : 'active';
                        const ok = await feedback.confirm({ title: next === 'active' ? 'Activate customer' : 'Deactivate customer', message: next === 'active' ? 'This customer will be able to log in again.' : 'This customer will be signed out and unable to use the portal. Their records are kept.', danger: next === 'inactive', confirmLabel: next === 'active' ? 'Activate' : 'Deactivate' });
                        if (ok && (await act(() => patch(`/customers/${c.id}/status`, { status: next }), 'Customer updated'))) void state.reload();
                      }}
                    >
                      {c.status === 'active' ? 'Deactivate' : 'Activate'}
                    </Button>
                  </>
                )}
              </>
            }
          />
          <StatGrid>
            <StatCard label="Active subscriptions" value={c.summary.activeSubscriptions} />
            <StatCard label="Quotations" value={c.summary.quotations} />
            <StatCard label="Total paid" value={money(c.summary.totalPaid)} />
            <StatCard label="Outstanding" value={money(c.summary.outstanding)} />
          </StatGrid>
          <Card title="Customer information" className="mb-5">
            <DefinitionList
              items={[
                ['Email', c.email],
                ['Phone', c.phone],
                ['Billing address', c.billingAddress],
                ['Tax identification', c.taxId],
                ['Registered', date(c.createdAt)],
                ['Status', <StatusBadge status={c.status} />],
              ]}
            />
          </Card>
          {active && (
            <>
              <Tabs tabs={tabs} active={active} onChange={(key) => setSearch({ tab: key })} />
              {active === 'quotations' && <RelatedList key="q" endpoint="/quotations" customerId={c.id} placeholder="Search quotations" columns={quotationColumns('/app/quotations', { showCustomer: false })} />}
              {active === 'subscriptions' && <RelatedList key="s" endpoint="/subscriptions" customerId={c.id} placeholder="Search subscriptions" columns={subscriptionColumns('/app/subscriptions', { showCustomer: false })} />}
              {active === 'invoices' && <RelatedList key="i" endpoint="/invoices" customerId={c.id} placeholder="Search invoices" columns={invoiceColumns('/app/invoices', { showCustomer: false })} />}
              {active === 'payments' && <RelatedList key="p" endpoint="/payments" customerId={c.id} placeholder="Search payments" columns={paymentColumns('/app/invoices', { showCustomer: false })} />}
            </>
          )}
          {editing && (
            <CustomerForm
              customer={c}
              onClose={() => setEditing(false)}
              onSaved={() => {
                setEditing(false);
                void state.reload();
              }}
            />
          )}
        </>
      )}
    </Loaded>
  );
}
