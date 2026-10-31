import { Link } from 'react-router-dom';
import type { Column } from '../tables/DataTable';
import type { Row } from '../../types';
import { date, METHOD_LABEL, money } from '../../utils/format';
import { Badge, StatusBadge } from './ui';

const today = () => new Date().toLocaleDateString('en-CA');

export const isOverdue = (invoice: Row) => invoice.status === 'confirmed' && Number(invoice.outstanding) > 0 && invoice.dueDate < today();

/** Invoice lifecycle and payment state are separate facts, shown side by side. */
export const InvoiceStatus = ({ invoice }: { invoice: Row }) => (
  <span className="inline-flex flex-wrap gap-1">
    {isOverdue(invoice) ? <StatusBadge status="overdue" /> : <StatusBadge status={invoice.status} />}
    {invoice.status === 'confirmed' && invoice.paymentStatus === 'partial' && <StatusBadge status="partial" />}
  </span>
);

export const invoiceColumns = (base: string, opts: { showCustomer?: boolean } = {}): Column[] => [
  { key: 'invoiceNumber', header: 'Invoice', sort: 'invoiceNumber', render: (r) => <Link to={`${base}/${r.id}`} className="font-semibold whitespace-nowrap text-brand-ink hover:underline">{r.invoiceNumber}</Link> },
  ...(opts.showCustomer === false ? [] : [{ key: 'customerName', header: 'Customer', sort: 'customerName' } as Column]),
  { key: 'invoiceDate', header: 'Date', sort: 'invoiceDate', optional: true, render: (r) => date(r.invoiceDate) },
  { key: 'dueDate', header: 'Due', sort: 'dueDate', render: (r) => <span className="whitespace-nowrap">{date(r.dueDate)}</span> },
  { key: 'total', header: 'Total', sort: 'total', align: 'right', render: (r) => money(r.total) },
  { key: 'outstanding', header: 'Outstanding', sort: 'outstanding', align: 'right', render: (r) => (r.status === 'cancelled' ? '-' : money(r.outstanding)) },
  { key: 'status', header: 'Status', sort: 'status', render: (r) => <InvoiceStatus invoice={r} /> },
];

export const paymentColumns = (invoiceBase: string, opts: { showCustomer?: boolean } = {}): Column[] => [
  { key: 'paymentReference', header: 'Reference', sort: 'paymentReference', render: (r) => <span className="font-semibold whitespace-nowrap">{r.paymentReference}</span> },
  ...(opts.showCustomer === false ? [] : [{ key: 'customerName', header: 'Customer', sort: 'customerName' } as Column]),
  { key: 'invoiceNumber', header: 'Invoice', render: (r) => <Link to={`${invoiceBase}/${r.invoiceId}`} className="whitespace-nowrap text-brand-ink hover:underline">{r.invoiceNumber}</Link> },
  { key: 'method', header: 'Method', sort: 'method', optional: true, render: (r) => METHOD_LABEL[r.method] },
  { key: 'paymentDate', header: 'Date', sort: 'paymentDate', render: (r) => <span className="whitespace-nowrap">{date(r.paymentDate)}</span> },
  { key: 'amount', header: 'Amount', sort: 'amount', align: 'right', render: (r) => money(r.amount) },
  { key: 'status', header: 'Status', sort: 'status', render: (r) => <StatusBadge status={r.status} /> },
];

export const subscriptionColumns = (base: string, opts: { showCustomer?: boolean } = {}): Column[] => [
  { key: 'subscriptionNumber', header: 'Subscription', sort: 'subscriptionNumber', render: (r) => <Link to={`${base}/${r.id}`} className="font-semibold whitespace-nowrap text-brand-ink hover:underline">{r.subscriptionNumber}</Link> },
  ...(opts.showCustomer === false ? [] : [{ key: 'customerName', header: 'Customer', sort: 'customerName' } as Column]),
  { key: 'planName', header: 'Plan', sort: 'planName' },
  { key: 'startDate', header: 'Start', sort: 'startDate', optional: true, render: (r) => date(r.startDate) },
  { key: 'expiryDate', header: 'Expiry', sort: 'expiryDate', render: (r) => <span className="whitespace-nowrap">{date(r.expiryDate)}</span> },
  { key: 'total', header: 'Per cycle', sort: 'total', align: 'right', render: (r) => money(r.total) },
  { key: 'status', header: 'Status', sort: 'status', render: (r) => <StatusBadge status={r.status} /> },
];

