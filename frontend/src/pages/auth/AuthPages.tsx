import { ArrowRight, ChevronLeft, MailCheck } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { Button, Logo, ThemeToggle } from '../../components/common/ui';
import { CheckField, rules, useZodForm, type Form } from '../../components/forms/fields';
import { homeFor, useAuth } from '../../context/AuthContext';
import { useFeedback } from '../../context/FeedbackContext';
import { errorMessage, fieldErrors, post } from '../../services/api';

const YEAR = new Date().getFullYear();

/** The split screen from the supplied login design. */
function AuthShell({ eyebrow, panelEyebrow, heading, accent, panelText, title, subtitle, children }: {
  eyebrow: string; panelEyebrow: string; heading: ReactNode; accent: string; panelText: string; title: string; subtitle: string; children: ReactNode;
}) {
  useEffect(() => {
    document.title = `${title} | Brightloop`;
  }, [title]);
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="hero-panel hidden flex-col justify-between p-12 text-white lg:flex xl:px-24">
        <Logo light />
        <div>
          <p className="mb-5 text-xs font-bold tracking-[0.2em] text-white/75">{panelEyebrow}</p>
          <h2 className="max-w-xl text-5xl leading-[1.08] font-medium tracking-tight xl:text-[4.25rem]">
            {heading} <span className="font-serif font-normal italic">{accent}</span>
          </h2>
          <p className="mt-6 max-w-lg text-base leading-relaxed text-white/75">{panelText}</p>
        </div>
        <p className="text-xs text-white/70">&copy; {YEAR} Brightloop Technologies</p>
      </aside>
      <main className="flex flex-col bg-surface px-5 py-6 sm:px-12 xl:px-24">
        <div className="flex items-center justify-between">
          <Logo />
          <ThemeToggle />
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-8">
          <p className="mb-2 text-xs font-bold tracking-[0.18em] text-brand-ink">{eyebrow}</p>
          <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{title}</h1>
          <p className="mt-2 mb-7 text-base text-ink-2">{subtitle}</p>
          {children}
        </div>
        <Link to="/" className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink">
          <ChevronLeft size={16} /> Back to website
        </Link>
      </main>
    </div>
  );
}

/** The underlined input style from the supplied design. */
function LineField({ form, name, label, type = 'text', autoComplete, trailing }: { form: Form; name: string; label: string; type?: string; autoComplete?: string; trailing?: ReactNode }) {
  const error = form.formState.errors[name]?.message as string | undefined;
  return (
    <div>
      <label htmlFor={`a-${name}`} className="text-sm font-semibold text-ink-2">
        {label}
      </label>
      <div className="relative">
        <input
          id={`a-${name}`}
          type={type}
          autoComplete={autoComplete}
          aria-invalid={!!error}
          className={`h-11 w-full border-b bg-transparent text-[15px] font-medium text-ink outline-none focus:border-brand ${error ? 'border-bad' : 'border-line-strong'} ${trailing ? 'pr-14' : ''}`}
          {...form.register(name)}
        />
        {trailing && <div className="absolute top-2.5 right-0">{trailing}</div>}
      </div>
      {error && (
        <p role="alert" className="mt-1 text-xs text-bad">
          {error}
        </p>
      )}
    </div>
  );
}

function PasswordLineField({ form, name, label, autoComplete }: { form: Form; name: string; label: string; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <LineField
      form={form}
      name={name}
      label={label}
      type={show ? 'text' : 'password'}
      autoComplete={autoComplete}
      trailing={
        <button type="button" onClick={() => setShow(!show)} className="text-sm font-semibold text-brand-ink hover:underline">
          {show ? 'Hide' : 'Show'}
        </button>
      }
    />
  );
}

const SubmitButton = ({ loading, children }: { loading: boolean; children: ReactNode }) => (
  <Button type="submit" loading={loading} className="h-12 w-full rounded-lg text-[15px] shadow-md">
    {children} {!loading && <ArrowRight size={17} />}
  </Button>
);

const FormError = ({ message }: { message: string | null }) =>
  message ? (
    <p role="alert" className="rounded-md bg-bad-soft px-3 py-2 text-sm text-bad">
      {message}
    </p>
  ) : null;

