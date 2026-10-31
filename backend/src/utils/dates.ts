export type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

const pad = (n: number) => String(n).padStart(2, '0');
const fromParts = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

export function today(): string {
  const now = new Date();
  return fromParts(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function diffDays(later: string, earlier: string): number {
  return Math.round((Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / 86_400_000);
}

function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month = index % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return fromParts(year, month + 1, Math.min(d, lastDay));
}

/** Advances from an anchor date. Month-end anchors clamp per month, so Jan 31 gives Feb 28 and then Mar 31. */
export function addCycles(anchor: string, frequency: Frequency, cycles: number): string {
  switch (frequency) {
    case 'daily':
      return addDays(anchor, cycles);
    case 'weekly':
      return addDays(anchor, cycles * 7);
    case 'monthly':
      return addMonths(anchor, cycles);
    case 'yearly':
      return addMonths(anchor, cycles * 12);
  }
}
