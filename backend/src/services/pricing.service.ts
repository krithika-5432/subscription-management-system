import * as catalog from '../repositories/catalog.repository.js';
import { calculate, discountIneligibleReason, fromPaise, toPaise, type Calculation, type DiscountRule, type PricedLine } from '../utils/calculation.js';
import { today } from '../utils/dates.js';
import { badRequest } from '../utils/http.js';
import type { LineInput } from '../validators/common.js';

const FREQUENCY_LABEL: Record<string, string> = { daily: 'daily', weekly: 'weekly', monthly: 'monthly', yearly: 'yearly' };

/** Turns line requests into priced lines using current catalogue prices. Clients never supply unit prices. */
export async function priceCatalogLines(lines: LineInput[], opts: { onDate?: string } = {}): Promise<{ lines: PricedLine[]; plans: any[] }> {
  const onDate = opts.onDate ?? today();
  const unique = (values: (string | null | undefined)[]) => [...new Set(values.filter(Boolean))] as string[];
  const [products, variants, plans] = await Promise.all([
    catalog.productsForPricing(unique(lines.map((l) => l.productId))),
    catalog.variantsForPricing(unique(lines.map((l) => l.variantId))),
    catalog.plansForPricing(unique(lines.map((l) => l.planId))),
  ]);

  const priced = lines.map((line): PricedLine => {
    if (line.itemType === 'plan') {
      const plan = plans.find((p) => p.id === line.planId);
      if (!plan) throw badRequest('A selected plan no longer exists');
      if (plan.status !== 'active') throw badRequest(`${plan.name} is not active`);
      if ((plan.availableFrom && onDate < plan.availableFrom) || (plan.availableUntil && onDate > plan.availableUntil)) {
        throw badRequest(`${plan.name} is not available on ${onDate}`);
      }
      if (line.quantity < plan.minQuantity) throw badRequest(`${plan.name} has a minimum quantity of ${plan.minQuantity}`);
      return {
        itemType: 'plan',
        planId: plan.id,
        description: `${plan.name} (${FREQUENCY_LABEL[plan.billingFrequency]})`,
        quantity: line.quantity,
        unitPrice: plan.price,
      };
    }
    const product = products.find((p) => p.id === line.productId);
    if (!product) throw badRequest('A selected product no longer exists');
    if (product.status !== 'active') throw badRequest(`${product.name} is not active`);
    let unit = toPaise(product.salesPrice);
    let description = product.name;
    if (line.variantId) {
      const variant = variants.find((v) => v.id === line.variantId && v.productId === product.id);
      if (!variant) throw badRequest(`The selected variant does not belong to ${product.name}`);
      if (variant.status !== 'active') throw badRequest(`Variant ${variant.name} is not active`);
      // Only a configurable variant accepts a negotiated additional price.
      unit += toPaise(variant.isConfigurable ? (line.additionalPrice ?? variant.additionalPrice) : variant.additionalPrice);
      description = `${product.name} - ${variant.name}`;
    }
    return { itemType: 'product', productId: product.id, variantId: line.variantId ?? null, description, quantity: line.quantity, unitPrice: fromPaise(unit) };
  });
  return { lines: priced, plans };
}

/** Validates a chosen discount, returning it or throwing a message the user can act on. */
export async function resolveDiscount(discountId: string | null | undefined, lines: PricedLine[], onDate: string): Promise<DiscountRule | null> {
  if (!discountId) return null;
  const discount = await catalog.findDiscount(discountId);
  if (!discount) throw badRequest('The selected discount no longer exists');
  const reason = discountIneligibleReason(discount, lines, onDate);
  if (reason) throw badRequest(reason);
  return discount;
}

export async function priceDocument(lines: LineInput[], discountId: string | null | undefined, onDate = today()): Promise<Calculation> {
  if (!lines.length) throw badRequest('Add at least one line');
  const { lines: priced } = await priceCatalogLines(lines, { onDate });
  const discount = await resolveDiscount(discountId, priced, onDate);
  return calculate(priced, discount, await catalog.activeTaxRules());
}

export function requireSinglePlan(lines: LineInput[]) {
  const planLines = lines.filter((l) => l.itemType === 'plan');
  if (planLines.length !== 1) throw badRequest('Select exactly one subscription plan');
  return planLines[0];
}
