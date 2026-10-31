import { Plus, X } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { quotationColumns } from '../../components/common/shared';
import { Button, buttonClass, PageHeader, StatusBadge, Tabs } from '../../components/common/ui';
import { FilterDate, FilterSelect, ListCard } from '../../components/tables/DataTable';
import { useAuth } from '../../context/AuthContext';
import { useFeedback } from '../../context/FeedbackContext';
import { useAction } from '../../hooks/useAction';
import { useList } from '../../hooks/useList';
import { post } from '../../services/api';
import { date } from '../../utils/format';

const STATUSES: [string, string][] = [['draft', 'Draft'], ['sent', 'Sent'], ['accepted', 'Accepted'], ['rejected', 'Rejected'], ['expired', 'Expired']];

function QuotationList() {
  const list = useList('/quotations');
  return (
    <ListCard
      list={list}
      placeholder="Search number, customer or company"
      rowLink={(r) => `/app/quotations/${r.id}`}
      columns={quotationColumns('/app/quotations')}
      filters={
        <>
          <FilterSelect label="Status" value={list.param('status')} onChange={(v) => list.setParam('status', v)} options={STATUSES} />
          <FilterDate label="From" value={list.param('from')} onChange={(v) => list.setParam('from', v)} />
          <FilterDate label="To" value={list.param('to')} onChange={(v) => list.setParam('to', v)} />
          {list.param('expiringWithin') && (
            <Button variant="ghost" small icon={X} onClick={() => list.setParam('expiringWithin', '')}>
              Expiring within {list.param('expiringWithin')} days
            </Button>
          )}
        </>
      }
    />
  );
}

function RequestList() {
  const list = useList('/requests', { fixed: { requestType: 'quotation' } });
  const { can } = useAuth();
  const feedback = useFeedback();
  const act = useAction();
  return (
    <ListCard
      list={list}
      placeholder="Search customer or plan"
      filters={<FilterSelect label="Status" value={list.param('status')} onChange={(v) => list.setParam('status', v)} options={[['pending', 'Pending'], ['quoted', 'Quoted'], ['declined', 'Declined']]} />}
      columns={[
        { key: 'customerName', header: 'Customer', render: (r) => <Link to={`/app/customers/${r.customerId}`} className="font-semibold text-brand-ink hover:underline">{r.customerName}</Link> },
        { key: 'planName', header: 'Requested', render: (r) => <>{r.planName} x {r.planQuantity}{r.productName && <span className="block text-xs text-ink-3">{r.productName}{r.variantName ? ` - ${r.variantName}` : ''} x {r.productQuantity ?? 1}</span>}</> },
        { key: 'notes', header: 'Notes', optional: true, render: (r) => r.notes ?? '-' },
        { key: 'createdAt', header: 'Received', render: (r) => <span className="whitespace-nowrap">{date(r.createdAt)}</span> },
        { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
        {
          key: 'actions',
          header: '',
          align: 'right',
          render: (r) =>
            r.status === 'pending' && can('quotations.manage') ? (
              <span className="inline-flex gap-1">
                <Link to={`/app/quotations/new?requestId=${r.id}`} className={buttonClass('secondary', true)}>Create quotation</Link>
                <Button
                  variant="ghost"
                  small
                  onClick={async () => {
                    const reason = await feedback.confirm({ title: 'Decline request', message: `Decline this request from ${r.customerName}? They will be notified.`, danger: true, confirmLabel: 'Decline', reasonLabel: 'Note to the customer (optional)' });
                    if (reason !== false && (await act(() => post(`/requests/${r.id}/decline`, { note: typeof reason === 'string' ? reason : null }), 'Request declined'))) void list.reload();
                  }}
                >
                  Decline
                </Button>
              </span>
            ) : r.quotationId ? (
              <Link to={`/app/quotations/${r.quotationId}`} className="text-sm text-brand-ink hover:underline">View quotation</Link>
            ) : null,
        },
      ]}
    />
  );
}

export default function QuotationsPage() {
  const { can } = useAuth();
  const [search, setSearch] = useSearchParams();
  const tab = search.get('tab') ?? 'quotations';
  return (
    <>
      <PageHeader
        title="Quotations"
        subtitle="Prepare, send and track customer quotations."
        crumbs={[{ label: 'Dashboard', to: '/app/dashboard' }, { label: 'Quotations' }]}
        actions={
          can('quotations.manage') && (
            <Link to="/app/quotations/new" className={buttonClass()}>
              <Plus size={16} /> New quotation
            </Link>
          )
        }
      />
      <Tabs tabs={[{ key: 'quotations', label: 'Quotations' }, { key: 'requests', label: 'Customer requests' }]} active={tab} onChange={(key) => setSearch(key === 'quotations' ? {} : { tab: key })} />
      {tab === 'requests' ? <RequestList /> : <QuotationList />}
    </>
  );
}
