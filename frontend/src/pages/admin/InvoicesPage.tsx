import { PlayCircle } from 'lucide-react';
import { invoiceColumns } from '../../components/common/shared';
import { ActionButton, PageHeader } from '../../components/common/ui';
import { FilterDate, FilterSelect, ListCard } from '../../components/tables/DataTable';
import { useAuth } from '../../context/AuthContext';
import { useFeedback } from '../../context/FeedbackContext';
import { useAction } from '../../hooks/useAction';
import { useList } from '../../hooks/useList';
import { post } from '../../services/api';
import type { Row } from '../../types';

export const INVOICE_STATUSES: [string, string][] = [['draft', 'Draft'], ['confirmed', 'Confirmed'], ['paid', 'Paid'], ['cancelled', 'Cancelled'], ['overdue', 'Overdue']];
export const PAYMENT_STATES: [string, string][] = [['unpaid', 'Unpaid'], ['partial', 'Partially paid'], ['paid', 'Paid']];

export default function InvoicesPage() {
  const list = useList('/invoices');
  const { can } = useAuth();
  const feedback = useFeedback();
  const act = useAction();
  return (
    <>
      <PageHeader
        title="Invoices"
        subtitle="Generated from subscription billing schedules."
        crumbs={[{ label: 'Dashboard', to: '/app/dashboard' }, { label: 'Invoices' }]}
        actions={
          can('invoices.manage') && (
            <ActionButton
              variant="secondary"
              icon={PlayCircle}
              onAction={async () => {
                let result: Row = {};
                const ok = await act(async () => {
                  result = await post('/invoices/run-billing');
                });
                if (ok) {
                  feedback.success(result.skipped ? 'A billing run is already in progress' : `Billing run complete: ${result.generated} invoice(s) generated`);
                  if (result.failed) feedback.error(`${result.failed} invoice(s) could not be generated. See the server log.`);
                  void list.reload();
                }
              }}
            >
              Run billing now
            </ActionButton>
          )
        }
      />
      <ListCard
        list={list}
        placeholder="Search invoice, customer or subscription"
        rowLink={(r) => `/app/invoices/${r.id}`}
        columns={invoiceColumns('/app/invoices')}
        filters={
          <>
            <FilterSelect label="Status" value={list.param('status')} onChange={(v) => list.setParam('status', v)} options={INVOICE_STATUSES} />
            <FilterSelect label="Payment" value={list.param('paymentStatus')} onChange={(v) => list.setParam('paymentStatus', v)} options={PAYMENT_STATES} />
            <FilterDate label="From" value={list.param('from')} onChange={(v) => list.setParam('from', v)} />
            <FilterDate label="To" value={list.param('to')} onChange={(v) => list.setParam('to', v)} />
          </>
        }
      />
    </>
  );
}
