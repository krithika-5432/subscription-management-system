import { Pencil, Plus, Power } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { z } from 'zod';
import { Badge, Button, Card, DefinitionList, Loaded, Modal, PageHeader, StatusBadge } from '../../components/common/ui';
import { CheckField, FormGrid, rules, SelectField, TextField, useSubmit, useZodForm } from '../../components/forms/fields';
import { Table } from '../../components/tables/DataTable';
import { useAuth } from '../../context/AuthContext';
import { useFeedback } from '../../context/FeedbackContext';
import { useAction } from '../../hooks/useAction';
import { useFetch } from '../../hooks/useFetch';
import { get, patch, post, put } from '../../services/api';
import type { Row } from '../../types';
import { money, titleCase } from '../../utils/format';
import { ProductForm } from './ProductsPage';

const variantSchema = z.object({ name: rules.required, additionalPrice: rules.money, isConfigurable: z.boolean(), status: rules.required });

function VariantForm({ productId, variant, onClose, onSaved }: { productId: string; variant: Row | null; onClose: () => void; onSaved: () => void }) {
  const feedback = useFeedback();
  const form = useZodForm(variantSchema, { name: variant?.name ?? '', additionalPrice: variant?.additionalPrice ?? '0', isConfigurable: variant?.isConfigurable ?? false, status: variant?.status ?? 'active' });
  const submit = useSubmit(form);
  return (
    <Modal
      title={variant ? 'Edit variant' : 'Add variant'}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="variant-form" loading={form.formState.isSubmitting}>Save</Button>
        </>
      }
    >
      <form
        id="variant-form"
        noValidate
        className="space-y-4"
        onSubmit={submit(async (values) => {
          if (variant) await put(`/products/${productId}/variants/${variant.id}`, values);
          else await post(`/products/${productId}/variants`, values);
          feedback.success('Variant saved');
          onSaved();
        })}
      >
        <FormGrid>
          <TextField form={form} name="name" label="Variant name" required />
          <TextField form={form} name="additionalPrice" label="Additional price (INR)" type="number" min="0" step="0.01" required />
          <SelectField form={form} name="status" label="Status" options={[['active', 'Active'], ['inactive', 'Inactive']]} required />
        </FormGrid>
        <CheckField form={form} name="isConfigurable" label="Price set per quotation" hint="For negotiated tiers such as Enterprise." />
      </form>
    </Modal>
  );
}

export default function ProductDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const feedback = useFeedback();
  const act = useAction();
  const state = useFetch<Row>(() => get(`/products/${id}`), [id]);
  const [editing, setEditing] = useState(false);
  const [variant, setVariant] = useState<Row | 'new' | null>(null);

  return (
    <Loaded state={state}>
      {(p) => (
        <>
          <PageHeader
            title={p.name}
            crumbs={[{ label: 'Dashboard', to: '/app/dashboard' }, { label: 'Products', to: '/app/products' }, { label: p.name }]}
            actions={
              isAdmin && (
                <>
                  <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>Edit</Button>
                  <Button
                    variant="secondary"
                    icon={Power}
                    onClick={async () => {
                      const next = p.status === 'active' ? 'inactive' : 'active';
                      const ok = await feedback.confirm({ title: `${next === 'active' ? 'Activate' : 'Deactivate'} product`, message: next === 'active' ? 'This product can be sold again.' : 'This product can no longer be added to new quotations. Existing subscriptions keep it.', danger: next === 'inactive', confirmLabel: next === 'active' ? 'Activate' : 'Deactivate' });
                      if (ok && (await act(() => patch(`/products/${p.id}/status`, { status: next }), 'Product updated'))) void state.reload();
                    }}
                  >
                    {p.status === 'active' ? 'Deactivate' : 'Activate'}
                  </Button>
                </>
              )
            }
          />
          <Card title="Details" className="mb-5">
            <DefinitionList
              items={[
                ['Type', titleCase(p.productType)],
                ['Status', <StatusBadge status={p.status} />],
                ['Sales price', money(p.salesPrice)],
                ...(isAdmin ? ([['Cost price', money(p.costPrice)]] as [string, string][]) : []),
                ['Add-on', p.isAddon ? <Badge tone="brand">Available as add-on</Badge> : 'No'],
                ['Description', p.description],
              ]}
            />
          </Card>
          <Card title="Variants" flush action={isAdmin && <Button small icon={Plus} onClick={() => setVariant('new')}>Add variant</Button>}>
            <Table
              rows={p.variants}
              empty={<p className="p-6 text-center text-sm text-ink-3">This product has no variants</p>}
              columns={[
                { key: 'name', header: 'Variant', render: (v) => <span className="font-semibold">{v.name}</span> },
                { key: 'additionalPrice', header: 'Additional price', align: 'right', render: (v) => (v.isConfigurable ? 'Configurable' : money(v.additionalPrice)) },
                { key: 'final', header: 'Final price', align: 'right', render: (v) => (v.isConfigurable ? 'Set per quotation' : money(Number(p.salesPrice) + Number(v.additionalPrice))) },
                { key: 'status', header: 'Status', render: (v) => <StatusBadge status={v.status} /> },
                ...(isAdmin ? [{ key: 'edit', header: '', align: 'right' as const, render: (v: Row) => <Button variant="ghost" small icon={Pencil} aria-label={`Edit ${v.name}`} onClick={() => setVariant(v)} /> }] : []),
              ]}
            />
          </Card>
          {editing && (
            <ProductForm
              product={p}
              onClose={() => setEditing(false)}
              onSaved={() => {
                setEditing(false);
                void state.reload();
              }}
            />
          )}
          {variant && (
            <VariantForm
              productId={p.id}
              variant={variant === 'new' ? null : variant}
              onClose={() => setVariant(null)}
              onSaved={() => {
                setVariant(null);
                void state.reload();
              }}
            />
          )}
        </>
      )}
    </Loaded>
  );
}
