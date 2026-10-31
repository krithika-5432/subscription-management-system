import { Pencil, Plus, Power } from 'lucide-react';
import { useState } from 'react';
import { z } from 'zod';
import { Button, Modal, PageHeader, StatusBadge } from '../../components/common/ui';
import { FormGrid, rules, SelectField, TextAreaField, TextField, useSubmit, useZodForm } from '../../components/forms/fields';
import { FilterSelect, ListCard } from '../../components/tables/DataTable';
import { useFeedback } from '../../context/FeedbackContext';
import { useAction } from '../../hooks/useAction';
import { useList } from '../../hooks/useList';
import { patch, post, put } from '../../services/api';
import type { Row } from '../../types';

const STATUSES: [string, string][] = [['active', 'Active'], ['inactive', 'Inactive']];
const TARGETS: [string, string][] = [['all', 'Products and subscription plans'], ['products', 'Products only'], ['plans', 'Subscription plans only']];
const schema = z.object({
  name: rules.required,
  rate: z.string().refine((v) => v !== '' && Number(v) >= 0 && Number(v) <= 100, 'Enter a rate from 0 to 100'),
  appliesTo: rules.required,
  description: z.string().optional(),
  status: rules.required,
});

function TaxForm({ tax, onClose, onSaved }: { tax: Row | null; onClose: () => void; onSaved: () => void }) {
  const feedback = useFeedback();
  const form = useZodForm(schema, { name: tax?.name ?? '', rate: tax?.rate ?? '', appliesTo: tax?.appliesTo ?? 'all', description: tax?.description ?? '', status: tax?.status ?? 'active' });
  const submit = useSubmit(form);
  return (
    <Modal
      title={tax ? 'Edit tax rule' : 'Add tax rule'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="tax-form" loading={form.formState.isSubmitting}>Save</Button>
        </>
      }
    >
      <form
        id="tax-form"
        noValidate
        className="space-y-4"
        onSubmit={submit(async (values) => {
          if (tax) await put(`/taxes/${tax.id}`, values);
          else await post('/taxes', values);
          feedback.success('Tax rule saved');
          onSaved();
        })}
      >
        <FormGrid>
          <TextField form={form} name="name" label="Tax name" required />
          <TextField form={form} name="rate" label="Rate (%)" type="number" min="0" max="100" step="0.01" required />
          <SelectField form={form} name="appliesTo" label="Applies to" options={TARGETS} required />
          <SelectField form={form} name="status" label="Status" options={STATUSES} required />
        </FormGrid>
        <TextAreaField form={form} name="description" label="Description" />
        {tax && <p className="text-xs text-ink-2">Documents already created keep the rate they were issued with. A change applies to new quotations and invoices.</p>}
      </form>
    </Modal>
  );
}

export default function TaxesPage() {
  const list = useList('/taxes');
  const feedback = useFeedback();
  const act = useAction();
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  return (
    <>
      <PageHeader title="Taxes" subtitle="Active rules are applied automatically to new quotations and invoices." crumbs={[{ label: 'Dashboard', to: '/app/dashboard' }, { label: 'Taxes' }]} actions={<Button icon={Plus} onClick={() => setEditing('new')}>Add tax rule</Button>} />
      <ListCard
        list={list}
        placeholder="Search tax rules"
        filters={<FilterSelect label="Status" value={list.param('status')} onChange={(v) => list.setParam('status', v)} options={STATUSES} />}
        columns={[
          { key: 'name', header: 'Name', sort: 'name', render: (r) => <span className="font-semibold">{r.name}</span> },
          { key: 'rate', header: 'Rate', sort: 'rate', align: 'right', render: (r) => `${Number(r.rate)}%` },
          { key: 'appliesTo', header: 'Applies to', render: (r) => TARGETS.find(([k]) => k === r.appliesTo)?.[1] },
          { key: 'description', header: 'Description', optional: true, render: (r) => r.description ?? '-' },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: (r) => (
              <span className="inline-flex gap-1">
                <Button variant="ghost" small icon={Pencil} aria-label={`Edit ${r.name}`} onClick={() => setEditing(r)} />
                <Button
                  variant="ghost"
                  small
                  icon={Power}
                  title={r.status === 'active' ? 'Deactivate' : 'Activate'}
                  aria-label={`${r.status === 'active' ? 'Deactivate' : 'Activate'} ${r.name}`}
                  onClick={async () => {
                    const next = r.status === 'active' ? 'inactive' : 'active';
                    const ok = await feedback.confirm({ title: `${next === 'active' ? 'Activate' : 'Deactivate'} tax rule`, message: next === 'active' ? `${r.name} will apply to new documents.` : `${r.name} will stop applying to new documents. Existing documents do not change.`, danger: next === 'inactive', confirmLabel: next === 'active' ? 'Activate' : 'Deactivate' });
                    if (ok && (await act(() => patch(`/taxes/${r.id}/status`, { status: next }), 'Tax rule updated'))) void list.reload();
                  }}
                />
              </span>
            ),
          },
        ]}
      />
      {editing && (
        <TaxForm
          tax={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void list.reload();
          }}
        />
      )}
    </>
  );
}
