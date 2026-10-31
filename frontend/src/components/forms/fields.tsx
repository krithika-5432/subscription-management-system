import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Search, X } from 'lucide-react';
import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { useForm, type DefaultValues, type FieldValues, type UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import { useFeedback } from '../../context/FeedbackContext';
import { useFetch } from '../../hooks/useFetch';
import { errorMessage, fieldErrors, get, getPage } from '../../services/api';
import type { Row } from '../../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Form = UseFormReturn<any, any, any>;

export function useZodForm(schema: z.ZodType, defaultValues?: DefaultValues<FieldValues>): Form {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return useForm<any, any, any>({ resolver: zodResolver(schema as any) as any, defaultValues, mode: 'onTouched' });
}

/** Wraps a submit handler: shows failures as a toast and maps API validation errors onto their fields. */
export function useSubmit(form: Form) {
  const feedback = useFeedback();
  return (save: (values: Row) => Promise<unknown>) =>
    form.handleSubmit(async (values: Row) => {
      try {
        await save(values);
      } catch (err) {
        for (const { path, message } of fieldErrors(err)) form.setError(path, { message });
        feedback.error(errorMessage(err));
      }
    });
}

const lookup = (errors: Row, name: string) => name.split('.').reduce<Row | undefined>((node, key) => node?.[key], errors);

export const inputClass =
  'h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-3 disabled:bg-surface-2 disabled:text-ink-2 aria-[invalid=true]:border-bad';

export function FieldShell({ label, error, hint, htmlFor, children, required }: { label?: string; error?: string; hint?: string; htmlFor?: string; children: ReactNode; required?: boolean }) {
  return (
    <div className="min-w-0">
      {label && (
        <label htmlFor={htmlFor} className="mb-1 block text-xs font-semibold text-ink-2">
          {label}
          {required && <span className="text-bad"> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <p role="alert" className="mt-1 text-xs text-bad">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1 text-xs text-ink-3">{hint}</p>
      )}
    </div>
  );
}

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'form' | 'name'> {
  form: Form;
  name: string;
  label?: string;
  hint?: string;
}

export function TextField({ form, name, label, hint, required, ...rest }: FieldProps) {
  const id = `f-${name}`;
  const error = lookup(form.formState.errors, name)?.message as string | undefined;
  return (
    <FieldShell label={label} error={error} hint={hint} htmlFor={id} required={required}>
      <input id={id} aria-invalid={!!error} className={inputClass} {...rest} {...form.register(name)} />
    </FieldShell>
  );
}

export function PasswordField({ form, name, label, hint, required, ...rest }: FieldProps) {
  const [show, setShow] = useState(false);
  const id = `f-${name}`;
  const error = lookup(form.formState.errors, name)?.message as string | undefined;
  return (
    <FieldShell label={label} error={error} hint={hint} htmlFor={id} required={required}>
      <div className="relative">
        <input id={id} type={show ? 'text' : 'password'} aria-invalid={!!error} className={`${inputClass} pr-10`} {...rest} {...form.register(name)} />
        <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute top-2.5 right-2.5 text-ink-3 hover:text-ink">
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </FieldShell>
  );
}

export function TextAreaField({ form, name, label, hint, rows = 3, required }: { form: Form; name: string; label?: string; hint?: string; rows?: number; required?: boolean }) {
  const id = `f-${name}`;
  const error = lookup(form.formState.errors, name)?.message as string | undefined;
  return (
    <FieldShell label={label} error={error} hint={hint} htmlFor={id} required={required}>
      <textarea id={id} rows={rows} aria-invalid={!!error} className={`${inputClass} h-auto py-2`} {...form.register(name)} />
    </FieldShell>
  );
}

export function SelectField({ form, name, label, hint, options, placeholder, required, disabled }: { form: Form; name: string; label?: string; hint?: string; options: [string, string][]; placeholder?: string; required?: boolean; disabled?: boolean }) {
  const id = `f-${name}`;
  const error = lookup(form.formState.errors, name)?.message as string | undefined;
  const optionCount = options.length;
  // Options often arrive after the form's values. Re-apply the value so the select can display it.
  useEffect(() => {
    if (optionCount) form.setValue(name, form.getValues(name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionCount]);
  return (
    <FieldShell label={label} error={error} hint={hint} htmlFor={id} required={required}>
      <select id={id} aria-invalid={!!error} disabled={disabled} className={inputClass} {...form.register(name)}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function CheckField({ form, name, label, hint }: { form: Form; name: string; label: string; hint?: string }) {
  return (
    <label className="flex items-start gap-2.5 text-sm text-ink">
      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--brand)]" {...form.register(name)} />
      <span>
        {label}
        {hint && <span className="block text-xs text-ink-3">{hint}</span>}
      </span>
    </label>
  );
}

export const FormGrid = ({ children }: { children: ReactNode }) => <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>;

// Client-side rules mirror the API. The API validates again and has the final say.
export const rules = {
  required: z.string().trim().min(1, 'This field is required'),
  email: z.string().trim().min(1, 'Email is required').pipe(z.email('Enter a valid email address')),
  phone: z.string().trim().regex(/^[+0-9 ()-]{7,20}$/, 'Enter a valid phone number'),
  password: z
    .string()
    .min(9, 'Use more than eight characters')
    .regex(/[A-Z]/, 'Add an uppercase letter')
    .regex(/[a-z]/, 'Add a lowercase letter')
    .regex(/[^A-Za-z0-9]/, 'Add a special character'),
  money: z.string().trim().min(1, 'Enter an amount').refine((v) => !Number.isNaN(Number(v)) && Number(v) >= 0, 'Enter an amount of zero or more'),
  positive: z.string().trim().refine((v) => Number(v) > 0, 'Enter a value greater than zero'),
  count: z.coerce.string().trim().refine((v) => Number.isInteger(Number(v)) && Number(v) >= 1, 'Enter a whole number of 1 or more'),
  date: z.string().min(1, 'Choose a date'),
};

// ---- customer lookup. Searches on the server because there can be thousands of customers.

export function CustomerPicker({ value, onChange, label, error, required, compact }: { value: string; onChange: (id: string) => void; label?: string; error?: string; required?: boolean; compact?: boolean }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const selected = useFetch<Row | null>(() => (value ? get(`/customers/${value}`) : Promise.resolve(null)), [value]);
  const results = useFetch(() => (open ? getPage('/customers', { search: text, pageSize: 8, status: 'active' }) : Promise.resolve({ rows: [] as Row[] })), [open, text]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const heightClass = compact ? 'h-9' : 'h-10';
  return (
    <FieldShell label={label} error={error} required={required}>
      <div ref={box} className={`relative ${compact ? 'w-56' : ''}`}>
        {value && selected.data ? (
          <div className={`flex ${heightClass} items-center justify-between gap-2 rounded-md border border-line-strong bg-surface px-3 text-sm text-ink`}>
            <span className="truncate">{selected.data.customerName}</span>
            <button type="button" aria-label="Clear customer" onClick={() => onChange('')} className="text-ink-3 hover:text-ink">
              <X size={15} />
            </button>
          </div>
        ) : (
          <>
            <Search size={15} className={`absolute left-2.5 text-ink-3 ${compact ? 'top-2.5' : 'top-3'}`} aria-hidden />
            <input
              value={text}
              aria-label={label ?? 'Customer'}
              aria-invalid={!!error}
              onFocus={() => setOpen(true)}
              onChange={(e) => {
                setText(e.target.value);
                setOpen(true);
              }}
              placeholder="Search customers"
              className={`${inputClass} ${heightClass} pl-8`}
            />
          </>
        )}
        {open && !value && (
          <ul className="absolute z-30 mt-1 max-h-64 w-full min-w-56 overflow-y-auto rounded-md border border-line bg-surface shadow-lg">
            {results.data?.rows.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(c.id);
                    setOpen(false);
                    setText('');
                  }}
                  className="block w-full px-3 py-2 text-left hover:bg-surface-2"
                >
                  <span className="block truncate text-sm text-ink">{c.customerName}</span>
                  <span className="block truncate text-xs text-ink-3">{c.companyName || c.email}</span>
                </button>
              </li>
            ))}
            {results.data && !results.data.rows.length && !results.loading && <li className="px-3 py-2 text-sm text-ink-3">No customers found</li>}
          </ul>
        )}
      </div>
    </FieldShell>
  );
}
