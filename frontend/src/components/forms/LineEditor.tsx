import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useFieldArray, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { useFetch } from '../../hooks/useFetch';
import { errorMessage, getPage, post } from '../../services/api';
import type { LineValue, Row } from '../../types';
import { money } from '../../utils/format';
import { Button, Spinner } from '../common/ui';
import { inputClass, rules, type Form } from './fields';

export const lineSchema = z
  .object({
    itemType: z.enum(['plan', 'product']),
    planId: z.string().optional(),
    productId: z.string().optional(),
    variantId: z.string().optional(),
    quantity: rules.count,
    additionalPrice: z.string().optional(),
  })
  .superRefine((line, ctx) => {
    if (line.itemType === 'plan' && !line.planId) ctx.addIssue({ code: 'custom', path: ['planId'], message: 'Choose a plan' });
    if (line.itemType === 'product' && !line.productId) ctx.addIssue({ code: 'custom', path: ['productId'], message: 'Choose a product' });
  });

export const linesSchema = z.array(lineSchema).min(1, 'Add at least one line');

export const emptyPlanLine = (): LineValue => ({ itemType: 'plan', planId: '', productId: '', variantId: '', quantity: 1, additionalPrice: '' });
const emptyProductLine = (): LineValue => ({ itemType: 'product', planId: '', productId: '', variantId: '', quantity: 1, additionalPrice: '' });

/** Sends only what the line type needs. The server looks up every price itself. */
export const cleanLines = (lines: LineValue[]) =>
  lines.map((l) =>
    l.itemType === 'plan'
      ? { itemType: 'plan', planId: l.planId, quantity: Number(l.quantity) }
      : { itemType: 'product', productId: l.productId, variantId: l.variantId || null, quantity: Number(l.quantity), additionalPrice: l.additionalPrice || null },
  );

export const toFormLines = (items: Row[]): LineValue[] =>
  items.map((i) => ({ itemType: i.itemType, planId: i.planId ?? '', productId: i.productId ?? '', variantId: i.variantId ?? '', quantity: i.quantity, additionalPrice: '' }));

export function useCatalog() {
  return useFetch(
    async () => {
      const [plans, products] = await Promise.all([getPage('/plans', { status: 'active', pageSize: 100 }), getPage('/products', { status: 'active', pageSize: 100 })]);
      return { plans: plans.rows, products: products.rows };
    },
    [],
  );
}

