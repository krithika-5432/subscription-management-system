import PDFDocument from 'pdfkit';

const INK = '#1a1a3d';
const MUTED = '#6b6b85';
const LINE = '#e3e3ee';
const ACCENT = '#4338ca';

// PDFKit's built-in fonts have no rupee glyph, so PDFs state the currency code instead of embedding a font.
const money = (value: string | number) =>
  `INR ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Party {
  customerName: string;
  companyName?: string | null;
  email: string;
  billingAddress?: string | null;
  taxId?: string | null;
}

function toBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

function header(doc: PDFKit.PDFDocument, company: any, title: string, number: string, meta: [string, string][]) {
  doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(18).text(company.name ?? 'Brightloop', 50, 50);
  doc.fillColor(MUTED).font('Helvetica').fontSize(9);
  [company.address, company.email, company.phone, company.taxId && `Tax ID: ${company.taxId}`].filter(Boolean).forEach((line) => doc.text(line));

  doc.fillColor(INK).font('Helvetica-Bold').fontSize(16).text(title, 350, 50, { width: 195, align: 'right' });
  doc.font('Helvetica').fontSize(10).text(number, 350, doc.y, { width: 195, align: 'right' });
  doc.moveDown(0.5).fontSize(9);
  for (const [label, value] of meta) {
    doc.fillColor(MUTED).text(`${label}: `, 350, doc.y, { width: 195, align: 'right', continued: true }).fillColor(INK).text(value);
  }
}

function billTo(doc: PDFKit.PDFDocument, party: Party) {
  const top = Math.max(doc.y, 140) + 16;
  doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8).text('BILL TO', 50, top);
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(10).text(party.companyName || party.customerName);
  doc.font('Helvetica').fontSize(9).fillColor(MUTED);
  if (party.companyName) doc.text(party.customerName);
  [party.billingAddress, party.email, party.taxId && `Tax ID: ${party.taxId}`].filter(Boolean).forEach((line) => doc.text(line as string));
  doc.moveDown(1.5);
}

// x and width per column. The money columns fit 99,99,999.99 at 9pt on one line.
export const COLS = {
  desc: { x: 50, width: 165 },
  qty: { x: 217, width: 28 },
  unit: { x: 247, width: 74 },
  disc: { x: 323, width: 74 },
  tax: { x: 399, width: 72 },
  total: { x: 473, width: 72 },
};

function linesTable(doc: PDFKit.PDFDocument, items: any[]) {
  const head = () => {
    const y = doc.y;
    doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED);
    doc.text('DESCRIPTION', COLS.desc.x, y, { width: COLS.desc.width });
    doc.text('QTY', COLS.qty.x, y, { width: COLS.qty.width, align: 'right' });
    doc.text('UNIT', COLS.unit.x, y, { width: COLS.unit.width, align: 'right' });
    doc.text('DISCOUNT', COLS.disc.x, y, { width: COLS.disc.width, align: 'right' });
    doc.text('TAX', COLS.tax.x, y, { width: COLS.tax.width, align: 'right' });
    doc.text('TOTAL', COLS.total.x, y, { width: COLS.total.width, align: 'right' });
    doc.moveTo(50, y + 14).lineTo(545, y + 14).strokeColor(LINE).stroke();
    doc.y = y + 20;
  };
  head();
  const num = (v: string) => Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  for (const item of items) {
    if (doc.y > 700) {
      doc.addPage();
      doc.y = 50;
      head();
    }
    const y = doc.y;
    doc.font('Helvetica').fontSize(9).fillColor(INK);
    doc.text(item.description, COLS.desc.x, y, { width: COLS.desc.width });
    const after = doc.y;
    doc.text(String(item.quantity), COLS.qty.x, y, { width: COLS.qty.width, align: 'right' });
    doc.text(num(item.unitPrice), COLS.unit.x, y, { width: COLS.unit.width, align: 'right' });
    doc.text(num(item.discountAmount), COLS.disc.x, y, { width: COLS.disc.width, align: 'right' });
    doc.text(num(item.taxAmount), COLS.tax.x, y, { width: COLS.tax.width, align: 'right' });
    doc.text(num(item.lineTotal), COLS.total.x, y, { width: COLS.total.width, align: 'right' });
    doc.y = Math.max(after, y + 14) + 6;
  }
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(LINE).stroke();
  doc.moveDown(0.8);
}

function totals(doc: PDFKit.PDFDocument, rows: [string, string, boolean?][]) {
  for (const [label, value, strong] of rows) {
    const y = doc.y;
    doc.font(strong ? 'Helvetica-Bold' : 'Helvetica').fontSize(strong ? 11 : 9);
    doc.fillColor(strong ? INK : MUTED).text(label, 340, y, { width: 100, align: 'right' });
    doc.fillColor(INK).text(value, 445, y, { width: 100, align: 'right' });
    doc.y = y + (strong ? 18 : 14);
  }
}

/** Tax is shown by rule with the rates stored on the document, so a reissued PDF always matches the original. */
function taxRows(items: any[]): [string, string][] {
  const byRule = new Map<string, { rate: string; amount: number }>();
  for (const item of items) {
    for (const t of item.taxDetails ?? []) {
      const entry = byRule.get(t.name) ?? { rate: t.rate, amount: 0 };
      entry.amount += Number(t.amount);
      byRule.set(t.name, entry);
    }
  }
  return [...byRule].map(([name, t]) => [name, money(t.amount)]);
}

function note(doc: PDFKit.PDFDocument, title: string, text?: string | null) {
  if (!text) return;
  doc.moveDown(1);
  doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8).text(title.toUpperCase(), 50, doc.y, { width: 495 });
  doc.fillColor(INK).font('Helvetica').fontSize(9).text(text, { width: 495 });
}

export function buildInvoicePdf(invoice: any, party: Party, company: any): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const done = toBuffer.bind(null, doc);
  header(doc, company, 'INVOICE', invoice.invoiceNumber, [
    ['Invoice date', invoice.invoiceDate],
    ['Due date', invoice.dueDate],
    ['Period', `${invoice.periodStart} to ${invoice.periodEnd}`],
    ['Subscription', invoice.subscriptionNumber],
    ['Status', invoice.status.toUpperCase()],
  ]);
  billTo(doc, party);
  linesTable(doc, invoice.items);
  totals(doc, [
    ['Subtotal', money(invoice.subtotal)],
    ['Discount', `- ${money(invoice.discountTotal)}`],
    ...taxRows(invoice.items),
    ['Total', money(invoice.total), true],
    ['Amount paid', money(invoice.amountPaid)],
    ['Outstanding', money(invoice.outstanding), true],
  ]);
  note(doc, 'Notes', invoice.notes);
  return done();
}

export function buildQuotationPdf(quotation: any, party: Party, company: any): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const done = toBuffer.bind(null, doc);
  header(doc, company, 'QUOTATION', quotation.quotationNumber, [
    ['Date', quotation.quotationDate],
    ['Valid until', quotation.expiryDate],
    ['Status', quotation.status.toUpperCase()],
  ]);
  billTo(doc, party);
  linesTable(doc, quotation.items);
  totals(doc, [
    ['Subtotal', money(quotation.subtotal)],
    ['Discount', `- ${money(quotation.discountTotal)}`],
    ...taxRows(quotation.items),
    ['Total per billing cycle', money(quotation.total), true],
  ]);
  note(doc, 'Terms and conditions', quotation.terms);
  return done();
}
