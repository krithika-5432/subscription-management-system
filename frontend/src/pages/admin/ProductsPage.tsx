import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { Badge, Button, Modal, PageHeader, StatusBadge } from '../../components/common/ui';
import { CheckField, FormGrid, rules, SelectField, TextAreaField, TextField, useSubmit, useZodForm } from '../../components/forms/fields';
import { FilterSelect, ListCard } from '../../components/tables/DataTable';
import { useAuth } from '../../context/AuthContext';
import { useFeedback } from '../../context/FeedbackContext';
import { useList } from '../../hooks/useList';
import { post, put } from '../../services/api';
import type { Row } from '../../types';
import { money, titleCase } from '../../utils/format';

export const PRODUCT_TYPES: [string, string][] = ['software', 'service', 'support', 'hardware', 'other'].map((t) => [t, titleCase(t)]);
const STATUSES: [string, string][] = [['active', 'Active'], ['inactive', 'Inactive']];
const schema = z.object({ name: rules.required, productType: rules.required, salesPrice: rules.money, costPrice: rules.money, description: z.string().optional(), isAddon: z.boolean(), status: rules.required });

export function ProductForm({ product, onClose, onSaved }: { product: Row | null; onClose: () => void; onSaved: (id: string) => void }) {
  const feedback = useFeedback();
  const form = useZodForm(schema, {
    name: product?.name ?? '',
    productType: product?.productType ?? 'software',
    salesPrice: product?.salesPrice ?? '',
    costPrice: product?.costPrice ?? '0',
    description: product?.description ?? '',
    isAddon: product?.isAddon ?? false,
    status: product?.status ?? 'active',
  });
  const submit = useSubmit(form);
  return (
    <Modal
      title={product ? 'Edit product' : 'Add product'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="product-form" loading={form.formState.isSubmitting}>Save</Button>
        </>
      }
    >
      <form
        id="product-form"
        noValidate
        className="space-y-4"
        onSubmit={submit(async (values) => {
          const saved = product ? await put(`/products/${product.id}`, values) : await post('/products', values);
          feedback.success(product ? 'Product updated' : 'Product added');
          onSaved(saved.id);
        })}
      >
        <FormGrid>
          <TextField form={form} name="name" label="Product name" required />
          <SelectField form={form} name="productType" label="Product type" options={PRODUCT_TYPES} required />
          <TextField form={form} name="salesPrice" label="Sales price (INR)" type="number" min="0" step="0.01" required />
          <TextField form={form} name="costPrice" label="Cost price (INR)" type="number" min="0" step="0.01" required />
          <SelectField form={form} name="status" label="Status" options={STATUSES} required />
        </FormGrid>
        <TextAreaField form={form} name="description" label="Description or notes" />
        <CheckField form={form} name="isAddon" label="Offer as an add-on" hint="Customers can request it for an existing subscription." />
      </form>
    </Modal>
  );
}

export default function ProductsPage() {
  const list = useList('/products');
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [adding, setAdding] = useState(false);
  return (
    <>
      <PageHeader
        title="Products"
        subtitle="Products, variants and prices."
        crumbs={[{ label: 'Dashboard', to: '/app/dashboard' }, { label: 'Products' }]}
        actions={isAdmin && <Button icon={Plus} onClick={() => setAdding(true)}>Add product</Button>}
      />
      <ListCard
        list={list}
        placeholder="Search products"
        rowLink={(r) => `/app/products/${r.id}`}
        filters={
          <>
            <FilterSelect label="Type" value={list.param('productType')} onChange={(v) => list.setParam('productType', v)} options={PRODUCT_TYPES} />
            <FilterSelect label="Status" value={list.param('status')} onChange={(v) => list.setParam('status', v)} options={STATUSES} />
          </>
        }
        columns={[
          { key: 'name', header: 'Product', sort: 'name', render: (r) => <span className="inline-flex flex-wrap items-center gap-2"><Link to={`/app/products/${r.id}`} className="font-semibold text-brand-ink hover:underline">{r.name}</Link>{r.isAddon && <Badge tone="brand">Add-on</Badge>}</span> },
          { key: 'productType', header: 'Type', render: (r) => titleCase(r.productType) },
          { key: 'variants', header: 'Variants', optional: true, render: (r) => r.variants.length },
          { key: 'salesPrice', header: 'Sales price', sort: 'salesPrice', align: 'right', render: (r) => money(r.salesPrice) },
          ...(isAdmin ? [{ key: 'costPrice', header: 'Cost price', align: 'right' as const, optional: true, render: (r: Row) => money(r.costPrice) }] : []),
          { key: 'status', header: 'Status', sort: 'status', render: (r) => <StatusBadge status={r.status} /> },
        ]}
      />
      {adding && (
        <ProductForm
          product={null}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            void list.reload();
          }}
        />
      )}
    </>
  );
}
