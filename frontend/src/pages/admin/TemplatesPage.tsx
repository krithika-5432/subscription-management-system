import { Copy, Eye, FileText, Pencil, Plus, Power } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { Badge, Button, buttonClass, Modal, PageHeader, StatusBadge } from '../../components/common/ui';
import { FormGrid, rules, SelectField, TextAreaField, TextField, useSubmit, useZodForm } from '../../components/forms/fields';
import { cleanLines, emptyPlanLine, LineEditor, linesSchema, toFormLines } from '../../components/forms/LineEditor';
import { FilterSelect, ListCard } from '../../components/tables/DataTable';
import { useAuth } from '../../context/AuthContext';
import { useFeedback } from '../../context/FeedbackContext';
import { useAction } from '../../hooks/useAction';
import { useList } from '../../hooks/useList';
import { patch, post, put } from '../../services/api';
import type { Row } from '../../types';
import { money } from '../../utils/format';

const STATUSES: [string, string][] = [['active', 'Active'], ['inactive', 'Inactive']];
const schema = z.object({ name: rules.required, description: z.string().optional(), validityDays: rules.count, terms: z.string().optional(), status: rules.required, items: linesSchema });

function TemplateForm({ template, onClose, onSaved }: { template: Row | null; onClose: () => void; onSaved: () => void }) {
  const feedback = useFeedback();
  const form = useZodForm(schema, {
    name: template?.name ?? '',
    description: template?.description ?? '',
    validityDays: template?.validityDays ?? 30,
    terms: template?.terms ?? '',
    status: template?.status ?? 'active',
    items: template ? toFormLines(template.items) : [emptyPlanLine()],
  });
  const submit = useSubmit(form);
  return (
    <Modal
      title={template ? 'Edit template' : 'Add template'}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="template-form" loading={form.formState.isSubmitting}>Save</Button>
        </>
      }
    >
      <form
        id="template-form"
        noValidate
        className="space-y-4"
        onSubmit={submit(async (values) => {
          const body = { ...values, items: cleanLines(values.items) };
          if (template) await put(`/templates/${template.id}`, body);
          else await post('/templates', body);
          feedback.success('Template saved');
          onSaved();
        })}
      >
        <FormGrid>
          <TextField form={form} name="name" label="Template name" required />
          <TextField form={form} name="validityDays" label="Validity (days)" type="number" min="1" required />
          <SelectField form={form} name="status" label="Status" options={STATUSES} required />
        </FormGrid>
        <TextAreaField form={form} name="description" label="Description" rows={2} />
        <div>
          <p className="mb-2 text-xs font-semibold text-ink-2">Default lines</p>
          <LineEditor form={form} name="items" />
        </div>
        <TextAreaField form={form} name="terms" label="Terms and conditions" rows={4} />
      </form>
    </Modal>
  );
}

function TemplatePreview({ template, onClose, canUse }: { template: Row; onClose: () => void; canUse: boolean }) {
  return (
    <Modal
      title={template.name}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          {canUse && template.status === 'active' && <Link to={`/app/quotations/new?templateId=${template.id}`} className={buttonClass()}>Use template</Link>}
        </>
      }
    >
      {template.description && <p className="mb-3 text-sm text-ink-2">{template.description}</p>}
      <p className="mb-3 text-xs text-ink-3">Valid for {template.validityDays} days from the quotation date</p>
      <ul className="mb-4 divide-y divide-line rounded-md border border-line">
        {template.items.map((item: Row) => (
          <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <span className="text-ink">
              {item.itemType === 'plan' ? item.planName : `${item.productName}${item.variantName ? ` - ${item.variantName}` : ''}`}
              {item.itemType === 'plan' && <span className="ml-2"><Badge tone="brand">Plan</Badge></span>}
              <span className="ml-1 text-ink-3">x {item.quantity}</span>
            </span>
            <span className="tnum whitespace-nowrap text-ink-2">{money(item.unitPrice)} each</span>
          </li>
        ))}
      </ul>
      {template.terms && (
        <>
          <p className="mb-1 text-xs font-semibold text-ink-3">Terms and conditions</p>
          <p className="text-sm whitespace-pre-wrap text-ink-2">{template.terms}</p>
        </>
      )}
    </Modal>
  );
}

