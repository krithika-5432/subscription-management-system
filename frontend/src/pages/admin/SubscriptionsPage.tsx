import { Plus, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { subscriptionColumns } from '../../components/common/shared';
import { Button, buttonClass, PageHeader } from '../../components/common/ui';
import { FilterDate, FilterSelect, ListCard } from '../../components/tables/DataTable';
import { useAuth } from '../../context/AuthContext';
import { useList } from '../../hooks/useList';

const STATUSES: [string, string][] = [['draft', 'Draft'], ['quotation', 'Quotation'], ['confirmed', 'Confirmed'], ['active', 'Active'], ['paused', 'Paused'], ['closed', 'Closed']];

export default function SubscriptionsPage() {
  const list = useList('/subscriptions');
  const { can } = useAuth();
  return (
    <>
      <PageHeader
        title="Subscriptions"
        subtitle="Every subscription and where it is in its lifecycle."
        crumbs={[{ label: 'Dashboard', to: '/app/dashboard' }, { label: 'Subscriptions' }]}
        actions={can('subscriptions.manage') && <Link to="/app/subscriptions/new" className={buttonClass()}><Plus size={16} /> New subscription</Link>}
      />
      <ListCard
        list={list}
        placeholder="Search number, customer or plan"
        rowLink={(r) => `/app/subscriptions/${r.id}`}
        columns={subscriptionColumns('/app/subscriptions')}
        filters={
          <>
            <FilterSelect label="Status" value={list.param('status')} onChange={(v) => list.setParam('status', v)} options={STATUSES} />
            <FilterDate label="Started from" value={list.param('from')} onChange={(v) => list.setParam('from', v)} />
            <FilterDate label="to" value={list.param('to')} onChange={(v) => list.setParam('to', v)} />
            {list.param('expiringWithin') && <Button variant="ghost" small icon={X} onClick={() => list.setParam('expiringWithin', '')}>Expiring within {list.param('expiringWithin')} days</Button>}
          </>
        }
      />
    </>
  );
}
