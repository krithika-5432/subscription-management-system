import { CheckCircle2, Clock, FileText, Inbox, Timer, Users, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { buttonClass, Card, Loaded, PageHeader, StatCard, StatGrid } from '../../components/common/ui';
import { Table } from '../../components/tables/DataTable';
import { useFetch } from '../../hooks/useFetch';
import { get } from '../../services/api';
import type { Row } from '../../types';
import { dateTime, titleCase } from '../../utils/format';

export const activityColumns = [
  { key: 'action', header: 'Activity', render: (r: Row) => titleCase(r.action) },
  { key: 'userName', header: 'By', render: (r: Row) => r.userName ?? 'System' },
  { key: 'createdAt', header: 'When', render: (r: Row) => dateTime(r.createdAt) },
];

export default function SalesDashboard() {
  const state = useFetch<Row>(() => get('/dashboard/sales'), []);
  return (
    <>
      <PageHeader
        title="Sales Dashboard"
        subtitle="Customers and quotations at a glance."
        actions={
          <Link to="/app/quotations/new" className={buttonClass()}>
            New quotation
          </Link>
        }
      />
      <Loaded state={state}>
        {(d) => (
          <>
            <StatGrid>
              <StatCard label="Total customers" value={d.customers.toLocaleString('en-IN')} icon={Users} to="/app/customers" />
              <StatCard label="Total quotations" value={d.quotations.total.toLocaleString('en-IN')} icon={FileText} to="/app/quotations" />
              <StatCard label="Pending quotations" value={d.quotations.pending} hint="Sent, awaiting a response" icon={Clock} to="/app/quotations?status=sent" />
              <StatCard label="Accepted" value={d.quotations.accepted} icon={CheckCircle2} tone="ok" to="/app/quotations?status=accepted" />
              <StatCard label="Rejected" value={d.quotations.rejected} icon={XCircle} tone="bad" to="/app/quotations?status=rejected" />
              <StatCard label="Expiring soon" value={d.quotations.expiringSoon} hint={`Within ${d.expiringDays} days`} icon={Timer} tone="warn" to={`/app/quotations?expiringWithin=${d.expiringDays}`} />
              <StatCard label="Customer requests" value={d.pendingRequests} hint="Waiting for a quotation" icon={Inbox} to="/app/quotations?tab=requests" />
            </StatGrid>
            <Card title="Recent customer activity" flush>
              <Table columns={activityColumns} rows={d.activity} />
            </Card>
          </>
        )}
      </Loaded>
    </>
  );
}
