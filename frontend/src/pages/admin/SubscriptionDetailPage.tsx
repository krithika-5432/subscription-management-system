import { CheckCircle2, FilePlus2, Pause, Pencil, Play, RefreshCw, Send, XCircle, type LucideIcon } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { invoiceColumns, LinesTable, Totals } from '../../components/common/shared';
import { Button, buttonClass, Card, DefinitionList, Loaded, PageHeader, StatusBadge } from '../../components/common/ui';
import { ListCard, Table } from '../../components/tables/DataTable';
import { useAuth } from '../../context/AuthContext';
import { useFeedback } from '../../context/FeedbackContext';
import { useAction } from '../../hooks/useAction';
import { useFetch } from '../../hooks/useFetch';
import { useList } from '../../hooks/useList';
import { get, post } from '../../services/api';
import type { Row } from '../../types';
import { date, dateTime, titleCase, today } from '../../utils/format';

const LIFECYCLE = ['draft', 'quotation', 'confirmed', 'active', 'closed'];

function Lifecycle({ status }: { status: string }) {
  const current = LIFECYCLE.indexOf(status === 'paused' ? 'active' : status);
  return (
    <ol className="flex flex-wrap items-center gap-y-2 text-xs font-semibold" aria-label="Subscription lifecycle">
      {LIFECYCLE.map((step, i) => (
        <li key={step} className="flex items-center" aria-current={i === current ? 'step' : undefined}>
          {i > 0 && <span className={`mx-2 h-px w-6 ${i <= current ? 'bg-brand' : 'bg-line-strong'}`} />}
          <span className={`rounded px-2 py-1 ${i === current ? 'bg-brand text-white' : i < current ? 'bg-brand-soft text-brand-ink' : 'bg-surface-2 text-ink-3'}`}>
            {titleCase(step)}
            {step === 'active' && status === 'paused' && ' (paused)'}
          </span>
        </li>
      ))}
    </ol>
  );
}

function InvoicesForSubscription({ id }: { id: string }) {
  const list = useList('/invoices', { fixed: { subscriptionId: id }, pageSize: 10 });
  return <ListCard list={list} hideSearch columns={invoiceColumns('/app/invoices', { showCustomer: false })} />;
}

interface TransitionAction {
  action: string;
  status: string;
  label: string;
  icon: LucideIcon;
  variant?: 'primary' | 'secondary';
  title: string;
  message: string;
  danger?: boolean;
  reason?: string;
}

