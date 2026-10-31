import { Link, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { Button, Card, Loaded, PageHeader, Tabs } from '../../components/common/ui';
import { CheckField, FormGrid, rules, TextAreaField, TextField, useSubmit, useZodForm } from '../../components/forms/fields';
import { useFeedback } from '../../context/FeedbackContext';
import { useFetch } from '../../hooks/useFetch';
import { get, put } from '../../services/api';
import type { Row } from '../../types';
import { titleCase } from '../../utils/format';
import ProfilePage from '../staff/ProfilePage';

const SaveButton = ({ loading }: { loading: boolean }) => <Button type="submit" loading={loading}>Save changes</Button>;

function CompanySettings({ values, onSaved }: { values: Row; onSaved: () => void }) {
  const feedback = useFeedback();
  const form = useZodForm(z.object({ name: rules.required, email: rules.email, phone: z.string().optional(), address: z.string().optional(), taxId: z.string().optional(), website: z.string().optional() }), values);
  const submit = useSubmit(form);
  return (
    <Card title="Company information">
      <form noValidate className="space-y-4" onSubmit={submit(async (v) => {
        await put('/settings/company', v);
        feedback.success('Company information saved');
        onSaved();
      })}>
        <FormGrid>
          <TextField form={form} name="name" label="Company name" required />
          <TextField form={form} name="email" label="Email" type="email" required />
          <TextField form={form} name="phone" label="Phone" />
          <TextField form={form} name="taxId" label="Tax ID" />
          <TextField form={form} name="website" label="Website" />
        </FormGrid>
        <TextAreaField form={form} name="address" label="Address" hint="Shown on invoices and quotations." />
        <SaveButton loading={form.formState.isSubmitting} />
      </form>
    </Card>
  );
}

function BillingSettings({ values, onSaved }: { values: Row; onSaved: () => void }) {
  const feedback = useFeedback();
  const form = useZodForm(z.object({ defaultPaymentTermsDays: z.coerce.string().refine((v) => Number.isInteger(Number(v)) && Number(v) >= 0, 'Enter a whole number of days'), expiringSoonDays: rules.count, invoiceNotes: z.string().optional() }), values);
  const submit = useSubmit(form);
  return (
    <Card title="Billing settings">
      <form noValidate className="space-y-4" onSubmit={submit(async (v) => {
        await put('/settings/billing', v);
        feedback.success('Billing settings saved');
        onSaved();
      })}>
        <FormGrid>
          <TextField form={form} name="defaultPaymentTermsDays" label="Default payment terms (days)" type="number" min="0" required />
          <TextField form={form} name="expiringSoonDays" label="Expiring soon window (days)" type="number" min="1" required hint="Used by dashboards, renewals and reminders." />
        </FormGrid>
        <TextAreaField form={form} name="invoiceNotes" label="Default invoice notes" />
        <p className="text-sm text-ink-2">Tax rates are managed on the <Link to="/app/taxes" className="font-semibold text-brand-ink hover:underline">Taxes</Link> page.</p>
        <SaveButton loading={form.formState.isSubmitting} />
      </form>
    </Card>
  );
}

function SequenceRow({ sequence, onSaved }: { sequence: Row; onSaved: () => void }) {
  const feedback = useFeedback();
  const form = useZodForm(z.object({ prefix: rules.required, nextValue: rules.count, padding: rules.count }), { prefix: sequence.prefix, nextValue: sequence.nextValue, padding: sequence.padding });
  const submit = useSubmit(form);
  return (
    <form noValidate className="grid items-start gap-3 border-b border-line py-4 last:border-0 sm:grid-cols-[8rem_1fr_1fr_1fr_auto]" onSubmit={submit(async (v) => {
      await put(`/settings/sequences/${sequence.code}`, v);
      feedback.success(`${titleCase(sequence.code)} numbering saved`);
      onSaved();
    })}>
      <span className="text-sm font-semibold text-ink sm:pt-7">{titleCase(sequence.code)}</span>
      <TextField form={form} name="prefix" label="Prefix" />
      <TextField form={form} name="nextValue" label="Next number" type="number" min="1" />
      <TextField form={form} name="padding" label="Digits" type="number" min="1" max="12" />
      <div className="sm:pt-5"><SaveButton loading={form.formState.isSubmitting} /></div>
    </form>
  );
}

function NotificationSettings({ values, onSaved }: { values: Row; onSaved: () => void }) {
  const feedback = useFeedback();
  const form = useZodForm(z.object({ emailQuotationSent: z.boolean(), emailInvoiceSent: z.boolean(), emailPaymentReceived: z.boolean(), emailRenewalReminder: z.boolean() }), values);
  const submit = useSubmit(form);
  return (
    <Card title="Customer emails">
      <form noValidate className="space-y-3" onSubmit={submit(async (v) => {
        await put('/settings/notifications', v);
        feedback.success('Notification settings saved');
        onSaved();
      })}>
        <CheckField form={form} name="emailQuotationSent" label="Quotation sent" />
        <CheckField form={form} name="emailInvoiceSent" label="Invoice sent" />
        <CheckField form={form} name="emailPaymentReceived" label="Payment received" />
        <CheckField form={form} name="emailRenewalReminder" label="Renewal reminder" />
        <SaveButton loading={form.formState.isSubmitting} />
      </form>
    </Card>
  );
}

const TABS = [
  { key: 'company', label: 'Company' },
  { key: 'billing', label: 'Billing' },
  { key: 'numbering', label: 'Invoice numbering' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'account', label: 'Account and password' },
];

export default function SettingsPage() {
  const [search, setSearch] = useSearchParams();
  const tab = search.get('tab') ?? 'company';
  const state = useFetch<Row>(() => get('/settings'), []);
  return (
    <>
      <PageHeader title="Settings" subtitle="Company details, billing defaults and notifications." crumbs={[{ label: 'Dashboard', to: '/app/dashboard' }, { label: 'Settings' }]} />
      <Tabs tabs={TABS} active={tab} onChange={(key) => setSearch({ tab: key })} />
      {tab === 'account' ? (
        <ProfilePage />
      ) : (
        <div className="max-w-4xl">
          <Loaded state={state}>
            {(s) => {
              const saved = () => void state.reload();
              if (tab === 'billing') return <BillingSettings values={s.billing} onSaved={saved} />;
              if (tab === 'notifications') return <NotificationSettings values={s.notifications} onSaved={saved} />;
              if (tab === 'numbering')
                return (
                  <Card title="Reference numbering">
                    <p className="mb-1 text-sm text-ink-2">Numbers are issued in order, and each must stay unique. Set "Next number" above any number already used.</p>
                    {s.sequences.map((seq: Row) => <SequenceRow key={seq.code} sequence={seq} onSaved={saved} />)}
                  </Card>
                );
              return <CompanySettings values={s.company} onSaved={saved} />;
            }}
          </Loaded>
        </div>
      )}
    </>
  );
}
