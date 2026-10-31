import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Row } from '../../types';
import { money, moneyShort, titleCase } from '../../utils/format';
import { EmptyState } from '../common/ui';

const AXIS = { fontSize: 11, fill: 'var(--ink-3)' };

function MoneyTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-ink">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="flex items-center justify-between gap-4 text-ink-2">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: entry.color }} />
            {entry.name}
          </span>
          <span className="tnum font-semibold text-ink">{money(entry.value)}</span>
        </p>
      ))}
    </div>
  );
}

const hasValues = (rows: Row[], keys: string[]) => rows.some((row) => keys.some((key) => Number(row[key]) !== 0));
const toNumbers = (rows: Row[], keys: string[]) => rows.map((row) => ({ ...row, ...Object.fromEntries(keys.map((k) => [k, Number(row[k])])) }));

/** One measure over time. The card title names it, so there is no legend. */
export function RevenueArea({ data, dataKey = 'received', name = 'Received', height = 260 }: { data: Row[]; dataKey?: string; name?: string; height?: number }) {
  if (!hasValues(data, [dataKey])) return <EmptyState title="No revenue in this period" />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={toNumbers(data, [dataKey])} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`fill-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.22} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--line)" />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--line)' }} minTickGap={16} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={58} tickFormatter={moneyShort} />
        <Tooltip content={<MoneyTooltip />} cursor={{ stroke: 'var(--line-strong)' }} />
        <Area isAnimationActive={false} type="monotone" dataKey={dataKey} name={name} stroke="var(--chart-1)" strokeWidth={2} fill={`url(#fill-${dataKey})`} activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Invoiced against received on one shared rupee axis, with a legend so identity never relies on color alone. */
export function InvoicedVsReceived({ data, height = 280 }: { data: Row[]; height?: number }) {
  if (!hasValues(data, ['invoiced', 'received'])) return <EmptyState title="No activity in this period" />;
  const legend = [
    { label: 'Invoiced', color: 'var(--chart-2)', dash: true },
    { label: 'Received', color: 'var(--chart-1)', dash: false },
  ];
  return (
    <>
      <ul className="mb-2 flex gap-4 text-xs text-ink-2">
        {legend.map((item) => (
          <li key={item.label} className="inline-flex items-center gap-1.5">
            <svg width="18" height="4" aria-hidden>
              <line x1="0" y1="2" x2="18" y2="2" stroke={item.color} strokeWidth="2" strokeDasharray={item.dash ? '4 3' : undefined} />
            </svg>
            {item.label}
          </li>
        ))}
      </ul>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={toNumbers(data, ['invoiced', 'received'])} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--line)' }} minTickGap={16} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={58} tickFormatter={moneyShort} />
          <Tooltip content={<MoneyTooltip />} cursor={{ stroke: 'var(--line-strong)' }} />
          <Line isAnimationActive={false} type="monotone" dataKey="invoiced" name="Invoiced" stroke="var(--chart-2)" strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }} />
          <Line isAnimationActive={false} type="monotone" dataKey="received" name="Received" stroke="var(--chart-1)" strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </>
  );
}

/** Distribution across statuses as labelled single-hue bars: exact counts, no legend to decode. */
export function StatusBars({ data, order }: { data: { status: string; count: number }[]; order: string[] }) {
  const rows = order.map((status) => ({ status, count: data.find((d) => d.status === status)?.count ?? 0 })).filter((r) => r.count > 0);
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  if (!total) return <EmptyState title="No records yet" />;
  const max = Math.max(...rows.map((r) => r.count));
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.status} title={`${titleCase(row.status)}: ${row.count} (${Math.round((row.count / total) * 100)}%)`}>
          <div className="mb-1 flex justify-between text-xs">
            <span className="font-semibold text-ink-2">{titleCase(row.status)}</span>
            <span className="tnum text-ink">
              {row.count.toLocaleString('en-IN')} <span className="text-ink-3">({Math.round((row.count / total) * 100)}%)</span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-surface-2">
            <div className="h-2 rounded-full bg-[var(--chart-1)]" style={{ width: `${Math.max((row.count / max) * 100, 1.5)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
