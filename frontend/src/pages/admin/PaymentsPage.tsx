import { Ban, Search } from 'lucide-react';
import { useState } from 'react';
import { paymentColumns } from '../../components/common/shared';
import { Button, EmptyState, Modal, PageHeader, Spinner } from '../../components/common/ui';
import { CustomerPicker, inputClass } from '../../components/forms/fields';
import { FilterDate, FilterSelect, ListCard } from '../../components/tables/DataTable';
import { useAuth } from '../../context/AuthContext';
import { useFeedback } from '../../context/FeedbackContext';
import { useAction } from '../../hooks/useAction';
import { useFetch } from '../../hooks/useFetch';
import { useList } from '../../hooks/useList';
import { get, getPage, post } from '../../services/api';
import type { Row } from '../../types';
import { date, money, METHOD_LABEL } from '../../utils/format';
import { RecordPayment } from './InvoiceDetailPage';

function InvoiceChooser({ onClose, onChosen }: { onClose: () => void; onChosen: (invoice: Row) => void }) {
  const [text, setText] = useState('');
  const results = useFetch(() => getPage('/invoices', { status: 'confirmed', search: text, pageSize: 8 }), [text]);
  return (
    <Modal title="Choose an invoice" size="md" onClose={onClose}>
      <label className="relative mb-3 block">
        <span className="sr-only">Search confirmed invoices</span>
        <Search size={15} className="absolute top-3 left-2.5 text-ink-3" aria-hidden />
        <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Search invoice or customer" className={`${inputClass} pl-8`} />
      </label>
      {results.loading && !results.data ? (
        <Spinner />
      ) : !results.data?.rows.length ? (
        <EmptyState title="No confirmed invoices found" />
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line">
          {results.data.rows.map((inv) => (
            <li key={inv.id}>
              <button onClick={() => onChosen(inv)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-surface-2">
                <span>
                  <span className="block text-sm font-semibold text-ink">{inv.invoiceNumber}</span>
                  <span className="block text-xs text-ink-3">{inv.customerName}, due {date(inv.dueDate)}</span>
                </span>
                <span className="tnum text-sm whitespace-nowrap text-ink">{money(inv.outstanding)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

export default function PaymentsPage() {
  const list = useList('/payments');
  const { can } = useAuth();
  const feedback = useFeedback();
  const act = useAction();
  const [choosing, setChoosing] = useState(false);
  const [invoice, setInvoice] = useState<Row | null>(null);

  const columns = [
    ...paymentColumns('/app/invoices'),
    ...(can('payments.record')
      ? [{
          key: 'actions',
          header: '',
          align: 'right' as const,
          render: (r: Row) =>
            r.status === 'completed' ? (
              <Button
                variant="ghost"
                small
                icon={Ban}
                aria-label={`Void ${r.paymentReference}`}
                title="Void payment"
                onClick={async () => {
                  const reason = await feedback.confirm({ title: 'Void payment', message: `Void ${r.paymentReference} for ${money(r.amount)}? The invoice balance is restored and the record stays in the history.`, danger: true, confirmLabel: 'Void payment', reasonLabel: 'Reason', reasonRequired: true });
                  if (typeof reason === 'string' && (await act(() => post(`/payments/${r.id}/void`, { reason }), 'Payment voided'))) void list.reload();
                }}
              />
            ) : null,
        }]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Payments"
        subtitle="Payments recorded against invoices."
        crumbs={[{ label: 'Dashboard', to: '/app/dashboard' }, { label: 'Payments' }]}
        actions={can('payments.record') && <Button onClick={() => setChoosing(true)}>Record payment</Button>}
      />
      <ListCard
        list={list}
        placeholder="Search reference, customer or invoice"
        columns={columns}
        filters={
          <>
            <CustomerPicker compact value={list.param('customerId')} onChange={(v) => list.setParam('customerId', v)} />
            <FilterSelect label="Method" value={list.param('method')} onChange={(v) => list.setParam('method', v)} options={Object.entries(METHOD_LABEL)} />
            <FilterSelect label="Status" value={list.param('status')} onChange={(v) => list.setParam('status', v)} options={[['completed', 'Completed'], ['voided', 'Voided']]} />
            <FilterDate label="From" value={list.param('from')} onChange={(v) => list.setParam('from', v)} />
            <FilterDate label="To" value={list.param('to')} onChange={(v) => list.setParam('to', v)} />
          </>
        }
      />
      {choosing && (
        <InvoiceChooser
          onClose={() => setChoosing(false)}
          onChosen={async (inv) => {
            setChoosing(false);
            setInvoice(await get(`/invoices/${inv.id}`));
          }}
        />
      )}
      {invoice && (
        <RecordPayment
          invoice={invoice}
          onClose={() => setInvoice(null)}
          onSaved={() => {
            setInvoice(null);
            void list.reload();
          }}
        />
      )}
    </>
  );
}
