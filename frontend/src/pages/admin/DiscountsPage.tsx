import { Pencil, Plus, Power } from 'lucide-react';
import { useState } from 'react';
import { useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Button, Modal, PageHeader, StatusBadge } from '../../components/common/ui';
import { CheckField, FieldShell, FormGrid, rules, SelectField, TextField, useSubmit, useZodForm } from '../../components/forms/fields';
import { useCatalog } from '../../components/forms/LineEditor';
import { FilterSelect, ListCard } from '../../components/tables/DataTable';
import { useFeedback } from '../../context/FeedbackContext';
import { useAction } from '../../hooks/useAction';
import { useList } from '../../hooks/useList';
import { patch, post, put } from '../../services/api';
import type { Row } from '../../types';
import { date, money, today } from '../../utils/format';

const STATUSES: [string, string][] = [['active', 'Active'], ['inactive', 'Inactive']];
const TYPES: [string, string][] = [['percentage', 'Percentage'], ['fixed', 'Fixed amount']];
const schema = z
  .object({
    name: rules.required,
    discountType: rules.required,
    value: rules.positive,
    minPurchase: rules.money,
    minQuantity: rules.count,
    startDate: rules.date,
    endDate: rules.date,
    usageLimit: z.string().optional(),
    scope: rules.required,
    autoApply: z.boolean(),
    status: rules.required,
    productIds: z.array(z.string()),
    planIds: z.array(z.string()),
  })
  .refine((d) => d.discountType !== 'percentage' || Number(d.value) <= 100, { message: 'A percentage cannot exceed 100', path: ['value'] })
  .refine((d) => d.endDate >= d.startDate, { message: 'End date must be on or after the start date', path: ['endDate'] })
  .refine((d) => !d.usageLimit || (Number.isInteger(Number(d.usageLimit)) && Number(d.usageLimit) >= 1), { message: 'Enter a whole number of 1 or more, or leave empty', path: ['usageLimit'] })
  .refine((d) => d.scope === 'all' || d.productIds.length + d.planIds.length > 0, { message: 'Select at least one product or plan', path: ['scope'] });

function DiscountForm({ discount, onClose, onSaved }: { discount: Row | null; onClose: () => void; onSaved: () => void }) {
  const feedback = useFeedback();
  const catalog = useCatalog();
  const form = useZodForm(schema, {
    name: discount?.name ?? '',
    discountType: discount?.discountType ?? 'percentage',
    value: discount?.value ?? '',
    minPurchase: discount?.minPurchase ?? '0',
    minQuantity: discount?.minQuantity ?? 1,
    startDate: discount?.startDate ?? today(),
    endDate: discount?.endDate ?? '',
    usageLimit: discount?.usageLimit ? String(discount.usageLimit) : '',
    scope: discount?.scope ?? 'all',
    autoApply: discount?.autoApply ?? false,
    status: discount?.status ?? 'active',
    productIds: discount?.productIds ?? [],
    planIds: discount?.planIds ?? [],
  });
  const submit = useSubmit(form);
  const scope = useWatch({ control: form.control, name: 'scope' });
  return (
    <Modal
      title={discount ? 'Edit discount' : 'Add discount'}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="discount-form" loading={form.formState.isSubmitting}>Save</Button>
        </>
      }
    >
      <form
        id="discount-form"
        noValidate
        className="space-y-4"
        onSubmit={submit(async (values) => {
          const body = { ...values, usageLimit: values.usageLimit || null };
          if (discount) await put(`/discounts/${discount.id}`, body);
          else await post('/discounts', body);
          feedback.success('Discount saved');
          onSaved();
        })}
      >
        <FormGrid>
          <TextField form={form} name="name" label="Discount name" required />
          <SelectField form={form} name="discountType" label="Discount type" options={TYPES} required />
          <TextField form={form} name="value" label="Discount value" type="number" min="0" step="0.01" required />
          <TextField form={form} name="usageLimit" label="Usage limit" type="number" min="1" hint="Number of invoices. Leave empty for no limit." />
          <TextField form={form} name="minPurchase" label="Minimum purchase (INR)" type="number" min="0" step="0.01" required />
          <TextField form={form} name="minQuantity" label="Minimum quantity" type="number" min="1" required />
          <TextField form={form} name="startDate" label="Start date" type="date" required />
          <TextField form={form} name="endDate" label="End date" type="date" required />
          <SelectField form={form} name="scope" label="Applies to" options={[['all', 'Entire subscription'], ['selected', 'Selected products and plans']]} required />
          <SelectField form={form} name="status" label="Status" options={STATUSES} required />
        </FormGrid>
        {scope === 'selected' && (
          <FieldShell label="Eligible items" error={undefined}>
            <div className="grid max-h-56 gap-1.5 overflow-y-auto rounded-md border border-line p-3 sm:grid-cols-2">
              {catalog.data?.plans.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" value={p.id} className="h-4 w-4 accent-[var(--brand)]" {...form.register('planIds')} />
                  Plan: {p.name}
                </label>
              ))}
              {catalog.data?.products.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" value={p.id} className="h-4 w-4 accent-[var(--brand)]" {...form.register('productIds')} />
                  {p.name}
                </label>
              ))}
            </div>
          </FieldShell>
        )}
        <CheckField form={form} name="autoApply" label="Apply automatically to the next eligible invoice" hint="If several apply, the invoice gets whichever saves the customer the most." />
      </form>
    </Modal>
  );
}