// ---- Google sign-in, loaded only when a client id is configured.

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    google?: any;
  }
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

function GoogleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.7 1.2 9.2 3.6l6.9-6.9C35.9 2.4 30.4 0 24 0 14.6 0 6.5 5.4 2.6 13.2l8 6.2C12.5 13.7 17.8 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.2 5.5-4.7 7.2l7.7 6c4.5-4.2 6.8-10.3 6.8-17.7z" />
      <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-8-6.2C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.8l8-6.2z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.1 1.4-4.9 2.3-8.2 2.3-6.2 0-11.5-4.2-13.4-9.9l-8 6.2C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

function GoogleButton({ remember, onError }: { remember: () => boolean; onError: (message: string) => void }) {
  const { loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const target = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    const render = () => {
      window.google?.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async ({ credential }: { credential: string }) => {
          try {
            navigate(homeFor(await loginWithGoogle(credential, remember())));
          } catch (err) {
            onError(errorMessage(err));
          }
        },
      });
      if (target.current) window.google?.accounts.id.renderButton(target.current, { theme: 'outline', size: 'large', width: target.current.clientWidth, text: 'continue_with' });
    };
    if (window.google) return render();
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = render;
    document.head.appendChild(script);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (GOOGLE_CLIENT_ID) return <div ref={target} className="mt-3 flex min-h-11 justify-center" />;
  return (
    <button
      type="button"
      onClick={() => onError('Google sign-in is not set up for this installation yet. Please use your email and password.')}
      className="mt-3 flex h-12 w-full items-center justify-center gap-2.5 rounded-lg border border-line-strong bg-surface text-sm font-semibold text-ink hover:bg-surface-2"
    >
      <GoogleMark /> Continue with Google
    </button>
  );
}

// ---- pages

const loginSchema = z.object({ email: rules.email, password: z.string().min(1, 'Password is required'), remember: z.boolean() });

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const form = useZodForm(loginSchema, { email: '', password: '', remember: true });

  return (
    <AuthShell
      eyebrow="SECURE WORKSPACE"
      panelEyebrow="WELCOME BACK"
      heading={<>Your revenue engine is ready to</>}
      accent="loop."
      panelText="Pick up where you left off. Every subscription, invoice and payment is right where it should be."
      title="Log in to Brightloop"
      subtitle="Enter your details to access your workspace."
    >
      <form
        noValidate
        className="space-y-5"
        onSubmit={form.handleSubmit(async (values) => {
          setError(null);
          try {
            const user = await login(values.email, values.password, values.remember);
            const from = (location.state as { from?: string } | null)?.from;
            const allowed = from && from.startsWith(user.role === 'customer' ? '/portal' : '/app');
            navigate(allowed ? from : homeFor(user), { replace: true });
          } catch (err) {
            setError(errorMessage(err));
          }
        })}
      >
        <LineField form={form} name="email" label="Email address" type="email" autoComplete="email" />
        <PasswordLineField form={form} name="password" label="Password" autoComplete="current-password" />
        <div className="flex items-center justify-between gap-3">
          <CheckField form={form} name="remember" label="Keep me logged in" />
          <Link to="/forgot-password" className="text-sm font-semibold whitespace-nowrap text-brand-ink hover:underline">
            Forgot password?
          </Link>
        </div>
        <FormError message={error} />
        <SubmitButton loading={form.formState.isSubmitting}>Log in</SubmitButton>
      </form>
      <GoogleButton remember={() => form.getValues('remember')} onError={setError} />
      <p className="mt-6 text-center text-sm text-ink-2">
        New to Brightloop?{' '}
        <Link to="/register" className="font-semibold text-brand-ink hover:underline">
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}

