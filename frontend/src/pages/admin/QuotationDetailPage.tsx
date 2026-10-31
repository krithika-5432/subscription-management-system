import { Download, Pencil, Repeat, Send, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LinesTable, Totals } from '../../components/common/shared';
import { ActionButton, Button, buttonClass, Card, DefinitionList, Loaded, Modal, PageHeader, StatusBadge } from '../../components/common/ui';
import { inputClass } from '../../components/forms/fields';
import { useAuth } from '../../context/AuthContext';
import { useFeedback } from '../../context/FeedbackContext';
import { useAction } from '../../hooks/useAction';
import { useFetch } from '../../hooks/useFetch';
import { del, download, get, post } from '../../services/api';
import type { Row } from '../../types';
import { date, dateTime, today } from '../../utils/format';

function ConvertDialog({ quotation, onClose }: { quotation: Row; onClose: () => void }) {
  const [startDate, setStartDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const act = useAction();
  const navigate = useNavigate();
  return (
    <Modal
      title="Convert to subscription"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={busy}
            disabled={!startDate}
            onClick={async () => {
              setBusy(true);
              let subscriptionId = '';
              const ok = await act(async () => {
                ({ subscriptionId } = await post<{ subscriptionId: string }>(`/quotations/${quotation.id}/convert`, { startDate }));
              }, 'Subscription created and waiting for activation');
              setBusy(false);
              if (ok) navigate(`/app/subscriptions/${subscriptionId}`);
            }}
          >
            Create subscription
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-ink-2">Creates a confirmed subscription with the prices, taxes and discount on {quotation.quotationNumber}.</p>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-ink-2">Start date</span>
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
      </label>
    </Modal>
  );
}

export default function QuotationDetailPage() {
  const { id = '' } = useParams();
  const auth = useAuth();
  const feedback = useFeedback();
  const act = useAction();
  const navigate = useNavigate();
  const state = useFetch<Row>(() => get(`/quotations/${id}`), [id]);
  const [converting, setConverting] = useState(false);
  const manage = auth.can('quotations.manage');

  return (
    <Loaded state={state}>
      {(q) => (
        <>
          <PageHeader
            title={q.quotationNumber}
            subtitle={<StatusBadge status={q.status} />}
            crumbs={[{ label: 'Dashboard', to: '/app/dashboard' }, { label: 'Quotations', to: '/app/quotations' }, { label: q.quotationNumber }]}
            actions={
              <>
                <ActionButton variant="secondary" icon={Download} onAction={() => act(() => download(`/quotations/${q.id}/pdf`, `${q.quotationNumber}.pdf`))}>PDF</ActionButton>
                {manage && q.status === 'draft' && (
                  <>
                    <Button
                      variant="secondary"
                      icon={Trash2}
                      onClick={async () => {
                        const ok = await feedback.confirm({ title: 'Delete draft', message: `Delete ${q.quotationNumber}? This cannot be undone.`, danger: true, confirmLabel: 'Delete' });
                        if (ok && (await act(() => del(`/quotations/${q.id}`), 'Draft deleted'))) navigate('/app/quotations');
                      }}
                    >
                      Delete
                    </Button>
                    <Link to={`/app/quotations/${q.id}/edit`} className={buttonClass('secondary')}><Pencil size={16} /> Edit</Link>
                    <Button
                      icon={Send}
                      onClick={async () => {
                        const ok = await feedback.confirm({ title: 'Send quotation', message: `Send ${q.quotationNumber} to ${q.customerName}? It can no longer be edited after this.`, confirmLabel: 'Send' });
                        if (ok && (await act(() => post(`/quotations/${q.id}/send`), 'Quotation sent'))) void state.reload();
                      }}
                    >
                      Send to customer
                    </Button>
                  </>
                )}
                {(manage || auth.can('subscriptions.manage')) && q.status === 'accepted' && !q.subscriptionId && <Button icon={Repeat} onClick={() => setConverting(true)}>Convert to subscription</Button>}
                {q.subscriptionId && auth.can('subscriptions.view') && <Link to={`/app/subscriptions/${q.subscriptionId}`} className={buttonClass()}><Repeat size={16} /> View subscription</Link>}
              </>
            }
          />
          <Card title="Details" className="mb-5">
            <DefinitionList
              items={[
                ['Customer', <Link to={`/app/customers/${q.customerId}`} className="text-brand-ink hover:underline">{q.customerName}</Link>],
                ['Company', q.companyName],
                ['Quotation date', date(q.quotationDate)],
                ['Expiry date', date(q.expiryDate)],
                ['Template', q.templateName],
                ['Prepared by', q.createdByName],
                ['Sent', dateTime(q.sentAt)],
                ['Customer response', q.respondedAt ? `${q.status === 'rejected' ? 'Rejected' : 'Accepted'} on ${dateTime(q.respondedAt)}` : '-'],
                ...(q.rejectionReason ? ([['Rejection reason', q.rejectionReason]] as [string, string][]) : []),
              ]}
            />
          </Card>
          <Card title="Items" flush className="mb-5">
            <LinesTable items={q.items} />
            <div className="border-t border-line"><Totals doc={q} totalLabel="Total per billing cycle" /></div>
          </Card>
          {q.terms && (
            <Card title="Terms and conditions">
              <p className="text-sm whitespace-pre-wrap text-ink-2">{q.terms}</p>
            </Card>
          )}
          {converting && <ConvertDialog quotation={q} onClose={() => setConverting(false)} />}
        </>
      )}
    </Loaded>
  );
}