export function LineEditor({ form, name = 'lines' }: { form: Form; name?: string }) {
  const { fields, append, remove } = useFieldArray({ control: form.control, name });
  const catalog = useCatalog();
  const lines: LineValue[] = useWatch({ control: form.control, name }) ?? [];
  const errors = (form.formState.errors[name] ?? {}) as Row;
  const hasPlan = lines.some((l) => l.itemType === 'plan');

  // The selects mount with their options present, so saved values always display.
  if (catalog.error) return <p role="alert" className="text-sm text-bad">{catalog.error}</p>;
  if (!catalog.data) return <Spinner label="Loading catalogue" />;

  return (
    <div>
      <div className="space-y-3">
        {fields.map((field, i) => {
          const line = lines[i] ?? (field as unknown as LineValue);
          const product = catalog.data?.products.find((p) => p.id === line.productId);
          const variant = product?.variants.find((v: Row) => v.id === line.variantId);
          const rowErrors = errors[i] ?? {};
          const itemError = (rowErrors.planId?.message ?? rowErrors.productId?.message) as string | undefined;
          const selectedPlan = catalog.data?.plans.find((p) => p.id === line.planId);
          return (
            <div key={field.id} className="grid grid-cols-12 items-start gap-2 rounded-md border border-line p-2.5">
              <span className="col-span-12 text-xs font-semibold text-ink-3 sm:col-span-2 sm:pt-3">{line.itemType === 'plan' ? 'Plan' : 'Product'}</span>
              <div className={`col-span-12 ${line.itemType === 'plan' ? 'sm:col-span-7' : 'sm:col-span-4'}`}>
                {line.itemType === 'plan' ? (
                  <select aria-label="Subscription plan" aria-invalid={!!itemError} className={inputClass} {...form.register(`${name}.${i}.planId`)}>
                    <option value="">Choose a plan</option>
                    {catalog.data?.plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({money(p.price)} {p.billingFrequency})
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    aria-label="Product"
                    aria-invalid={!!itemError}
                    className={inputClass}
                    {...form.register(`${name}.${i}.productId`, {
                      onChange: () => form.setValue(`${name}.${i}.variantId`, ''),
                    })}
                  >
                    <option value="">Choose a product</option>
                    {catalog.data?.products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({money(p.salesPrice)})
                      </option>
                    ))}
                  </select>
                )}
                {itemError && <p role="alert" className="mt-1 text-xs text-bad">{itemError}</p>}
                {selectedPlan && selectedPlan.minQuantity > 1 && <p className="mt-1 text-xs text-ink-3">Minimum quantity {selectedPlan.minQuantity}</p>}
              </div>
              {line.itemType === 'product' && (
                <div className="col-span-12 sm:col-span-3">
                  <select aria-label="Variant" disabled={!product?.variants?.length} className={inputClass} {...form.register(`${name}.${i}.variantId`)}>
                    <option value="">{product?.variants?.length ? 'Base product' : 'No variants'}</option>
                    {product?.variants
                      ?.filter((v: Row) => v.status === 'active')
                      .map((v: Row) => (
                        <option key={v.id} value={v.id}>
                          {v.name} {v.isConfigurable ? '(set price)' : `(+${money(v.additionalPrice)})`}
                        </option>
                      ))}
                  </select>
                  {variant?.isConfigurable && <input aria-label="Additional price" type="number" min="0" step="0.01" placeholder="Additional price" className={`${inputClass} mt-2`} {...form.register(`${name}.${i}.additionalPrice`)} />}
                </div>
              )}
              <div className="col-span-8 sm:col-span-2">
                <input aria-label="Quantity" type="number" min="1" step="1" aria-invalid={!!rowErrors.quantity} className={`${inputClass} tnum`} {...form.register(`${name}.${i}.quantity`)} />
                {rowErrors.quantity && <p role="alert" className="mt-1 text-xs text-bad">{rowErrors.quantity.message}</p>}
              </div>
              <div className="col-span-4 flex justify-end sm:col-span-1">
                <button type="button" aria-label="Remove line" onClick={() => remove(i)} className="inline-flex h-10 w-10 items-center justify-center rounded-md text-ink-3 hover:bg-bad-soft hover:text-bad">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {typeof errors.message === 'string' && <p role="alert" className="mt-2 text-xs text-bad">{errors.message}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {!hasPlan && (
          <Button variant="secondary" small icon={Plus} onClick={() => append(emptyPlanLine())}>
            Add plan
          </Button>
        )}
        <Button variant="secondary" small icon={Plus} onClick={() => append(emptyProductLine())}>
          Add product
        </Button>
      </div>
    </div>
  );
}

/** Live totals from the server, so the customer-facing number is always what will actually be saved. */
export function PricePreview({ form, name = 'lines' }: { form: Form; name?: string }) {
  const lines: LineValue[] = useWatch({ control: form.control, name }) ?? [];
  const discountId: string = useWatch({ control: form.control, name: 'discountId' }) ?? '';
  const [result, setResult] = useState<Row | null>(null);
  const [error, setError] = useState<string | null>(null);
  const complete = lines.filter((l) => (l.itemType === 'plan' ? l.planId : l.productId) && Number(l.quantity) >= 1);
  const key = JSON.stringify([cleanLines(complete), discountId]);

  useEffect(() => {
    if (!complete.length) {
      setResult(null);
      setError(null);
      return;
    }
    let stale = false;
    const timer = setTimeout(async () => {
      try {
        const calc = await post('/quotations/preview', { lines: cleanLines(complete), discountId: discountId || null });
        if (!stale) {
          setResult(calc);
          setError(null);
        }
      } catch (err) {
        if (!stale) {
          setResult(null);
          setError(errorMessage(err));
        }
      }
    }, 300);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (error) return <p role="alert" className="rounded-md bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>;
  if (!result) return <p className="text-sm text-ink-3">Choose items to see the price.</p>;
  const rows: [string, string, boolean?][] = [
    ['Subtotal', money(result.subtotal)],
    ['Discount', Number(result.discountTotal) > 0 ? `- ${money(result.discountTotal)}` : money(0)],
    ['Tax', money(result.taxTotal)],
    ['Total per billing cycle', money(result.total), true],
  ];
  return (
    <div>
      <ul className="mb-3 space-y-1 border-b border-line pb-3 text-xs text-ink-2">
        {result.lines.map((l: Row, i: number) => (
          <li key={i} className="flex justify-between gap-3">
            <span>{l.description} x {l.quantity}</span>
            <span className="tnum whitespace-nowrap">{money(l.lineSubtotal)}</span>
          </li>
        ))}
      </ul>
      <dl className="space-y-1.5 text-sm">
        {rows.map(([label, value, strong]) => (
          <div key={label} className={`flex justify-between gap-4 ${strong ? 'border-t border-line pt-1.5 font-bold text-ink' : 'text-ink-2'}`}>
            <dt>{label}</dt>
            <dd className="tnum">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function useDiscountOptions(enabled: boolean) {
  const state = useFetch(() => (enabled ? getPage('/discounts', { status: 'active', pageSize: 100 }) : Promise.resolve({ rows: [] as Row[] })), [enabled]);
  return (state.data?.rows ?? []).map((d): [string, string] => [d.id, `${d.name} (${d.discountType === 'percentage' ? `${Number(d.value)}%` : money(d.value)})`]);
}
