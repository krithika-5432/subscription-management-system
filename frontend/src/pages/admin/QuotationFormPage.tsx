import { useEffect, useRef, useState } from 'react';
import { Controller } from 'react-hook-form';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { Button, Card, ErrorState, PageHeader, Spinner } from '../../components/common/ui';
import { CustomerPicker, FormGrid, inputClass, FieldShell, rules, SelectField, TextAreaField, TextField, useSubmit, useZodForm } from '../../components/forms/fields';
import { cleanLines, emptyPlanLine, LineEditor, linesSchema, PricePreview, toFormLines, useDiscountOptions } from '../../components/forms/LineEditor';
import { useAuth } from '../../context/AuthContext';
import { useFeedback } from '../../context/FeedbackContext';
import { useFetch } from '../../hooks/useFetch';
import { errorMessage, get, getPage, post, put } from '../../services/api';
import type { Row } from '../../types';
import { addDays, today } from '../../utils/format';

const schema = z
  .object({
    customerId: z.string().min(1, 'Choose a customer'),
    templateId: z.string().optional(),
    quotationDate: rules.date,
    expiryDate: rules.date,
    discountId: z.string().optional(),
    terms: z.string().optional(),
    requestId: z.string().optional(),
    lines: linesSchema,
  })
  .refine((q) => q.expiryDate >= q.quotationDate, { message: 'Expiry must be on or after the quotation date', path: ['expiryDate'] })
  .refine((q) => q.lines.filter((l) => l.itemType === 'plan').length === 1, { message: 'Select exactly one subscription plan', path: ['lines'] });

export default function QuotationFormPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const feedback = useFeedback();
  const { can } = useAuth();
  const canDiscount = can('discounts.view');
  const discountOptions = useDiscountOptions(canDiscount);
  const templates = useFetch(() => getPage('/templates', { status: 'active', pageSize: 100 }), []);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ready, setReady] = useState(!id && !params.get('requestId'));
  const applied = useRef(false);

  const form = useZodForm(schema, {
    customerId: params.get('customerId') ?? '',
    templateId: '',
    quotationDate: today(),
    expiryDate: addDays(today(), 30),
    discountId: '',
    terms: '',
    requestId: params.get('requestId') ?? '',
    lines: [emptyPlanLine()],
  });
  const submit = useSubmit(form);

  const applyTemplate = async (templateId: string) => {
    if (!templateId) return;
    try {
      const t = await get(`/templates/${templateId}`);
      form.setValue('lines', toFormLines(t.items), { shouldValidate: true });
      form.setValue('terms', t.terms ?? '');
      form.setValue('expiryDate', addDays(form.getValues('quotationDate') || today(), t.validityDays));
    } catch (err) {
      feedback.error(errorMessage(err));
    }
  };

  // Pre-fill once, from the draft being edited, a customer request, or a template link.
  useEffect(() => {
    if (applied.current) return;
    applied.current = true;
    (async () => {
      try {
        if (id) {
          const q = await get(`/quotations/${id}`);
          form.reset({ customerId: q.customerId, templateId: q.templateId ?? '', quotationDate: q.quotationDate, expiryDate: q.expiryDate, discountId: q.discountId ?? '', terms: q.terms ?? '', requestId: '', lines: toFormLines(q.items) });
        } else if (params.get('requestId')) {
          const r = await get(`/requests/${params.get('requestId')}`);
          const lines: Row[] = [{ ...emptyPlanLine(), planId: r.planId, quantity: r.planQuantity ?? 1 }];
          if (r.productId) lines.push({ itemType: 'product', planId: '', productId: r.productId, variantId: r.variantId ?? '', quantity: r.productQuantity ?? 1, additionalPrice: '' });
          form.setValue('customerId', r.customerId);
          form.setValue('lines', lines);
        } else if (params.get('templateId')) {
          form.setValue('templateId', params.get('templateId'));
          await applyTemplate(params.get('templateId')!);
        }
        setReady(true);
      } catch (err) {
        setLoadError(errorMessage(err));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Options often arrive after the form's values. Re-apply the value so the select can display it.
  const templateCount = templates.data?.rows.length ?? 0;
  useEffect(() => {
    if (templateCount && ready) form.setValue('templateId', form.getValues('templateId'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateCount, ready]);

  if (loadError) return <ErrorState message={loadError} />;
  if (!ready) return <Spinner />;

  const templateField = form.register('templateId', { onChange: (e) => void applyTemplate(e.target.value) });

  return (
    <>
      <PageHeader title={id ? 'Edit quotation' : 'New quotation'} crumbs={[{ label: 'Dashboard', to: '/app/dashboard' }, { label: 'Quotations', to: '/app/quotations' }, { label: id ? 'Edit' : 'New' }]} />
      <form
        noValidate
        className="grid items-start gap-5 xl:grid-cols-3"
        onSubmit={submit(async (values) => {
          const body = { ...values, lines: cleanLines(values.lines), templateId: values.templateId || null, discountId: values.discountId || null, requestId: values.requestId || null };
          const saved = id ? await put(`/quotations/${id}`, body) : await post('/quotations', body);
          feedback.success(id ? 'Quotation saved' : 'Draft quotation created');
          navigate(`/app/quotations/${saved.id}`);
        })}
      >
        <div className="space-y-5 xl:col-span-2">
          <Card title="Customer and validity">
            <FormGrid>
              <Controller
                control={form.control}
                name="customerId"
                render={({ field, fieldState }) => <CustomerPicker label="Customer" required value={field.value} onChange={field.onChange} error={fieldState.error?.message} />}
              />
              <FieldShell label="Quotation template" htmlFor="q-template">
                <select id="q-template" className={inputClass} {...templateField}>
                  <option value="">No template</option>
                  {templates.data?.rows.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </FieldShell>
              <TextField form={form} name="quotationDate" label="Quotation date" type="date" required />
              <TextField form={form} name="expiryDate" label="Expiry date" type="date" required />
            </FormGrid>
          </Card>
          <Card title="Items">
            <LineEditor form={form} />
          </Card>
          <Card title="Terms and conditions">
            <TextAreaField form={form} name="terms" rows={5} />
          </Card>
        </div>
        <div className="space-y-5 xl:sticky xl:top-20">
          <Card title="Price">
            {canDiscount && (
              <div className="mb-4">
                <SelectField form={form} name="discountId" label="Discount" options={discountOptions} placeholder="No discount" />
              </div>
            )}
            <PricePreview form={form} />
          </Card>
          <div className="flex gap-2">
            <Button type="submit" className="flex-1" loading={form.formState.isSubmitting}>Save draft</Button>
            <Button variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
          </div>
        </div>
      </form>
    </>
  );
}
