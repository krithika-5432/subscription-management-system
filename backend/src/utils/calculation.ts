// Pure pricing maths. All amounts are handled as integer paise so no floating-point error can reach an invoice.

export const toPaise = (value: string | number): number => Math.round(Number(value) * 100);
export const fromPaise = (paise: number): string => (paise / 100).toFixed(2);

export interface PricedLine {
  itemType: 'product' | 'plan';
  productId?: string | null;
  variantId?: string | null;
  planId?: string | null;
  description: string;
  quantity: number;
  unitPrice: string;
}

export interface DiscountRule {
  id: string;
  name: string;
  discountType: 'fixed' | 'percentage';
  value: string;
  minPurchase: string;
  minQuantity: number;
  startDate: string;
  endDate: string;
  usageLimit: number | null;
  usageCount: number;
  scope: 'all' | 'selected';
  status: string;
  productIds: string[];
  planIds: string[];
}

export interface TaxRule {
  id: string;
  name: string;
  rate: string;
  appliesTo: 'all' | 'products' | 'plans';
}

export interface TaxDetail {
  id: string;
  name: string;
  rate: string;
  amount: string;
}

export interface CalculatedLine extends PricedLine {
  lineSubtotal: string;
  discountName: string | null;
  discountAmount: string;
  taxAmount: string;
  taxDetails: TaxDetail[];
  lineTotal: string;
}

export interface Calculation {
  lines: CalculatedLine[];
  discount: DiscountRule | null;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  total: string;
}

const lineGross = (line: PricedLine) => toPaise(line.unitPrice) * line.quantity;

export function isLineEligible(discount: DiscountRule, line: PricedLine): boolean {
  if (discount.scope === 'all') return true;
  if (line.itemType === 'plan') return !!line.planId && discount.planIds.includes(line.planId);
  return !!line.productId && discount.productIds.includes(line.productId);
}

/** Returns why the discount cannot be used on these lines, or null when it can. */
export function discountIneligibleReason(discount: DiscountRule, lines: PricedLine[], onDate: string): string | null {
  if (discount.status !== 'active') return 'This discount is not active';
  if (onDate < discount.startDate) return 'This discount has not started yet';
  if (onDate > discount.endDate) return 'This discount has expired';
  if (discount.usageLimit !== null && discount.usageCount >= discount.usageLimit) return 'This discount has reached its usage limit';
  const eligible = lines.filter((line) => isLineEligible(discount, line));
  if (!eligible.length) return 'This discount does not apply to the selected items';
  const amount = eligible.reduce((sum, line) => sum + lineGross(line), 0);
  if (amount < toPaise(discount.minPurchase)) return `This discount needs a minimum purchase of ${discount.minPurchase}`;
  const quantity = eligible.reduce((sum, line) => sum + line.quantity, 0);
  if (quantity < discount.minQuantity) return `This discount needs a minimum quantity of ${discount.minQuantity}`;
  return null;
}

/** Splits the discount across eligible lines. Fixed amounts are shared by value; rounding leftovers go to the last line. */
function allocateDiscount(discount: DiscountRule, lines: PricedLine[]): number[] {
  const gross = lines.map(lineGross);
  const eligible = lines.map((line) => isLineEligible(discount, line));
  if (discount.discountType === 'percentage') {
    const basisPoints = toPaise(discount.value);
    return gross.map((g, i) => (eligible[i] ? Math.round((g * basisPoints) / 10_000) : 0));
  }
  const eligibleTotal = gross.reduce((sum, g, i) => (eligible[i] ? sum + g : sum), 0);
  const amount = Math.min(toPaise(discount.value), eligibleTotal);
  const shares = gross.map(() => 0);
  let remaining = amount;
  const lastEligible = eligible.lastIndexOf(true);
  gross.forEach((g, i) => {
    if (!eligible[i]) return;
    shares[i] = i === lastEligible ? remaining : Math.round((amount * g) / eligibleTotal);
    remaining -= shares[i];
  });
  return shares;
}

export function calculate(lines: PricedLine[], discount: DiscountRule | null, taxRules: TaxRule[]): Calculation {
  const discounts = discount ? allocateDiscount(discount, lines) : lines.map(() => 0);
  let subtotal = 0;
  let discountTotal = 0;
  let taxTotal = 0;

  const calculated = lines.map((line, i): CalculatedLine => {
    const gross = lineGross(line);
    const lineDiscount = discounts[i];
    const net = gross - lineDiscount;
    const applicable = taxRules.filter(
      (rule) => rule.appliesTo === 'all' || (rule.appliesTo === 'plans') === (line.itemType === 'plan'),
    );
    const taxDetails = applicable.map((rule) => {
      const amount = Math.round((net * toPaise(rule.rate)) / 10_000);
      return { id: rule.id, name: rule.name, rate: rule.rate, amount };
    });
    const tax = taxDetails.reduce((sum, t) => sum + t.amount, 0);
    subtotal += gross;
    discountTotal += lineDiscount;
    taxTotal += tax;
    return {
      ...line,
      lineSubtotal: fromPaise(gross),
      discountName: lineDiscount > 0 && discount ? discount.name : null,
      discountAmount: fromPaise(lineDiscount),
      taxAmount: fromPaise(tax),
      taxDetails: taxDetails.map((t) => ({ ...t, amount: fromPaise(t.amount) })),
      lineTotal: fromPaise(net + tax),
    };
  });

  return {
    lines: calculated,
    discount: discountTotal > 0 ? discount : null,
    subtotal: fromPaise(subtotal),
    discountTotal: fromPaise(discountTotal),
    taxTotal: fromPaise(taxTotal),
    total: fromPaise(subtotal - discountTotal + taxTotal),
  };
}

/** Recalculates an edited draft line, keeping the tax rates captured when it was created. */
export function recalcLineWithStoredTax(
  line: PricedLine & { discountName?: string | null; discountAmount: string; taxDetails: TaxDetail[] },
): CalculatedLine {
  const gross = lineGross(line);
  const lineDiscount = Math.min(toPaise(line.discountAmount), gross);
  const net = gross - lineDiscount;
  const taxDetails = line.taxDetails.map((t) => ({ ...t, amount: Math.round((net * toPaise(t.rate)) / 10_000) }));
  const tax = taxDetails.reduce((sum, t) => sum + t.amount, 0);
  return {
    ...line,
    lineSubtotal: fromPaise(gross),
    discountName: lineDiscount > 0 ? (line.discountName ?? null) : null,
    discountAmount: fromPaise(lineDiscount),
    taxAmount: fromPaise(tax),
    taxDetails: taxDetails.map((t) => ({ ...t, amount: fromPaise(t.amount) })),
    lineTotal: fromPaise(net + tax),
  };
}
