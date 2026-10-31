import { CalendarClock, CheckCircle2, Clock, PauseCircle, RefreshCw, Repeat } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, Loaded, PageHeader, StatCard, StatGrid, StatusBadge } from '../../components/common/ui';
import { Table } from '../../components/tables/DataTable';
import { useFetch } from '../../hooks/useFetch';
import { get } from '../../services/api';
import type { Row } from '../../types';
import { date } from '../../utils/format';
import { activityColumns } from './SalesDashboard';

export default function OperationsDashboard() {
  const state = useFetch<Row>(() => get('/dashboard/operations'), []);
  return (
    <>
      <PageHeader title="Operations Dashboard" subtitle="Subscriptions, renewals and billing activity." />
      <Loaded state={state}>
        {(d) => (
          <>
            <StatGrid>
              <StatCard label="Total subscriptions" value={d.subscriptions.total.toLocaleString('en-IN')} icon={Repeat} to="/app/subscriptions" />
              <StatCard label="Active" value={d.subscriptions.active.toLocaleString('en-IN')} icon={CheckCircle2} tone="ok" to="/app/subscriptions?status=active" />
              <StatCard label="Expiring soon" value={d.subscriptions.expiringSoon} hint={`Within ${d.expiringDays} days`} icon={CalendarClock} tone="warn" to={`/app/subscriptions?expiringWithin=${d.expiringDays}`} />
              <StatCard label="Pending activation" value={d.subscriptions.pendingActivation} icon={Clock} to="/app/subscriptions?status=confirmed" />
              <StatCard label="Paused" value={d.subscriptions.paused} icon={PauseCircle} to="/app/subscriptions?status=paused" />
              <StatCard label="Renewals due" value={d.renewalsDue} icon={RefreshCw} tone="warn" to="/app/renewals" />
            </StatGrid>
            <div className="grid gap-5 xl:grid-cols-2">
              <Card title="Upcoming expirations" flush>
                <Table
                  rows={d.expiring}
                  rowLink={(r) => `/app/subscriptions/${r.id}`}
                  empty={<p className="p-6 text-center text-sm text-ink-3">Nothing is expiring soon</p>}
                  columns={[
                    { key: 'subscriptionNumber', header: 'Subscription', render: (r) => <Link to={`/app/subscriptions/${r.id}`} className="font-semibold text-brand-ink hover:underline">{r.subscriptionNumber}</Link> },
                    { key: 'customerName', header: 'Customer' },
                    { key: 'expiryDate', header: 'Expires', render: (r) => date(r.expiryDate) },
                    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                  ]}
                />
              </Card>
              <Card title="Recent billing activity" flush>
                <Table columns={activityColumns} rows={d.activity} />
              </Card>
            </div>
          </>
        )}
      </Loaded>
    </>
  );
}
