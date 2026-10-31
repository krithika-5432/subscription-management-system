import { Check, RefreshCw, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { Badge, Button, PageHeader, StatusBadge, Tabs } from '../../components/common/ui';
import { FilterSelect, ListCard } from '../../components/tables/DataTable';
import { useFeedback } from '../../context/FeedbackContext';
import { useAction } from '../../hooks/useAction';
import { useList } from '../../hooks/useList';
import { post } from '../../services/api';
import type { Row } from '../../types';
import { date, money, titleCase, today } from '../../utils/format';

const WINDOWS: [string, string][] = [['7', 'Next 7 days'], ['30', 'Next 30 days'], ['60', 'Next 60 days'], ['90', 'Next 90 days'], ['365', 'Next 12 months']];

function RenewalsDue() {
  const [search, setSearch] = useSearchParams();
  const within = search.get('within') ?? '60';
  const list = useList('/subscriptions', { fixed: { expiringWithin: within } });
  const feedback = useFeedback();
  const act = useAction();
  return (
    <ListCard
      list={list}
      placeholder="Search number, customer or plan"
      filters={
        <FilterSelect
          label="Window"
          value={within}
          onChange={(v) => {
            const next = new URLSearchParams(search);
            next.set('within', v || '60');
            next.delete('page');
            setSearch(next, { replace: true });
          }}
          options={WINDOWS}
        />
      }
      columns={[
        { key: 'subscriptionNumber', header: 'Subscription', render: (r) => <Link to={`/app/subscriptions/${r.id}`} className="font-semibold whitespace-nowrap text-brand-ink hover:underline">{r.subscriptionNumber}</Link> },
        { key: 'customerName', header: 'Customer' },
        { key: 'planName', header: 'Plan', optional: true },
        { key: 'expiryDate', header: 'Expires', render: (r) => <span className="inline-flex items-center gap-2 whitespace-nowrap">{date(r.expiryDate)}{r.expiryDate <= today() && <Badge tone="bad">Past expiry</Badge>}</span> },
        { key: 'renewalMode', header: 'Renewal', render: (r) => titleCase(r.renewalMode) },
        { key: 'total', header: 'Per cycle', align: 'right', optional: true, render: (r) => money(r.total) },
        { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
        {
          key: 'actions',
          header: '',
          align: 'right',
          render: (r) =>
            r.status === 'active' && r.renewalMode !== 'none' ? (
              <Button
                variant="secondary"
                small
                icon={RefreshCw}
                onClick={async () => {
                  const ok = await feedback.confirm({ title: 'Renew subscription', message: `Extend ${r.subscriptionNumber} by one term of ${r.termCycles} ${r.billingFrequency} cycle(s), from ${date(r.expiryDate)}?`, confirmLabel: 'Renew' });
                  if (ok && (await act(() => post(`/subscriptions/${r.id}/renew`), 'Subscription renewed'))) void list.reload();
                }}
              >
                Renew
              </Button>
            ) : null,
        },
      ]}
    />
  );
}

function AddonRequests() {
  const list = useList('/requests', { fixed: { requestType: 'addon' } });
  const feedback = useFeedback();
  const act = useAction();
  return (
    <ListCard
      list={list}
      placeholder="Search customer or product"
      filters={<FilterSelect label="Status" value={list.param('status')} onChange={(v) => list.setParam('status', v)} options={[['pending', 'Pending'], ['approved', 'Approved'], ['declined', 'Declined']]} />}
      columns={[
        { key: 'customerName', header: 'Customer' },
        { key: 'subscriptionNumber', header: 'Subscription', render: (r: Row) => <Link to={`/app/subscriptions/${r.subscriptionId}`} className="whitespace-nowrap text-brand-ink hover:underline">{r.subscriptionNumber}</Link> },
        { key: 'productName', header: 'Add-on', render: (r: Row) => `${r.productName}${r.variantName ? ` - ${r.variantName}` : ''} x ${r.productQuantity ?? 1}` },
        { key: 'notes', header: 'Notes', optional: true, render: (r: Row) => r.notes ?? '-' },
        { key: 'status', header: 'Status', render: (r: Row) => <StatusBadge status={r.status} /> },
        {
          key: 'actions',
          header: '',
          align: 'right',
          render: (r: Row) =>
            r.status === 'pending' ? (
              <span className="inline-flex gap-1">
                <Button
                  variant="secondary"
                  small
                  icon={Check}
                  onClick={async () => {
                    const ok = await feedback.confirm({ title: 'Approve add-on', message: `Add ${r.productName} to ${r.subscriptionNumber}? It is billed from the next invoice. Issued invoices do not change.`, confirmLabel: 'Approve' });
                    if (ok && (await act(() => post(`/requests/${r.id}/approve-addon`), 'Add-on approved'))) void list.reload();
                  }}
                >
                  Approve
                </Button>
                <Button
                  variant="ghost"
                  small
                  icon={X}
                  onClick={async () => {
                    const reason = await feedback.confirm({ title: 'Decline add-on', message: 'The customer will be notified.', danger: true, confirmLabel: 'Decline', reasonLabel: 'Note to the customer (optional)' });
                    if (reason !== false && (await act(() => post(`/requests/${r.id}/decline`, { note: typeof reason === 'string' ? reason : null }), 'Request declined'))) void list.reload();
                  }}
                >
                  Decline
                </Button>
              </span>
            ) : null,
        },
      ]}
    />
  );
}

export default function RenewalsPage() {
  const [search, setSearch] = useSearchParams();
  const tab = search.get('tab') ?? 'renewals';
  return (
    <>
      <PageHeader title="Renewals" subtitle="Subscriptions approaching expiry, and add-on requests awaiting approval." crumbs={[{ label: 'Dashboard', to: '/app/dashboard' }, { label: 'Renewals' }]} />
      <Tabs tabs={[{ key: 'renewals', label: 'Renewals due' }, { key: 'addons', label: 'Add-on requests' }]} active={tab} onChange={(key) => setSearch(key === 'renewals' ? {} : { tab: key })} />
      {tab === 'addons' ? <AddonRequests /> : <RenewalsDue />}
    </>
  );
}
