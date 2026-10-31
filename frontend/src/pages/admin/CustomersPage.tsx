import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { Button, Modal, PageHeader, StatusBadge } from '../../components/common/ui';
import { FormGrid, rules, SelectField, TextAreaField, TextField, useSubmit, useZodForm } from '../../components/forms/fields';
import { FilterDate, FilterSelect, ListCard } from '../../components/tables/DataTable';
import { useAuth } from '../../context/AuthContext';
import { useFeedback } from '../../context/FeedbackContext';
import { useList } from '../../hooks/useList';
import { post, put } from '../../services/api';
import type { Row } from '../../types';
import { date } from '../../utils/format';

const STATUSES: [string, string][] = [['active', 'Active'], ['inactive', 'Inactive']];
const schema = z.object({
  customerName: rules.required,
  companyName: z.string().optional(),
  email: rules.email,
  phone: rules.phone,
  billingAddress: z.string().optional(),
  taxId: z.string().optional(),
  status: rules.required,
});

export function CustomerForm({ customer, onClose, onSaved }: { customer: Row | null; onClose: () => void; onSaved: () => void }) {
  const feedback = useFeedback();
  const form = useZodForm(schema, {
    customerName: customer?.customerName ?? '',
    companyName: customer?.companyName ?? '',
    email: customer?.email ?? '',
    phone: customer?.phone ?? '',
    billingAddress: customer?.billingAddress ?? '',
    taxId: customer?.taxId ?? '',
    status: customer?.status ?? 'active',
  });
  const submit = useSubmit(form);
  return (
    <Modal
      title={customer ? 'Edit customer' : 'Add customer'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="customer-form" loading={form.formState.isSubmitting}>Save</Button>
        </>
      }
    >
      <form
        id="customer-form"
        noValidate
        className="space-y-4"
        onSubmit={submit(async (values) => {
          if (customer) await put(`/customers/${customer.id}`, values);
          else await post('/customers', values);
          feedback.success(customer ? 'Customer updated' : 'Customer added. They will receive an email to set their password.');
          onSaved();
        })}
      >
        <FormGrid>
          <TextField form={form} name="customerName" label="Customer name" required />
          <TextField form={form} name="companyName" label="Company name" />
          <TextField form={form} name="email" label="Email" type="email" required />
          <TextField form={form} name="phone" label="Phone number" type="tel" required />
          <TextField form={form} name="taxId" label="Tax identification" />
          <SelectField form={form} name="status" label="Account status" options={STATUSES} required />
        </FormGrid>
        <TextAreaField form={form} name="billingAddress" label="Billing address" />
      </form>
    </Modal>
  );
}

export default function CustomersPage() {
  const list = useList('/customers');
  const { can } = useAuth();
  const [adding, setAdding] = useState(false);
  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="Accounts, companies and billing details."
        crumbs={[{ label: 'Dashboard', to: '/app/dashboard' }, { label: 'Customers' }]}
        actions={can('customers.manage') && <Button icon={Plus} onClick={() => setAdding(true)}>Add customer</Button>}
      />
      <ListCard
        list={list}
        placeholder="Search name, company, email or phone"
        rowLink={(r) => `/app/customers/${r.id}`}
        filters={
          <>
            <FilterSelect label="Status" value={list.param('status')} onChange={(v) => list.setParam('status', v)} options={STATUSES} />
            <FilterDate label="Registered from" value={list.param('from')} onChange={(v) => list.setParam('from', v)} />
            <FilterDate label="to" value={list.param('to')} onChange={(v) => list.setParam('to', v)} />
          </>
        }
        columns={[
          { key: 'customerName', header: 'Customer', sort: 'customerName', render: (r) => <Link to={`/app/customers/${r.id}`} className="font-semibold text-brand-ink hover:underline">{r.customerName}</Link> },
          { key: 'companyName', header: 'Company', sort: 'companyName', render: (r) => r.companyName ?? '-' },
          { key: 'email', header: 'Email', sort: 'email' },
          { key: 'phone', header: 'Phone', optional: true },
          { key: 'createdAt', header: 'Registered', sort: 'createdAt', optional: true, render: (r) => date(r.createdAt) },
          { key: 'status', header: 'Status', sort: 'status', render: (r) => <StatusBadge status={r.status} /> },
        ]}
      />
      {adding && (
        <CustomerForm
          customer={null}
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
