import { Ban, CheckCircle2, CreditCard, Download, Pencil, Printer, Send } from 'lucide-react';
import { useRef, useState } from 'react';
import { useFieldArray } from 'react-hook-form';
import { Link, useParams } from 'react-router-dom';
import { z } from 'zod';
import { InvoiceStatus, LinesTable, paymentColumns, Totals } from '../../components/common/shared';
import { ActionButton, Button, Card, DefinitionList, Loaded, Modal, PageHeader } from '../../components/common/ui';
import { inputClass, rules, SelectField, TextAreaField, TextField, useSubmit, useZodForm } from '../../components/forms/fields';
import { Table } from '../../components/tables/DataTable';
import { useAuth } from '../../context/AuthContext';
import { useFeedback } from '../../context/FeedbackContext';
import { useAction } from '../../hooks/useAction';
import { useFetch } from '../../hooks/useFetch';
import { download, get, post, put } from '../../services/api';
import type { Row } from '../../types';
import { date, dateTime, METHOD_LABEL, money, titleCase, today } from '../../utils/format';

const editSchema = z.object({
  dueDate: rules.date,
  notes: z.string().optional(),
  lines: z.array(z.object({ id: z.string(), description: rules.required, quantity: rules.count, unitPrice: rules.money })).min(1),
});