const registerSchema = z
  .object({ customerName: rules.required, companyName: z.string().optional(), email: rules.email, phone: rules.phone, password: rules.password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: 'Passwords do not match', path: ['confirm'] });

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const form = useZodForm(registerSchema, { customerName: '', companyName: '', email: '', phone: '', password: '', confirm: '' });

  return (
    <AuthShell
      eyebrow="CUSTOMER ACCOUNT"
      panelEyebrow="GET STARTED"
      heading={<>Every recurring rupee, in one</>}
      accent="place."
      panelText="Browse plans, request quotations and keep track of your subscriptions, invoices and payments."
      title="Create your account"
      subtitle="It takes a minute. No credit card required."
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={form.handleSubmit(async ({ confirm: _confirm, ...values }) => {
          setError(null);
          try {
            navigate(homeFor(await register(values)), { replace: true });
          } catch (err) {
            for (const { path, message } of fieldErrors(err)) form.setError(path, { message });
            setError(errorMessage(err));
          }
        })}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <LineField form={form} name="customerName" label="Your name" autoComplete="name" />
          <LineField form={form} name="companyName" label="Company (optional)" autoComplete="organization" />
          <LineField form={form} name="email" label="Email address" type="email" autoComplete="email" />
          <LineField form={form} name="phone" label="Phone number" type="tel" autoComplete="tel" />
        </div>
        <PasswordLineField form={form} name="password" label="Password" autoComplete="new-password" />
        <p className="text-xs text-ink-3">More than eight characters, with uppercase, lowercase and a special character.</p>
        <PasswordLineField form={form} name="confirm" label="Confirm password" autoComplete="new-password" />
        <FormError message={error} />
        <SubmitButton loading={form.formState.isSubmitting}>Create account</SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm text-ink-2">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-brand-ink hover:underline">
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useZodForm(z.object({ email: rules.email }), { email: '' });
  return (
    <AuthShell
      eyebrow="ACCOUNT RECOVERY"
      panelEyebrow="NO PROBLEM"
      heading={<>We'll get you back in the</>}
      accent="loop."
      panelText="Reset links expire after one hour and can only be used once."
      title="Reset your password"
      subtitle="Enter your email and we will send you a secure link."
    >
      {sent ? (
        <div className="rounded-lg border border-line p-5 text-center">
          <MailCheck size={28} className="mx-auto mb-2 text-brand-ink" />
          <p className="text-sm font-semibold text-ink">Check your email</p>
          <p className="mt-1 text-sm text-ink-2">If that address has an account, a reset link is on its way.</p>
        </div>
      ) : (
        <form
          noValidate
          className="space-y-5"
          onSubmit={form.handleSubmit(async (values) => {
            setError(null);
            try {
              await post('/auth/forgot-password', values);
              setSent(true);
            } catch (err) {
              setError(errorMessage(err));
            }
          })}
        >
          <LineField form={form} name="email" label="Email address" type="email" autoComplete="email" />
          <FormError message={error} />
          <SubmitButton loading={form.formState.isSubmitting}>Send reset link</SubmitButton>
        </form>
      )}
      <p className="mt-6 text-center text-sm">
        <Link to="/login" className="font-semibold text-brand-ink hover:underline">
          Return to login
        </Link>
      </p>
    </AuthShell>
  );
}

const resetSchema = z.object({ password: rules.password, confirm: z.string() }).refine((v) => v.password === v.confirm, { message: 'Passwords do not match', path: ['confirm'] });

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const feedback = useFeedback();
  const [error, setError] = useState<string | null>(token ? null : 'This reset link is incomplete. Please request a new one.');
  const form = useZodForm(resetSchema, { password: '', confirm: '' });
  return (
    <AuthShell
      eyebrow="ACCOUNT RECOVERY"
      panelEyebrow="ALMOST THERE"
      heading={<>A fresh start for your</>}
      accent="account."
      panelText="Setting a new password signs you out on every device."
      title="Choose a new password"
      subtitle="More than eight characters, with uppercase, lowercase and a special character."
    >
      <form
        noValidate
        className="space-y-5"
        onSubmit={form.handleSubmit(async ({ password }) => {
          setError(null);
          try {
            await post('/auth/reset-password', { token, password });
            feedback.success('Your password has been reset. You can now log in.');
            navigate('/login', { replace: true });
          } catch (err) {
            setError(errorMessage(err));
          }
        })}
      >
        <PasswordLineField form={form} name="password" label="New password" autoComplete="new-password" />
        <PasswordLineField form={form} name="confirm" label="Confirm new password" autoComplete="new-password" />
        <FormError message={error} />
        <SubmitButton loading={form.formState.isSubmitting}>Set password</SubmitButton>
      </form>
    </AuthShell>
  );
}
