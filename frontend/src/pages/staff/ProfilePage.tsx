import { z } from 'zod';
import { Button, Card, DefinitionList, PageHeader } from '../../components/common/ui';
import { FormGrid, PasswordField, rules, TextAreaField, TextField, useSubmit, useZodForm } from '../../components/forms/fields';
import { useAuth } from '../../context/AuthContext';
import { useFeedback } from '../../context/FeedbackContext';
import { post, put, tokenStore } from '../../services/api';
import { titleCase } from '../../utils/format';

const profileSchema = z.object({
  fullName: rules.required,
  phone: z.union([z.literal(''), rules.phone]).optional(),
  companyName: z.string().optional(),
  billingAddress: z.string().optional(),
  taxId: z.string().optional(),
});

const passwordSchema = z
  .object({ currentPassword: z.string().min(1, 'Enter your current password'), newPassword: rules.password, confirm: z.string() })
  .refine((v) => v.newPassword === v.confirm, { message: 'Passwords do not match', path: ['confirm'] });

/** My Profile for staff and Account Settings for customers. Role and permissions are shown, never editable here. */
export default function ProfilePage() {
  const { user, refresh } = useAuth();
  const feedback = useFeedback();
  const isCustomer = user?.role === 'customer';
  const customer = user?.customer;

  const profile = useZodForm(profileSchema, {
    fullName: user?.fullName ?? '',
    phone: user?.phone ?? '',
    companyName: customer?.companyName ?? '',
    billingAddress: customer?.billingAddress ?? '',
    taxId: customer?.taxId ?? '',
  });
  const password = useZodForm(passwordSchema, { currentPassword: '', newPassword: '', confirm: '' });
  const submitProfile = useSubmit(profile);
  const submitPassword = useSubmit(password);
  if (!user) return null;

  return (
    <>
      <PageHeader title={isCustomer ? 'Account Settings' : 'My Profile'} subtitle="Your details and password." />
      <div className="grid max-w-4xl gap-5">
        <Card title="Account">
          <DefinitionList
            items={[
              ['Email', user.email],
              ['Role', user.role === 'staff' ? `${titleCase(user.profile)} Staff` : titleCase(user.role)],
            ]}
          />
        </Card>
        <Card title="Details">
          <form
            noValidate
            onSubmit={submitProfile(async (values) => {
              await put('/auth/me', values);
              await refresh();
              feedback.success('Your details have been saved');
            })}
            className="space-y-4"
          >
            <FormGrid>
              <TextField form={profile} name="fullName" label="Full name" required />
              <TextField form={profile} name="phone" label="Phone number" type="tel" />
              {isCustomer && (
                <>
                  <TextField form={profile} name="companyName" label="Company name" />
                  <TextField form={profile} name="taxId" label="Tax ID" />
                </>
              )}
            </FormGrid>
            {isCustomer && <TextAreaField form={profile} name="billingAddress" label="Billing address" />}
            <Button type="submit" loading={profile.formState.isSubmitting}>
              Save details
            </Button>
          </form>
        </Card>
        <Card title="Change password">
          <form
            noValidate
            onSubmit={submitPassword(async ({ currentPassword, newPassword }) => {
              const { token } = await post<{ token: string }>('/auth/change-password', { currentPassword, newPassword });
              tokenStore.set(token);
              password.reset();
              feedback.success('Your password has been changed. Other devices have been signed out.');
            })}
            className="space-y-4"
          >
            <FormGrid>
              <PasswordField form={password} name="currentPassword" label="Current password" autoComplete="current-password" required />
              <div className="hidden sm:block" />
              <PasswordField form={password} name="newPassword" label="New password" autoComplete="new-password" hint="More than eight characters, with uppercase, lowercase and a special character." required />
              <PasswordField form={password} name="confirm" label="Confirm new password" autoComplete="new-password" required />
            </FormGrid>
            <Button type="submit" loading={password.formState.isSubmitting}>
              Change password
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}