function EditInvoice({ invoice, onClose, onSaved }: { invoice: Row; onClose: () => void; onSaved: () => void }) {
  const feedback = useFeedback();
  const form = useZodForm(editSchema, {
    dueDate: invoice.dueDate,
    notes: invoice.notes ?? '',
    lines: invoice.items.map((i: Row) => ({ id: i.id, description: i.description, quantity: i.quantity, unitPrice: i.unitPrice })),
  });
  const { fields } = useFieldArray({ control: form.control, name: 'lines' });
  const submit = useSubmit(form);
  return (
    <Modal
      title={`Edit ${invoice.invoiceNumber}`}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="invoice-form" loading={form.formState.isSubmitting}>Save</Button>
        </>
      }
    >
      <form
        id="invoice-form"
        noValidate
        className="space-y-4"
        onSubmit={submit(async (values) => {
          await put(`/invoices/${invoice.id}`, values);
          feedback.success('Invoice updated');
          onSaved();
        })}
      >
        <div className="max-w-xs">
          <TextField form={form} name="dueDate" label="Due date" type="date" required />
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold text-ink-2">Lines</p>
          <div className="space-y-2">
            {fields.map((field, i) => (
              <div key={field.id} className="grid grid-cols-12 gap-2">
                <input aria-label="Description" className={`${inputClass} col-span-12 sm:col-span-7`} {...form.register(`lines.${i}.description`)} />
                <input aria-label="Quantity" type="number" min="1" className={`${inputClass} col-span-4 sm:col-span-2`} {...form.register(`lines.${i}.quantity`)} />
                <input aria-label="Unit price" type="number" min="0" step="0.01" className={`${inputClass} col-span-8 sm:col-span-3`} {...form.register(`lines.${i}.unitPrice`)} />
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-3">Tax is recalculated at the rates captured when this invoice was generated.</p>
        </div>
        <TextAreaField form={form} name="notes" label="Notes" />
      </form>
    </Modal>
  );
}

const paymentSchema = (outstanding: number, invoiceDate: string) =>
  z.object({
    amount: z.string().refine((v) => Number(v) > 0, 'Enter an amount greater than zero').refine((v) => Number(v) <= outstanding, `Cannot exceed the outstanding ${money(outstanding)}`),
    method: rules.required,
    paymentDate: rules.date.refine((v) => v <= today(), 'Payment date cannot be in the future').refine((v) => v >= invoiceDate, 'Payment date cannot be before the invoice date'),
    notes: z.string().optional(),
  });

export function RecordPayment({ invoice, onClose, onSaved }: { invoice: Row; onClose: () => void; onSaved: () => void }) {
  const feedback = useFeedback();
  // One key per opened form: a double submit or a retry after a lost response cannot record the payment twice.
  const key = useRef(crypto.randomUUID());
  const form = useZodForm(paymentSchema(Number(invoice.outstanding), invoice.invoiceDate), { amount: invoice.outstanding, method: 'bank_transfer', paymentDate: today(), notes: '' });
  const submit = useSubmit(form);
  return (
    <Modal
      title={`Record payment for ${invoice.invoiceNumber}`}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="payment-form" loading={form.formState.isSubmitting}>Record payment</Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-ink-2">Outstanding balance: <span className="tnum font-bold text-ink">{money(invoice.outstanding)}</span></p>
      <form
        id="payment-form"
        noValidate
        className="space-y-4"
        onSubmit={submit(async (values) => {
          const result = await post('/payments', { ...values, invoiceId: invoice.id, idempotencyKey: key.current });
          feedback.success(result.invoiceStatus === 'paid' ? 'Payment recorded. The invoice is now paid.' : `Payment recorded. ${money(result.outstanding)} remains outstanding.`);
          onSaved();
        })}
      >
        <TextField form={form} name="amount" label="Amount (INR)" type="number" min="0" step="0.01" required />
        <SelectField form={form} name="method" label="Payment method" options={Object.entries(METHOD_LABEL)} required />
        <TextField form={form} name="paymentDate" label="Payment date" type="date" required />
        <TextAreaField form={form} name="notes" label="Notes" rows={2} />
      </form>
    </Modal>
  );
}

export default function InvoiceDetailPage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const feedback = useFeedback();
  const act = useAction();
  const state = useFetch<Row>(() => get(`/invoices/${id}`), [id]);
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState(false);
  const manage = can('invoices.manage');

  return (
    <Loaded state={state}>
      {(inv) => (
        <>
          <PageHeader
            title={inv.invoiceNumber}
            subtitle={<InvoiceStatus invoice={inv} />}
            crumbs={[{ label: 'Dashboard', to: '/app/dashboard' }, { label: 'Invoices', to: '/app/invoices' }, { label: inv.invoiceNumber }]}
            actions={
              <>
                <Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print</Button>
                <ActionButton variant="secondary" icon={Download} onAction={() => act(() => download(`/invoices/${inv.id}/pdf`, `${inv.invoiceNumber}.pdf`))}>PDF</ActionButton>
                {manage && inv.status === 'draft' && <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>Edit</Button>}
                {manage && ['draft', 'confirmed'].includes(inv.status) && Number(inv.amountPaid) === 0 && (
                  <Button
                    variant="secondary"
                    icon={Ban}
                    onClick={async () => {
                      const ok = await feedback.confirm({ title: 'Cancel invoice', message: `Cancel ${inv.invoiceNumber}? Any discount use it took is released. This cannot be undone.`, danger: true, confirmLabel: 'Cancel invoice' });
                      if (ok && (await act(() => post(`/invoices/${inv.id}/cancel`), 'Invoice cancelled'))) void state.reload();
                    }}
                  >
                    Cancel invoice
                  </Button>
                )}
                {manage && inv.status === 'draft' && (
                  <Button
                    icon={CheckCircle2}
                    onClick={async () => {
                      const ok = await feedback.confirm({ title: 'Confirm invoice', message: `Confirm ${inv.invoiceNumber} for ${money(inv.total)}? It becomes visible to the customer and can no longer be edited.`, confirmLabel: 'Confirm' });
                      if (ok && (await act(() => post(`/invoices/${inv.id}/confirm`), 'Invoice confirmed'))) void state.reload();
                    }}
                  >
                    Confirm
                  </Button>
                )}
                {manage && ['confirmed', 'paid'].includes(inv.status) && (
                  <ActionButton variant="secondary" icon={Send} onAction={async () => {
                    if (await act(() => post(`/invoices/${inv.id}/send`), 'Invoice sent to the customer')) void state.reload();
                  }}>
                    {inv.sentAt ? 'Send again' : 'Send'}
                  </ActionButton>
                )}
                {can('payments.record') && inv.status === 'confirmed' && <Button icon={CreditCard} onClick={() => setPaying(true)}>Record payment</Button>}
              </>
            }
          />
          <Card title="Details" className="mb-5">
            <DefinitionList
              items={[
                ['Customer', can('customers.view') ? <Link to={`/app/customers/${inv.customerId}`} className="text-brand-ink hover:underline">{inv.customerName}</Link> : inv.customerName],
                ['Company', inv.companyName],
                ['Subscription', can('subscriptions.view') ? <Link to={`/app/subscriptions/${inv.subscriptionId}`} className="text-brand-ink hover:underline">{inv.subscriptionNumber}</Link> : inv.subscriptionNumber],
                ['Billing period', `${date(inv.periodStart)} to ${date(inv.periodEnd)}`],
                ['Invoice date', date(inv.invoiceDate)],
                ['Due date', date(inv.dueDate)],
                ['Payment status', titleCase(inv.paymentStatus)],
                ['Sent', dateTime(inv.sentAt)],
                ...(inv.notes ? ([['Notes', inv.notes]] as [string, string][]) : []),
              ]}
            />
          </Card>
          <Card title="Items" flush className="mb-5">
            <LinesTable items={inv.items} />
            <div className="border-t border-line">
              <Totals doc={inv} extra={[['Amount paid', money(inv.amountPaid)], ['Outstanding', money(inv.status === 'cancelled' ? 0 : inv.outstanding), true]]} />
            </div>
          </Card>
          {can('payments.view') && (
            <Card title="Payments" flush className="no-print">
              <Table rows={inv.payments} columns={paymentColumns('/app/invoices', { showCustomer: false }).filter((c) => c.key !== 'invoiceNumber')} empty={<p className="p-6 text-center text-sm text-ink-3">No payments recorded</p>} />
            </Card>
          )}
          {editing && (
            <EditInvoice
              invoice={inv}
              onClose={() => setEditing(false)}
              onSaved={() => {
                setEditing(false);
                void state.reload();
              }}
            />
          )}
          {paying && (
            <RecordPayment
              invoice={inv}
              onClose={() => setPaying(false)}
              onSaved={() => {
                setPaying(false);
                void state.reload();
              }}
            />
          )}
        </>
      )}
    </Loaded>
  );
}
