const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });
const inrShort = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

export const money = (value: string | number | null | undefined) => inr.format(Number(value ?? 0));

/** Indian short form for chart axes and tight spaces: 5.42L, 1.2Cr. */
export function moneyShort(value: string | number | null | undefined) {
  const n = Number(value ?? 0);
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(abs >= 1e8 ? 0 : 2)}Cr`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(2)}L`;
  if (abs >= 1e3) return `₹${(n / 1e3).toFixed(1)}K`;
  return inrShort.format(n);
}

export function date(value: string | null | undefined) {
  if (!value) return '-';
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const dateTime = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';

export const today = () => new Date().toLocaleDateString('en-CA');

export const addDays = (from: string, days: number) => {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export const titleCase = (value: string | null | undefined) =>
  (value ?? '').replace(/[_.]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const FREQUENCY_LABEL: Record<string, string> = { daily: 'per day', weekly: 'per week', monthly: 'per month', yearly: 'per year' };
export const METHOD_LABEL: Record<string, string> = { bank_transfer: 'Bank transfer', cash: 'Cash', card: 'Card', other: 'Other' };