export default function SubscriptionDetailPage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const feedback = useFeedback();
  const act = useAction();
  const state = useFetch<Row>(() => get(`/subscriptions/${id}`), [id]);
  const manage = can('subscriptions.manage');

  const run = async (t: TransitionAction) => {
    const answer = await feedback.confirm({ title: t.title, message: t.message, danger: t.danger, confirmLabel: t.label, reasonLabel: t.reason });
    if (answer === false) return;
    if (await act(() => post(`/subscriptions/${id}/transition`, { action: t.action, reason: typeof answer === 'string' ? answer : null }), `Subscription is now ${t.status}`)) void state.reload();
  };

  return (
    <Loaded state={state}>
      {(s) => {
        const close: TransitionAction = { action: 'close', status: 'closed', label: 'Close', icon: XCircle, variant: 'secondary', title: 'Close subscription', message: 'Closing stops all future billing and cannot be undone.', danger: true, reason: 'Reason (optional)' };
        const pause: TransitionAction = { action: 'pause', status: 'paused', label: 'Pause', icon: Pause, variant: 'secondary', title: 'Pause subscription', message: 'Billing stops while paused. Billing and expiry dates move forward by the paused time on resume.', reason: 'Reason (optional)' };
        const transitions: TransitionAction[] = ({
          draft: [{ action: 'send_quotation', status: 'at quotation stage', label: 'Move to Quotation', icon: Send, title: 'Move to Quotation', message: 'The subscription moves to the quotation stage.' }, close],
          quotation: [{ action: 'confirm', status: 'confirmed', label: 'Confirm', icon: CheckCircle2, title: 'Confirm subscription', message: 'The terms are agreed and it is ready for activation. It can no longer be edited.' }, close],
          confirmed: [{ action: 'activate', status: 'active', label: 'Activate', icon: Play, title: 'Activate subscription', message: 'Billing starts now. A draft invoice is generated if a period is already due.' }, close],
          active: [...(s.allowPause ? [pause] : []), ...(s.allowEarlyClose || s.expiryDate <= today() ? [close] : [])],
          paused: [{ action: 'resume', status: 'active', label: 'Resume', icon: Play, title: 'Resume subscription', message: 'Billing restarts, with dates moved forward by the paused time.' }, ...(s.allowEarlyClose || s.expiryDate <= today() ? [close] : [])],
        } as Record<string, TransitionAction[]>)[s.status] ?? [];

        return (
          <>
            <PageHeader
              title={s.subscriptionNumber}
              subtitle={<StatusBadge status={s.status} />}
              crumbs={[{ label: 'Dashboard', to: '/app/dashboard' }, { label: 'Subscriptions', to: '/app/subscriptions' }, { label: s.subscriptionNumber }]}
              actions={
                <>
                  {manage && ['draft', 'quotation'].includes(s.status) && <Link to={`/app/subscriptions/${s.id}/edit`} className={buttonClass('secondary')}><Pencil size={16} /> Edit</Link>}
                  {can('invoices.manage') && s.status === 'active' && (
                    <Button
                      variant="secondary"
                      icon={FilePlus2}
                      onClick={async () => {
                        let invoice: Row | null = null;
                        const ok = await act(async () => {
                          ({ invoice } = await post<{ invoice: Row | null }>(`/subscriptions/${s.id}/generate-invoice`));
                        });
                        if (ok) {
                          if (invoice) feedback.success('Draft invoice generated');
                          else feedback.error(`No invoice is due. The next billing date is ${date(s.nextBillingDate)}.`);
                          void state.reload();
                        }
                      }}
                    >
                      Generate invoice
                    </Button>
                  )}
                  {manage && s.status === 'active' && s.renewalMode !== 'none' && (
                    <Button
                      variant="secondary"
                      icon={RefreshCw}
                      onClick={async () => {
                        const ok = await feedback.confirm({ title: 'Renew subscription', message: `Extend ${s.subscriptionNumber} by one term of ${s.termCycles} ${s.billingFrequency} cycle(s)?`, confirmLabel: 'Renew' });
                        if (ok && (await act(() => post(`/subscriptions/${s.id}/renew`), 'Subscription renewed'))) void state.reload();
                      }}
                    >
                      Renew
                    </Button>
                  )}
                  {manage && transitions.map((t) => <Button key={t.action} variant={t.variant ?? 'primary'} icon={t.icon} onClick={() => void run(t)}>{t.label}</Button>)}
                </>
              }
            />
            <Card className="mb-5"><Lifecycle status={s.status} /></Card>
            <Card title="Details" className="mb-5">
              <DefinitionList
                items={[
                  ['Customer', can('customers.view') ? <Link to={`/app/customers/${s.customerId}`} className="text-brand-ink hover:underline">{s.customerName}</Link> : s.customerName],
                  ['Plan', s.planName],
                  ['Start date', date(s.startDate)],
                  ['Expiry date', date(s.expiryDate)],
                  ['Billing', titleCase(s.billingFrequency)],
                  ['Next billing date', ['active', 'confirmed'].includes(s.status) ? date(s.nextBillingDate) : '-'],
                  ['Payment terms', `${s.paymentTermsDays} days`],
                  ['Renewal', `${titleCase(s.renewalMode)}${s.autoClose ? ', closes automatically' : ''}`],
                  ...(s.closeReason ? ([['Close reason', s.closeReason]] as [string, string][]) : []),
                  ...(s.notes ? ([['Notes', s.notes]] as [string, string][]) : []),
                ]}
              />
            </Card>
            <Card title="Items" flush className="mb-5">
              <LinesTable items={s.items} />
              <div className="border-t border-line"><Totals doc={s} totalLabel="Total per billing cycle" /></div>
            </Card>
            {can('invoices.view') && (
              <div className="mb-5">
                <h2 className="mb-2 text-sm font-bold text-ink">Invoices</h2>
                {/* Activation or "Generate invoice" can add one, so remount the list when billing advances. */}
                <InvoicesForSubscription key={`${s.status}-${s.billedCycles}`} id={s.id} />
              </div>
            )}
            <div className="grid gap-5 xl:grid-cols-2">
              <Card title="Status history" flush>
                <Table
                  rows={s.history}
                  columns={[
                    { key: 'change', header: 'Change', render: (h) => (h.fromStatus && h.fromStatus !== h.toStatus ? `${titleCase(h.fromStatus)} to ${titleCase(h.toStatus)}` : titleCase(h.toStatus)) },
                    { key: 'note', header: 'Note', render: (h) => h.note ?? '-' },
                    { key: 'by', header: 'By', render: (h) => h.changedByName ?? 'System' },
                    { key: 'createdAt', header: 'When', render: (h) => <span className="whitespace-nowrap">{dateTime(h.createdAt)}</span> },
                  ]}
                />
              </Card>
              <Card title="Renewals" flush>
                <Table
                  rows={s.renewals}
                  empty={<p className="p-6 text-center text-sm text-ink-3">Not renewed yet</p>}
                  columns={[
                    { key: 'previousExpiry', header: 'From', render: (r) => date(r.previousExpiry) },
                    { key: 'newExpiry', header: 'To', render: (r) => date(r.newExpiry) },
                    { key: 'renewalType', header: 'Type', render: (r) => titleCase(r.renewalType) },
                    { key: 'by', header: 'By', render: (r) => r.renewedByName ?? 'System' },
                  ]}
                />
              </Card>
            </div>
          </>
        );
      }}
    </Loaded>
  );
}
