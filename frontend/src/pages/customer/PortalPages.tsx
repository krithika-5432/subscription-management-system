import { Check, CreditCard, Download, FileText, Printer, Repeat, Tag, Timer, Wallet, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { z } from 'zod';
import { InvoiceStatus, invoiceColumns, LinesTable, paymentColumns, quotationColumns, subscriptionColumns, Totals } from '../../components/common/shared';
import { ActionButton, Badge, Button, buttonClass, Card, DefinitionList, EmptyState, Loaded, Modal, PageHeader, StatCard, StatGrid, StatusBadge } from '../../components/common/ui';
import { inputClass, rules, TextAreaField, TextField, useSubmit, useZodForm } from '../../components/forms/fields';
import { FilterDate, FilterSelect, ListCard, Table } from '../../components/tables/DataTable';
import { useFeedback } from '../../context/FeedbackContext';
import { useAction } from '../../hooks/useAction';
import { useFetch } from '../../hooks/useFetch';
import { useList } from '../../hooks/useList';
import { download, get, getPage, post } from '../../services/api';
import type { Row } from '../../types';
import { date, dateTime, FREQUENCY_LABEL, METHOD_LABEL, money, titleCase } from '../../utils/format';

const crumbs = (label: string, parent?: [string, string]) => [{ label: 'Dashboard', to: '/portal/dashboard' }, ...(parent ? [{ label: parent[0], to: parent[1] }] : []), { label }];

// ---- dashboard

export function PortalDashboard() {
  const state = useFetch<Row>(() => get('/portal/dashboard'), []);
  return (
    <>
      <PageHeader title="Dashboard" subtitle="Your subscriptions, quotations and balance." />
      <Loaded state={state}>
        {(d) => (
          <>
            <StatGrid>
              <StatCard label="Active subscriptions" value={d.activeSubscriptions} icon={Repeat} tone="ok" to="/portal/subscriptions?status=active" />
              <StatCard label="Available plans" value={d.availablePlans} icon={Tag} to="/portal/plans" />
              <StatCard label="Pending quotations" value={d.pendingQuotations} hint="Waiting for your response" icon={FileText} to="/portal/quotations?status=sent" />
              <StatCard label="Upcoming expirations" value={d.upcomingExpirations} hint={`Within ${d.expiringDays} days`} icon={Timer} tone="warn" />
              <StatCard label="Unpaid invoices" value={d.unpaidInvoices} icon={CreditCard} to="/portal/invoices?status=confirmed" />
              <StatCard label="Total outstanding" value={money(d.outstanding)} icon={Wallet} tone="warn" to="/portal/invoices?status=confirmed" />
            </StatGrid>
            <div className="grid gap-5 xl:grid-cols-2">
              <Card title="Recent payments" flush>
                <Table rows={d.recentPayments} columns={paymentColumns('/portal/invoices', { showCustomer: false }).filter((c) => !['method', 'status'].includes(c.key))} empty={<p className="p-6 text-center text-sm text-ink-3">No payments yet</p>} />
              </Card>
              <Card title="Upcoming expirations" flush>
                <Table
                  rows={d.expiring}
                  empty={<p className="p-6 text-center text-sm text-ink-3">Nothing is expiring soon</p>}
                  columns={subscriptionColumns('/portal/subscriptions', { showCustomer: false }).filter((c) => ['subscriptionNumber', 'planName', 'expiryDate'].includes(c.key))}
                />
              </Card>
            </div>
          </>
        )}
      </Loaded>
    </>
  );
}

// ---- browse plans and request a quotation

const requestSchema = z.object({ planQuantity: rules.count, productId: z.string().optional(), variantId: z.string().optional(), productQuantity: z.string().optional(), notes: z.string().optional() });

function RequestQuotation({ plan, products, onClose }: { plan: Row; products: Row[]; onClose: () => void }) {
  const feedback = useFeedback();
  const form = useZodForm(
    requestSchema.refine((v) => Number(v.planQuantity) >= plan.minQuantity, { message: `The minimum quantity is ${plan.minQuantity}`, path: ['planQuantity'] }),
    { planQuantity: plan.minQuantity, productId: '', variantId: '', productQuantity: '1', notes: '' },
  );
  const submit = useSubmit(form);
  const productId = form.watch('productId');
  const product = products.find((p) => p.id === productId);
  return (
    <Modal
      title={`Request a quotation: ${plan.name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="request-form" loading={form.formState.isSubmitting}>Send request</Button>
        </>
      }
    >
      <form
        id="request-form"
        noValidate
        className="space-y-4"
        onSubmit={submit(async (v) => {
          await post('/portal/requests', { requestType: 'quotation', planId: plan.id, planQuantity: v.planQuantity, productId: v.productId || null, variantId: v.variantId || null, productQuantity: v.productId ? v.productQuantity || 1 : null, notes: v.notes });
          feedback.success('Request sent. Our team will prepare your quotation.');
          onClose();
        })}
      >
        <p className="text-sm text-ink-2">{money(plan.price)} {FREQUENCY_LABEL[plan.billingFrequency]}, per unit, before tax.</p>
        <TextField form={form} name="planQuantity" label="Quantity" type="number" min={plan.minQuantity} required />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-ink-2">Additional product (optional)</span>
            <select className={inputClass} {...form.register('productId', { onChange: () => form.setValue('variantId', '') })}>
              <option value="">None</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({money(p.salesPrice)})</option>)}
            </select>
          </label>
          {product && (
            <TextField form={form} name="productQuantity" label="Product quantity" type="number" min="1" />
          )}
          {product?.variants?.length > 0 && (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-ink-2">Variant</span>
              <select className={inputClass} {...form.register('variantId')}>
                <option value="">Base product</option>
                {product!.variants.filter((v: Row) => v.status === 'active').map((v: Row) => <option key={v.id} value={v.id}>{v.name} {v.isConfigurable ? '(priced on request)' : `(+${money(v.additionalPrice)})`}</option>)}
              </select>
            </label>
          )}
        </div>
        <TextAreaField form={form} name="notes" label="Anything we should know?" />
      </form>
    </Modal>
  );
}

export function PortalPlans() {
  const state = useFetch<{ plans: Row[]; products: Row[] }>(() => get('/portal/catalog'), []);
  const [requesting, setRequesting] = useState<Row | null>(null);
  return (
    <>
      <PageHeader title="Browse Plans" subtitle="Plans available today, with prices before tax." crumbs={crumbs('Browse Plans')} />
      <Loaded state={state}>
        {({ plans, products }) =>
          !plans.length ? (
            <EmptyState title="No plans are available right now" />
          ) : (
            <>
              <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {plans.map((plan) => (
                  <section key={plan.id} className="flex flex-col rounded-lg border border-line bg-surface p-5">
                    <h2 className="text-base font-bold text-ink">{plan.name}</h2>
                    <p className="mt-1 flex-1 text-sm text-ink-2">{plan.description}</p>
                    <p className="tnum mt-4 text-2xl font-bold tracking-tight text-ink">{money(plan.price)}</p>
                    <p className="text-xs text-ink-3">{FREQUENCY_LABEL[plan.billingFrequency]}{plan.minQuantity > 1 ? `, minimum ${plan.minQuantity}` : ''}</p>
                    <Button variant="secondary" className="mt-4" onClick={() => setRequesting(plan)}>Request a quotation</Button>
                  </section>
                ))}
              </div>
              <Card title="Products and variants" flush>
                <Table
                  rows={products}
                  empty={<p className="p-6 text-center text-sm text-ink-3">No products available</p>}
                  columns={[
                    { key: 'name', header: 'Product', render: (p) => <><span className="font-semibold">{p.name}</span>{p.description && <span className="block text-xs text-ink-3">{p.description}</span>}</> },
                    { key: 'salesPrice', header: 'Price', align: 'right', render: (p) => money(p.salesPrice) },
                    { key: 'variants', header: 'Variants', render: (p) => p.variants.length ? p.variants.filter((v: Row) => v.status === 'active').map((v: Row) => `${v.name}${v.isConfigurable ? ' (on request)' : ` (+${money(v.additionalPrice)})`}`).join(', ') : '-' },
                  ]}
                />
              </Card>
              {requesting && <RequestQuotation plan={requesting} products={products} onClose={() => setRequesting(null)} />}
            </>
          )
        }
      </Loaded>
    </>
  );
}

// ---- quotations

export function PortalQuotations() {
  const list = useList('/portal/quotations');
  const requests = useFetch(() => getPage('/portal/requests', { pageSize: 5 }), []);
  return (
    <>
      <PageHeader title="My Quotations" subtitle="Review, accept or reject quotations from our team." crumbs={crumbs('My Quotations')} actions={<Link to="/portal/plans" className={buttonClass('secondary')}>Request a quotation</Link>} />
      <ListCard
        list={list}
        placeholder="Search quotations"
        rowLink={(r) => `/portal/quotations/${r.id}`}
        columns={quotationColumns('/portal/quotations', { showCustomer: false })}
        empty={<EmptyState title="No quotations yet" message="Choose a plan to request your first quotation." action={<Link to="/portal/plans" className={buttonClass()}>Browse plans</Link>} />}
        filters={<FilterSelect label="Status" value={list.param('status')} onChange={(v) => list.setParam('status', v)} options={[['sent', 'Awaiting response'], ['accepted', 'Accepted'], ['rejected', 'Rejected'], ['expired', 'Expired']]} />}
      />
      {!!requests.data?.rows.length && (
        <Card title="My recent requests" flush className="mt-5">
          <Table
            rows={requests.data.rows}
            columns={[
              { key: 'requested', header: 'Requested', render: (r) => (r.requestType === 'addon' ? `Add-on: ${r.productName}` : `${r.planName} x ${r.planQuantity}`) },
              { key: 'createdAt', header: 'Sent', render: (r) => date(r.createdAt) },
              { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              { key: 'responseNote', header: 'Note', optional: true, render: (r) => r.responseNote ?? '-' },
            ]}
          />
        </Card>
      )}
    </>
  );
}

export function PortalQuotationDetail() {
  const { id = '' } = useParams();
  const state = useFetch<Row>(() => get(`/portal/quotations/${id}`), [id]);
  const feedback = useFeedback();
  const act = useAction();
  return (
    <Loaded state={state}>
      {(q) => (
        <>
          <PageHeader
            title={q.quotationNumber}
            subtitle={<StatusBadge status={q.status} />}
            crumbs={crumbs(q.quotationNumber, ['My Quotations', '/portal/quotations'])}
            actions={
              <>
                <ActionButton variant="secondary" icon={Download} onAction={() => act(() => download(`/portal/quotations/${q.id}/pdf`, `${q.quotationNumber}.pdf`))}>Download PDF</ActionButton>
                {q.status === 'sent' && (
                  <>
                    <Button
                      variant="secondary"
                      icon={X}
                      onClick={async () => {
                        const reason = await feedback.confirm({ title: 'Reject quotation', message: `Reject ${q.quotationNumber}? This cannot be undone.`, danger: true, confirmLabel: 'Reject', reasonLabel: 'Reason (optional)' });
                        if (reason !== false && (await act(() => post(`/portal/quotations/${q.id}/reject`, { reason: typeof reason === 'string' ? reason : null }), 'Quotation rejected'))) void state.reload();
                      }}
                    >
                      Reject
                    </Button>
                    <Button
                      icon={Check}
                      onClick={async () => {
                        const ok = await feedback.confirm({ title: 'Accept quotation', message: `Accept ${q.quotationNumber} at ${money(q.total)} per billing cycle, under the terms shown?`, confirmLabel: 'Accept' });
                        if (!ok) return;
                        let status = '';
                        const done = await act(async () => {
                          ({ status } = await post<{ status: string }>(`/portal/quotations/${q.id}/accept`));
                        });
                        if (done) {
                          if (status === 'expired') feedback.error('This quotation has expired. Please request a new one.');
                          else feedback.success('Quotation accepted. Our team will set up your subscription.');
                          void state.reload();
                        }
                      }}
                    >
                      Accept
                    </Button>
                  </>
                )}
              </>
            }
          />
          <Card title="Details" className="mb-5">
            <DefinitionList items={[['Quotation date', date(q.quotationDate)], ['Valid until', date(q.expiryDate)], ['Your response', q.respondedAt ? dateTime(q.respondedAt) : '-'], ...(q.subscriptionId ? ([['Subscription', <Link to={`/portal/subscriptions/${q.subscriptionId}`} className="text-brand-ink hover:underline">View subscription</Link>]] as [string, React.ReactNode][]) : [])]} />
          </Card>
          <Card title="Items" flush className="mb-5">
            <LinesTable items={q.items} />
            <div className="border-t border-line"><Totals doc={q} totalLabel="Total per billing cycle" /></div>
          </Card>
          {q.terms && <Card title="Terms and conditions"><p className="text-sm whitespace-pre-wrap text-ink-2">{q.terms}</p></Card>}
        </>
      )}
    </Loaded>
  );
}

// ---- subscriptions

export function PortalSubscriptions() {
  const list = useList('/portal/subscriptions');
  return (
    <>
      <PageHeader title="My Subscriptions" subtitle="Current and previous subscriptions." crumbs={crumbs('My Subscriptions')} />
      <ListCard
        list={list}
        placeholder="Search subscriptions"
        rowLink={(r) => `/portal/subscriptions/${r.id}`}
        columns={subscriptionColumns('/portal/subscriptions', { showCustomer: false })}
        empty={<EmptyState title="No subscriptions yet" message="Your subscriptions appear here once a quotation is accepted and set up." />}
        filters={<FilterSelect label="Status" value={list.param('status')} onChange={(v) => list.setParam('status', v)} options={[['confirmed', 'Awaiting activation'], ['active', 'Active'], ['paused', 'Paused'], ['closed', 'Previous']]} />}
      />
    </>
  );
}

const RENEWAL_TEXT: Record<string, string> = { auto: 'Renews automatically at expiry', manual: 'Renewed by our team before expiry', none: 'Ends at expiry' };

export function PortalSubscriptionDetail() {
  const { id = '' } = useParams();
  const state = useFetch<Row>(() => get(`/portal/subscriptions/${id}`), [id]);
  return (
    <Loaded state={state}>
      {(s) => (
        <>
          <PageHeader title={s.subscriptionNumber} subtitle={<StatusBadge status={s.status} />} crumbs={crumbs(s.subscriptionNumber, ['My Subscriptions', '/portal/subscriptions'])} actions={['active', 'paused', 'confirmed'].includes(s.status) && <Link to={`/portal/addons?subscriptionId=${s.id}`} className={buttonClass('secondary')}>Request an add-on</Link>} />
          <Card title="Details" className="mb-5">
            <DefinitionList
              items={[
                ['Plan', s.planName],
                ['Billing', titleCase(s.billingFrequency)],
                ['Start date', date(s.startDate)],
                ['Expiry date', date(s.expiryDate)],
                ['Next billing date', s.status === 'active' ? date(s.nextBillingDate) : '-'],
                ['Renewal', RENEWAL_TEXT[s.renewalMode]],
              ]}
            />
          </Card>
          <Card title="Items" flush className="mb-5">
            <LinesTable items={s.items} />
            <div className="border-t border-line"><Totals doc={s} totalLabel="Total per billing cycle" /></div>
          </Card>
          <Card title="Renewal history" flush>
            <Table
              rows={s.renewals}
              empty={<p className="p-6 text-center text-sm text-ink-3">Not renewed yet</p>}
              columns={[
                { key: 'previousExpiry', header: 'Previous expiry', render: (r) => date(r.previousExpiry) },
                { key: 'newExpiry', header: 'New expiry', render: (r) => date(r.newExpiry) },
                { key: 'createdAt', header: 'Renewed', render: (r) => date(r.createdAt) },
              ]}
            />
          </Card>
        </>
      )}
    </Loaded>
  );
}

// ---- add-ons

function RequestAddon({ product, subscriptions, onClose }: { product: Row; subscriptions: Row[]; onClose: () => void }) {
  const feedback = useFeedback();
  const form = useZodForm(z.object({ subscriptionId: z.string().min(1, 'Choose a subscription'), variantId: z.string().optional(), productQuantity: rules.count, notes: z.string().optional() }), {
    subscriptionId: new URLSearchParams(window.location.search).get('subscriptionId') ?? (subscriptions.length === 1 ? subscriptions[0].id : ''),
    variantId: '',
    productQuantity: 1,
    notes: '',
  });
  const submit = useSubmit(form);
  const subscriptionError = form.formState.errors.subscriptionId?.message as string | undefined;
  return (
    <Modal
      title={`Request ${product.name}`}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="addon-form" loading={form.formState.isSubmitting}>Send request</Button>
        </>
      }
    >
      <form
        id="addon-form"
        noValidate
        className="space-y-4"
        onSubmit={submit(async (v) => {
          await post('/portal/requests', { requestType: 'addon', subscriptionId: v.subscriptionId, productId: product.id, variantId: v.variantId || null, productQuantity: v.productQuantity, notes: v.notes });
          feedback.success('Request sent. Your subscription changes only once it is approved.');
          onClose();
        })}
      >
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-ink-2">Subscription</span>
          <select aria-invalid={!!subscriptionError} className={inputClass} {...form.register('subscriptionId')}>
            <option value="">Choose a subscription</option>
            {subscriptions.map((s) => <option key={s.id} value={s.id}>{s.subscriptionNumber} ({s.planName})</option>)}
          </select>
          {subscriptionError && <p role="alert" className="mt-1 text-xs text-bad">{subscriptionError}</p>}
        </label>
        {product.variants.length > 0 && (
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-ink-2">Variant</span>
            <select className={inputClass} {...form.register('variantId')}>
              <option value="">Base product</option>
              {product.variants.filter((v: Row) => v.status === 'active').map((v: Row) => <option key={v.id} value={v.id}>{v.name} (+{money(v.additionalPrice)})</option>)}
            </select>
          </label>
        )}
        <TextField form={form} name="productQuantity" label="Quantity" type="number" min="1" required />
        <TextAreaField form={form} name="notes" label="Notes" rows={2} />
        <p className="text-xs text-ink-3">Approved add-ons are billed from your next invoice.</p>
      </form>
    </Modal>
  );
}

export function PortalAddons() {
  const addons = useFetch<Row[]>(() => get('/portal/addons'), []);
  const subs = useFetch(() => getPage('/portal/subscriptions', { pageSize: 100 }), []);
  const [requesting, setRequesting] = useState<Row | null>(null);
  const live = (subs.data?.rows ?? []).filter((s) => ['active', 'paused', 'confirmed'].includes(s.status));
  return (
    <>
      <PageHeader title="Add-ons" subtitle="Extra products for your subscriptions. Each request is reviewed by our team." crumbs={crumbs('Add-ons')} />
      <Loaded state={addons}>
        {(items) =>
          !items.length ? (
            <EmptyState title="No add-ons are available right now" />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((p) => (
                <section key={p.id} className="flex flex-col rounded-lg border border-line bg-surface p-5">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <h2 className="text-base font-bold text-ink">{p.name}</h2>
                    <Badge tone="brand">{titleCase(p.productType)}</Badge>
                  </div>
                  <p className="flex-1 text-sm text-ink-2">{p.description}</p>
                  <p className="tnum mt-3 text-xl font-bold text-ink">+{money(p.salesPrice)}</p>
                  <Button variant="secondary" className="mt-4" disabled={!live.length} title={live.length ? undefined : 'You need a live subscription first'} onClick={() => setRequesting(p)}>Request add-on</Button>
                </section>
              ))}
            </div>
          )
        }
      </Loaded>
      {subs.data && !live.length && <p className="mt-4 text-sm text-ink-2">You need a live subscription before you can request add-ons.</p>}
      {requesting && <RequestAddon product={requesting} subscriptions={live} onClose={() => setRequesting(null)} />}
    </>
  );
}

// ---- invoices and payments

export function PortalInvoices() {
  const list = useList('/portal/invoices');
  return (
    <>
      <PageHeader title="My Invoices" subtitle="Invoices, due dates and balances." crumbs={crumbs('My Invoices')} />
      <ListCard
        list={list}
        placeholder="Search invoices"
        rowLink={(r) => `/portal/invoices/${r.id}`}
        columns={invoiceColumns('/portal/invoices', { showCustomer: false })}
        empty={<EmptyState title="No invoices yet" />}
        filters={
          <>
            <FilterSelect label="Status" value={list.param('status')} onChange={(v) => list.setParam('status', v)} options={[['confirmed', 'Unpaid'], ['overdue', 'Overdue'], ['paid', 'Paid'], ['cancelled', 'Cancelled']]} />
            <FilterDate label="From" value={list.param('from')} onChange={(v) => list.setParam('from', v)} />
            <FilterDate label="To" value={list.param('to')} onChange={(v) => list.setParam('to', v)} />
          </>
        }
      />
    </>
  );
}

export function PortalInvoiceDetail() {
  const { id = '' } = useParams();
  const state = useFetch<Row>(() => get(`/portal/invoices/${id}`), [id]);
  const act = useAction();
  return (
    <Loaded state={state}>
      {(inv) => (
        <>
          <PageHeader
            title={inv.invoiceNumber}
            subtitle={<InvoiceStatus invoice={inv} />}
            crumbs={crumbs(inv.invoiceNumber, ['My Invoices', '/portal/invoices'])}
            actions={
              <>
                <Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print</Button>
                <ActionButton icon={Download} onAction={() => act(() => download(`/portal/invoices/${inv.id}/pdf`, `${inv.invoiceNumber}.pdf`))}>Download PDF</ActionButton>
              </>
            }
          />
          <Card title="Details" className="mb-5">
            <DefinitionList items={[['Invoice date', date(inv.invoiceDate)], ['Due date', date(inv.dueDate)], ['Billing period', `${date(inv.periodStart)} to ${date(inv.periodEnd)}`], ['Subscription', <Link to={`/portal/subscriptions/${inv.subscriptionId}`} className="text-brand-ink hover:underline">{inv.subscriptionNumber}</Link>], ...(inv.notes ? ([['Notes', inv.notes]] as [string, string][]) : [])]} />
          </Card>
          <Card title="Items" flush className="mb-5">
            <LinesTable items={inv.items} />
            <div className="border-t border-line">
              <Totals doc={inv} extra={[['Amount paid', money(inv.amountPaid)], ['Outstanding', money(inv.status === 'cancelled' ? 0 : inv.outstanding), true]]} />
            </div>
          </Card>
          <Card title="Payments" flush className="no-print">
            <Table rows={inv.payments} columns={paymentColumns('/portal/invoices', { showCustomer: false }).filter((c) => c.key !== 'invoiceNumber')} empty={<p className="p-6 text-center text-sm text-ink-3">No payments recorded</p>} />
          </Card>
        </>
      )}
    </Loaded>
  );
}

export function PortalPayments() {
  const list = useList('/portal/payments');
  const summary = useFetch<Row>(() => get('/portal/dashboard'), []);
  return (
    <>
      <PageHeader title="Payments" subtitle="Your payment history and remaining balance." crumbs={crumbs('Payments')} />
      {summary.data && (
        <StatGrid>
          <StatCard label="Total outstanding" value={money(summary.data.outstanding)} icon={Wallet} tone="warn" to="/portal/invoices?status=confirmed" />
        </StatGrid>
      )}
      <ListCard
        list={list}
        placeholder="Search reference or invoice"
        columns={paymentColumns('/portal/invoices', { showCustomer: false })}
        empty={<EmptyState title="No payments yet" />}
        filters={
          <>
            <FilterSelect label="Method" value={list.param('method')} onChange={(v) => list.setParam('method', v)} options={Object.entries(METHOD_LABEL)} />
            <FilterDate label="From" value={list.param('from')} onChange={(v) => list.setParam('from', v)} />
            <FilterDate label="To" value={list.param('to')} onChange={(v) => list.setParam('to', v)} />
          </>
        }
      />
    </>
  );
}