export default function TemplatesPage() {
  const list = useList('/templates');
  const { user, can } = useAuth();
  const isAdmin = user?.role === 'admin';
  const canUse = can('quotations.manage');
  const feedback = useFeedback();
  const act = useAction();
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const [previewing, setPreviewing] = useState<Row | null>(null);
  return (
    <>
      <PageHeader
        title="Quotation Templates"
        subtitle="Reusable starting points for customer quotations."
        crumbs={[{ label: 'Dashboard', to: '/app/dashboard' }, { label: 'Quotation Templates' }]}
        actions={isAdmin && <Button icon={Plus} onClick={() => setEditing('new')}>Add template</Button>}
      />
      <ListCard
        list={list}
        placeholder="Search templates"
        filters={<FilterSelect label="Status" value={list.param('status')} onChange={(v) => list.setParam('status', v)} options={STATUSES} />}
        columns={[
          { key: 'name', header: 'Template', sort: 'name', render: (r) => <button onClick={() => setPreviewing(r)} className="text-left font-semibold text-brand-ink hover:underline">{r.name}</button> },
          { key: 'description', header: 'Description', optional: true, render: (r) => r.description ?? '-' },
          { key: 'items', header: 'Lines', align: 'right', render: (r) => r.items.length },
          { key: 'validityDays', header: 'Validity', sort: 'validityDays', align: 'right', render: (r) => `${r.validityDays} days` },
          { key: 'status', header: 'Status', sort: 'status', render: (r) => <StatusBadge status={r.status} /> },
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: (r) => (
              <span className="inline-flex gap-1">
                <Button variant="ghost" small icon={Eye} aria-label={`Preview ${r.name}`} title="Preview" onClick={() => setPreviewing(r)} />
                {canUse && r.status === 'active' && (
                  <Link to={`/app/quotations/new?templateId=${r.id}`} aria-label={`Use ${r.name}`} title="Use template" className={buttonClass('ghost', true)}>
                    <FileText size={14} />
                  </Link>
                )}
                {isAdmin && (
                  <>
                    <Button variant="ghost" small icon={Pencil} aria-label={`Edit ${r.name}`} title="Edit" onClick={() => setEditing(r)} />
                    <Button
                      variant="ghost"
                      small
                      icon={Copy}
                      aria-label={`Duplicate ${r.name}`}
                      title="Duplicate"
                      onClick={async () => {
                        if (await act(() => post(`/templates/${r.id}/duplicate`), 'Template duplicated as inactive')) void list.reload();
                      }}
                    />
                    <Button
                      variant="ghost"
                      small
                      icon={Power}
                      aria-label={`${r.status === 'active' ? 'Deactivate' : 'Activate'} ${r.name}`}
                      title={r.status === 'active' ? 'Deactivate' : 'Activate'}
                      onClick={async () => {
                        const next = r.status === 'active' ? 'inactive' : 'active';
                        const ok = await feedback.confirm({ title: `${next === 'active' ? 'Activate' : 'Deactivate'} template`, message: next === 'active' ? `${r.name} will be available to Sales.` : `Sales will no longer be able to use ${r.name}.`, danger: next === 'inactive', confirmLabel: next === 'active' ? 'Activate' : 'Deactivate' });
                        if (ok && (await act(() => patch(`/templates/${r.id}/status`, { status: next }), 'Template updated'))) void list.reload();
                      }}
                    />
                  </>
                )}
              </span>
            ),
          },
        ]}
      />
      {editing && (
        <TemplateForm
          template={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void list.reload();
          }}
        />
      )}
      {previewing && <TemplatePreview template={previewing} canUse={canUse} onClose={() => setPreviewing(null)} />}
    </>
  );
}
