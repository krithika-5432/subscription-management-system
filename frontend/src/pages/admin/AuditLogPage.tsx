import { PageHeader } from '../../components/common/ui';
import { FilterSelect, ListCard } from '../../components/tables/DataTable';
import { useList } from '../../hooks/useList';
import { dateTime, titleCase } from '../../utils/format';

const TYPES = ['customer', 'discount', 'invoice', 'payment', 'plan', 'product', 'quotation', 'quotation_request', 'quotation_template', 'settings', 'staff_profile', 'subscription', 'tax_rule', 'user'];

export default function AuditLogPage() {
  const list = useList('/audit-logs', { pageSize: 25 });
  return (
    <>
      <PageHeader title="Audit Log" subtitle="Important administrative and financial activity." crumbs={[{ label: 'Dashboard', to: '/app/dashboard' }, { label: 'Audit Log' }]} />
      <ListCard
        list={list}
        placeholder="Search action, record or person"
        filters={<FilterSelect label="Record type" value={list.param('entityType')} onChange={(v) => list.setParam('entityType', v)} options={TYPES.map((t) => [t, titleCase(t)])} />}
        columns={[
          { key: 'createdAt', header: 'When', render: (r) => <span className="whitespace-nowrap">{dateTime(r.createdAt)}</span> },
          { key: 'userName', header: 'By', render: (r) => r.userName ?? 'System' },
          { key: 'action', header: 'Action', render: (r) => titleCase(r.action) },
          { key: 'entityType', header: 'Record', render: (r) => titleCase(r.entityType) },
          { key: 'details', header: 'Details', optional: true, render: (r) => (r.details ? <code className="text-xs break-all text-ink-2">{JSON.stringify(r.details)}</code> : '-') },
        ]}
      />
    </>
  );
}
