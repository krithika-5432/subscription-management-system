import { Pencil, Plus, Power } from 'lucide-react';
import { useState } from 'react';
import { z } from 'zod';
import { Button, Modal, PageHeader, StatusBadge } from '../../components/common/ui';
import { CheckField, FormGrid, rules, SelectField, TextAreaField, TextField, useSubmit, useZodForm } from '../../components/forms/fields';
import { FilterSelect, ListCard } from '../../components/tables/DataTable';
import { useAuth } from '../../context/AuthContext';
import { useFeedback } from '../../context/FeedbackContext';
import { useAction } from '../../hooks/useAction';
import { useList } from '../../hooks/useList';
import { patch, post, put } from '../../services/api';
import type { Row } from '../../types';
import { date, FREQUENCY_LABEL, money, titleCase } from '../../utils/format';

const FREQUENCIES: [string, string][] = ['daily', 'weekly', 'monthly', 'yearly'].map((f) => [f, titleCase(f)]);
const STATUSES: [string, string][] = [['active', 'Active'], ['inactive', 'Inactive']];
const RENEWALS: [string, string][] = [['manual', 'Manual: staff renew it'], ['auto', 'Automatic at expiry'], ['none', 'No renewal: closes at expiry']];

const schema = z
  .object({
    name: rules.required,
    description: z.string().optional(),
    price: rules.money,
    billingFrequency: rules.required,
    minQuantity: rules.count,
    termCycles: rules.count,
    availableFrom: z.string().optional(),
    availableUntil: z.string().optional(),
    autoClose: z.boolean(),
    allowEarlyClose: z.boolean(),
    allowPause: z.boolean(),
    renewalMode: rules.required,
    status: rules.required,
  })
  .refine((p) => !p.availableFrom || !p.availableUntil || p.availableUntil >= p.availableFrom, { message: 'End date must be on or after the start date', path: ['availableUntil'] });

function PlanForm({ plan, onClose, onSaved }: { plan: Row | null; onClose: () => void; onSaved: () => void }) {
  const feedback = useFeedback();
  const form = useZodForm(schema, {
    name: plan?.name ?? '',
    description: plan?.description ?? '',
    price: plan?.price ?? '',
    billingFrequency: plan?.billingFrequency ?? 'monthly',
    minQuantity: plan?.minQuantity ?? 1,
    termCycles: plan?.termCycles ?? 12,
    availableFrom: plan?.availableFrom ?? '',
    availableUntil: plan?.availableUntil ?? '',
    autoClose: plan?.autoClose ?? false,
    allowEarlyClose: plan?.allowEarlyClose ?? true,
    allowPause: plan?.allowPause ?? true,
    renewalMode: plan?.renewalMode ?? 'manual',
    status: plan?.status ?? 'active',
  });
  const submit = useSubmit(form);
  return (
    <Modal
      title={plan ? 'Edit plan' : 'Add plan'}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="plan-form" loading={form.formState.isSubmitting}>Save</Button>
        </>
      }
    >
      <form
        id="plan-form"
        noValidate
        className="space-y-4"
        onSubmit={submit(async (values) => {
          if (plan) await put(`/plans/${plan.id}`, values);
          else await post('/plans', values);
          feedback.success(plan ? 'Plan updated' : 'Plan added');
          onSaved();
        })}
      >
        <FormGrid>
          <TextField form={form} name="name" label="Plan name" required />
          <TextField form={form} name="price" label="Price per unit (INR)" type="number" min="0" step="0.01" required />
          <SelectField form={form} name="billingFrequency" label="Billing frequency" options={FREQUENCIES} required />
          <TextField form={form} name="minQuantity" label="Minimum quantity" type="number" min="1" required />
          <TextField form={form} name="termCycles" label="Term length (billing cycles)" type="number" min="1" hint="A monthly plan with 12 cycles runs for one year." required />
          <SelectField form={form} name="renewalMode" label="Renewal behaviour" options={RENEWALS} required />
          <TextField form={form} name="availableFrom" label="Available from" type="date" />
          <TextField form={form} name="availableUntil" label="Available until" type="date" />
          <SelectField form={form} name="status" label="Status" options={STATUSES} required />
        </FormGrid>
        <TextAreaField form={form} name="description" label="Description" />
        <div className="grid gap-3 sm:grid-cols-3">
          <CheckField form={form} name="autoClose" label="Close automatically" hint="At the end of the plan period." />
          <CheckField form={form} name="allowEarlyClose" label="Allow early closure" />
          <CheckField form={form} name="allowPause" label="Allow pausing" />
        </div>
      </form>
    </Modal>
  );
}

export default function PlansPage() {
  const list = useList('/plans');
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const feedback = useFeedback();
  const act = useAction();
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  return (
    <>
      <PageHeader
        title="Subscription Plans"
        subtitle="Pricing, billing frequency, availability and renewal rules."
        crumbs={[{ label: 'Dashboard', to: '/app/dashboard' }, { label: 'Subscription Plans' }]}
        actions={isAdmin && <Button icon={Plus} onClick={() => setEditing('new')}>Add plan</Button>}
      />
      <ListCard
        list={list}
        placeholder="Search plans"
        filters={
          <>
            <FilterSelect label="Billing" value={list.param('billingFrequency')} onChange={(v) => list.setParam('billingFrequency', v)} options={FREQUENCIES} />
            <FilterSelect label="Status" value={list.param('status')} onChange={(v) => list.setParam('status', v)} options={STATUSES} />
          </>
        }
        columns={[
          { key: 'name', header: 'Plan', sort: 'name', render: (r) => <span className="font-semibold">{r.name}</span> },
          { key: 'price', header: 'Price', sort: 'price', align: 'right', render: (r) => money(r.price) },
          { key: 'billingFrequency', header: 'Billing', sort: 'billingFrequency', render: (r) => FREQUENCY_LABEL[r.billingFrequency] },
          { key: 'minQuantity', header: 'Min. qty', optional: true },
          { key: 'renewalMode', header: 'Renewal', optional: true, render: (r) => titleCase(r.renewalMode) },
          { key: 'availableUntil', header: 'Available until', optional: true, render: (r) => (r.availableUntil ? date(r.availableUntil) : 'No end date') },
          { key: 'status', header: 'Status', sort: 'status', render: (r) => <StatusBadge status={r.status} /> },
          ...(isAdmin
            ? [{
                key: 'actions',
                header: '',
                align: 'right' as const,
                render: (r: Row) => (
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
                        const ok = await feedback.confirm({ title: `${next === 'active' ? 'Activate' : 'Deactivate'} plan`, message: next === 'active' ? `${r.name} can be sold again.` : `${r.name} will no longer be offered. Existing subscriptions continue.`, danger: next === 'inactive', confirmLabel: next === 'active' ? 'Activate' : 'Deactivate' });
                        if (ok && (await act(() => patch(`/plans/${r.id}/status`, { status: next }), 'Plan updated'))) void list.reload();
                      }}
                    />
                  </span>
                ),
              }]
            : []),
        ]}
      />
      {editing && (
        <PlanForm
          plan={editing === 'new' ? null : editing}
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