export const quotationColumns = (base: string, opts: { showCustomer?: boolean } = {}): Column[] => [
  { key: 'quotationNumber', header: 'Quotation', sort: 'quotationNumber', render: (r) => <Link to={`${base}/${r.id}`} className="font-semibold whitespace-nowrap text-brand-ink hover:underline">{r.quotationNumber}</Link> },
  ...(opts.showCustomer === false ? [] : [{ key: 'customerName', header: 'Customer', sort: 'customerName' } as Column]),
  { key: 'quotationDate', header: 'Date', sort: 'quotationDate', optional: true, render: (r) => date(r.quotationDate) },
  { key: 'expiryDate', header: 'Expires', sort: 'expiryDate', render: (r) => <span className="whitespace-nowrap">{date(r.expiryDate)}</span> },
  { key: 'total', header: 'Total', sort: 'total', align: 'right', render: (r) => money(r.total) },
  { key: 'status', header: 'Status', sort: 'status', render: (r) => <StatusBadge status={r.status} /> },
];

/** The priced lines of a quotation, subscription or invoice, with stored tax and discount values. */
export function LinesTable({ items }: { items: Row[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-ink-2">
            <th scope="col" className="px-4 py-2.5 text-left font-semibold">Item</th>
            <th scope="col" className="px-4 py-2.5 text-right font-semibold">Qty</th>
            <th scope="col" className="px-4 py-2.5 text-right font-semibold">Unit price</th>
            <th scope="col" className="px-4 py-2.5 text-right font-semibold">Discount</th>
            <th scope="col" className="px-4 py-2.5 text-right font-semibold">Tax</th>
            <th scope="col" className="px-4 py-2.5 text-right font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id ?? item.description} className="border-b border-line last:border-0">
              <td className="px-4 py-2.5 text-ink">
                {item.description}
                {item.itemType === 'plan' && <span className="ml-2"><Badge tone="brand">Plan</Badge></span>}
                {item.discountName && <span className="block text-xs text-ink-3">{item.discountName}</span>}
                {item.taxDetails?.length > 0 && <span className="block text-xs text-ink-3">{item.taxDetails.map((t: Row) => t.name).join(', ')}</span>}
              </td>
              <td className="tnum px-4 py-2.5 text-right text-ink">{item.quantity}</td>
              <td className="tnum px-4 py-2.5 text-right whitespace-nowrap text-ink">{money(item.unitPrice)}</td>
              <td className="tnum px-4 py-2.5 text-right whitespace-nowrap text-ink">{Number(item.discountAmount) > 0 ? `- ${money(item.discountAmount)}` : '-'}</td>
              <td className="tnum px-4 py-2.5 text-right whitespace-nowrap text-ink">{money(item.taxAmount)}</td>
              <td className="tnum px-4 py-2.5 text-right font-semibold whitespace-nowrap text-ink">{money(item.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Totals({ doc, extra, totalLabel = 'Total' }: { doc: Row; extra?: [string, string, boolean?][]; totalLabel?: string }) {
  const rows: [string, string, boolean?][] = [
    ['Subtotal', money(doc.subtotal)],
    ['Discount', Number(doc.discountTotal) > 0 ? `- ${money(doc.discountTotal)}` : money(0)],
    ['Tax', money(doc.taxTotal)],
    [totalLabel, money(doc.total), true],
    ...(extra ?? []),
  ];
  return (
    <dl className="ml-auto w-full max-w-xs space-y-1.5 p-4 text-sm">
      {rows.map(([label, value, strong]) => (
        <div key={label} className={`flex justify-between gap-4 ${strong ? 'border-t border-line pt-1.5 font-bold text-ink' : 'text-ink-2'}`}>
          <dt>{label}</dt>
          <dd className="tnum">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