export default function DiscountsPage() {
  const list = useList('/discounts');
  const feedback = useFeedback();
  const act = useAction();
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  return (
    <>
      <PageHeader title="Discounts" subtitle="Eligibility is checked again on every invoice. Expired or used-up discounts stop applying." crumbs={[{ label: 'Dashboard', to: '/app/dashboard' }, { label: 'Discounts' }]} actions={<Button icon={Plus} onClick={() => setEditing('new')}>Add discount</Button>} />
      <ListCard
        list={list}
        placeholder="Search discounts"
        filters={
          <>
            <FilterSelect label="Type" value={list.param('discountType')} onChange={(v) => list.setParam('discountType', v)} options={TYPES} />
            <FilterSelect label="Status" value={list.param('status')} onChange={(v) => list.setParam('status', v)} options={STATUSES} />
          </>
        }
        columns={[
          { key: 'name', header: 'Name', sort: 'name', render: (r) => <span className="font-semibold">{r.name}</span> },
          { key: 'value', header: 'Value', sort: 'value', align: 'right', render: (r) => (r.discountType === 'percentage' ? `${Number(r.value)}%` : money(r.value)) },
          { key: 'scope', header: 'Applies to', optional: true, render: (r) => (r.scope === 'all' ? 'Entire subscription' : `${r.productIds.length + r.planIds.length} selected`) },
          { key: 'endDate', header: 'Valid until', sort: 'endDate', render: (r) => <span className="whitespace-nowrap">{date(r.endDate)}</span> },
          { key: 'usage', header: 'Used', align: 'right', render: (r) => `${r.usageCount} / ${r.usageLimit ?? 'No limit'}` },
          { key: 'status', header: 'Status', sort: 'status', render: (r) => <StatusBadge status={r.status} /> },
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
                    const ok = await feedback.confirm({ title: `${next === 'active' ? 'Activate' : 'Deactivate'} discount`, message: next === 'active' ? `${r.name} can be applied again.` : `${r.name} will stop applying from the next invoice.`, danger: next === 'inactive', confirmLabel: next === 'active' ? 'Activate' : 'Deactivate' });
                    if (ok && (await act(() => patch(`/discounts/${r.id}/status`, { status: next }), 'Discount updated'))) void list.reload();
                  }}
                />
              </span>
            ),
          },
        ]}
      />
      {editing && (
        <DiscountForm
          discount={editing === 'new' ? null : editing}
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
