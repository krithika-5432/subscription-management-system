import { useEffect, useState } from 'react';
import { Controller } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { Button, Card, ErrorState, PageHeader, Spinner } from '../../components/common/ui';
import { CustomerPicker, FormGrid, rules, SelectField, TextAreaField, TextField, useSubmit, useZodForm } from '../../components/forms/fields';
import { cleanLines, emptyPlanLine, LineEditor, linesSchema, PricePreview, toFormLines, useDiscountOptions } from '../../components/forms/LineEditor';
import { useAuth } from '../../context/AuthContext';
import { useFeedback } from '../../context/FeedbackContext';
import { errorMessage, get, post, put } from '../../services/api';
import { today } from '../../utils/format';

const schema = z
  .object({
    customerId: z.string().min(1, 'Choose a customer'),
    startDate: rules.date,
    expiryDate: z.string().optional(),
    paymentTermsDays: z.coerce.string().refine((v) => v === '' || (Number.isInteger(Number(v)) && Number(v) >= 0), 'Enter a whole number of days'),
    discountId: z.string().optional(),
    notes: z.string().optional(),
    lines: linesSchema,
  })
  .refine((s) => !s.expiryDate || s.expiryDate > s.startDate, { message: 'Expiry must be after the start date', path: ['expiryDate'] })
  .refine((s) => s.lines.filter((l) => l.itemType === 'plan').length === 1, { message: 'Select exactly one subscription plan', path: ['lines'] });

export default function SubscriptionFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const feedback = useFeedback();
  const { can } = useAuth();
  const canDiscount = can('discounts.view');
  const discountOptions = useDiscountOptions(canDiscount);
  const [ready, setReady] = useState(!id);
  const [loadError, setLoadError] = useState<string | null>(null);
  const form = useZodForm(schema, { customerId: '', startDate: today(), expiryDate: '', paymentTermsDays: '', discountId: '', notes: '', lines: [emptyPlanLine()] });
  const submit = useSubmit(form);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const s = await get(`/subscriptions/${id}`);
        form.reset({ customerId: s.customerId, startDate: s.startDate, expiryDate: s.expiryDate, paymentTermsDays: s.paymentTermsDays, discountId: s.discountId ?? '', notes: s.notes ?? '', lines: toFormLines(s.items) });
        setReady(true);
      } catch (err) {
        setLoadError(errorMessage(err));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loadError) return <ErrorState message={loadError} />;
  if (!ready) return <Spinner />;

  return (
    <>
      <PageHeader title={id ? 'Edit subscription' : 'New subscription'} crumbs={[{ label: 'Dashboard', to: '/app/dashboard' }, { label: 'Subscriptions', to: '/app/subscriptions' }, { label: id ? 'Edit' : 'New' }]} />
      <form
        noValidate
        className="grid items-start gap-5 xl:grid-cols-3"
        onSubmit={submit(async (values) => {
          const body = { ...values, lines: cleanLines(values.lines), discountId: values.discountId || null, expiryDate: values.expiryDate || null, paymentTermsDays: values.paymentTermsDays === '' ? undefined : values.paymentTermsDays };
          const saved = id ? await put(`/subscriptions/${id}`, body) : await post('/subscriptions', body);
          feedback.success(id ? 'Subscription saved' : 'Draft subscription created');
          navigate(`/app/subscriptions/${saved.id}`);
        })}
      >
        <div className="space-y-5 xl:col-span-2">
          <Card title="Subscription">
            <FormGrid>
              {!id ? (
                <Controller control={form.control} name="customerId" render={({ field, fieldState }) => <CustomerPicker label="Customer" required value={field.value} onChange={field.onChange} error={fieldState.error?.message} />} />
              ) : <div className="hidden sm:block" />}
              <TextField form={form} name="paymentTermsDays" label="Payment terms (days)" type="number" min="0" hint="Leave empty to use the default from billing settings." />
              <TextField form={form} name="startDate" label="Start date" type="date" required />
              <TextField form={form} name="expiryDate" label="Expiry date" type="date" hint="Leave empty to use the plan's term." />
            </FormGrid>
          </Card>
          <Card title="Items">
            <LineEditor form={form} />
          </Card>
          <Card title="Notes">
            <TextAreaField form={form} name="notes" />
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
