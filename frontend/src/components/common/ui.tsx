import { AlertTriangle, ChevronRight, Inbox, Loader2, Moon, Sparkles, Sun, X, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { titleCase } from '../../utils/format';

// ---- buttons

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-strong border-transparent',
  secondary: 'bg-surface text-ink border-line-strong hover:bg-surface-2',
  danger: 'bg-bad text-white border-transparent hover:opacity-90',
  ghost: 'bg-transparent text-ink-2 border-transparent hover:bg-surface-2 hover:text-ink',
};
const BUTTON_BASE = 'inline-flex items-center justify-center gap-1.5 rounded-md border font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap';

export function buttonClass(variant: Variant = 'primary', small = false) {
  return `${BUTTON_BASE} ${VARIANTS[variant]} ${small ? 'h-8 px-2.5 text-xs' : 'h-9 px-3.5 text-sm'}`;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  small?: boolean;
  loading?: boolean;
  icon?: LucideIcon;
}

export function Button({ variant = 'primary', small, loading, icon: Icon, children, className = '', disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} disabled={disabled || loading} className={`${buttonClass(variant, small)} ${className}`} {...rest}>
      {loading ? <Loader2 size={small ? 14 : 16} className="animate-spin" /> : Icon ? <Icon size={small ? 14 : 16} /> : null}
      {children}
    </button>
  );
}

/** Runs an async action with a spinner on the button itself. Errors are reported by the caller's action wrapper. */
export function ActionButton({ onAction, ...props }: Omit<ButtonProps, 'onClick'> & { onAction: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      {...props}
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await onAction();
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}

// ---- brand

export function Logo({ light = false, to = '/' }: { light?: boolean; to?: string }) {
  return (
    <Link to={to} className="inline-flex items-center gap-2.5">
      <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${light ? 'bg-white text-[#4338ee]' : 'bg-brand text-white'}`}>
        <Sparkles size={18} />
      </span>
      <span className={`text-lg font-bold tracking-tight ${light ? 'text-white' : 'text-ink'}`}>Brightloop</span>
    </Link>
  );
}

export function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'));
  return {
    theme,
    toggle: () => {
      const next = theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem('brightloop.theme', next);
      } catch {
        /* The choice just won't persist. */
      }
      setTheme(next);
    },
  };
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button onClick={toggle} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-2 hover:bg-surface-2 hover:text-ink">
      {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
    </button>
  );
}

// ---- layout pieces

export function Card({ title, action, children, className = '', flush = false }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; flush?: boolean }) {
  return (
    // min-w-0 lets a wide table scroll inside its card instead of stretching the page grid.
    <section className={`min-w-0 rounded-lg border border-line bg-surface ${className}`}>
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="text-sm font-bold text-ink">{title}</h2>
          {action}
        </header>
      )}
      <div className={flush ? '' : 'p-4'}>{children}</div>
    </section>
  );
}

export interface Crumb {
  label: string;
  to?: string;
}

export function PageHeader({ title, subtitle, crumbs, actions }: { title: string; subtitle?: ReactNode; crumbs?: Crumb[]; actions?: ReactNode }) {
  useEffect(() => {
    document.title = `${title} | Brightloop`;
  }, [title]);
  return (
    <div className="mb-5">
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="no-print mb-1.5 flex flex-wrap items-center gap-1 text-xs text-ink-3">
          {crumbs.map((crumb, i) => (
            <span key={crumb.label} className="inline-flex items-center gap-1">
              {i > 0 && <ChevronRight size={12} />}
              {crumb.to ? (
                <Link to={crumb.to} className="hover:text-brand-ink">
                  {crumb.label}
                </Link>
              ) : (
                <span>{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-ink-2">{subtitle}</p>}
        </div>
        {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Tabs({ tabs, active, onChange }: { tabs: { key: string; label: string; count?: number }[]; active: string; onChange: (key: string) => void }) {
  return (
    <div role="tablist" className="no-print mb-4 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          role="tab"
          aria-selected={active === tab.key}
          onClick={() => onChange(tab.key)}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold whitespace-nowrap ${active === tab.key ? 'border-brand text-brand-ink' : 'border-transparent text-ink-2 hover:text-ink'}`}
        >
          {tab.label}
          {tab.count !== undefined && <span className="ml-1.5 rounded bg-surface-2 px-1.5 py-0.5 text-xs text-ink-2">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ---- states

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-ink-3">
      <Loader2 size={18} className="animate-spin" />
      {label}
    </div>
  );
}

export function EmptyState({ title = 'Nothing here yet', message, action, icon: Icon = Inbox }: { title?: string; message?: string; action?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center">
      <Icon size={26} className="mb-2 text-ink-3" />
      <p className="text-sm font-semibold text-ink">{title}</p>
      {message && <p className="mt-1 max-w-sm text-sm text-ink-2">{message}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center px-4 py-12 text-center">
      <AlertTriangle size={26} className="mb-2 text-bad" />
      <p className="text-sm font-semibold text-ink">This could not be loaded</p>
      <p className="mt-1 max-w-sm text-sm text-ink-2">{message}</p>
      {onRetry && (
        <Button variant="secondary" small className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/** Wraps a fetch result in its loading and error states. */
export function Loaded<T>({ state, children }: { state: { data: T | null; loading: boolean; error: string | null; reload: () => void | Promise<void> }; children: (data: T) => ReactNode }) {
  if (state.error) return <ErrorState message={state.error} onRetry={() => void state.reload()} />;
  if (state.data === null) return <Spinner />;
  return <>{children(state.data)}</>;
}

// ---- data display

const TONES = {
  neutral: 'bg-surface-2 text-ink-2',
  brand: 'bg-brand-soft text-brand-ink',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
};

const STATUS_TONE: Record<string, keyof typeof TONES> = {
  active: 'ok', paid: 'ok', accepted: 'ok', completed: 'ok', approved: 'ok',
  inactive: 'neutral', draft: 'neutral', closed: 'neutral', cancelled: 'neutral', voided: 'neutral', expired: 'neutral', declined: 'neutral',
  sent: 'brand', confirmed: 'brand', quotation: 'brand', quoted: 'brand',
  paused: 'warn', partial: 'warn', pending: 'warn', unpaid: 'warn',
  overdue: 'bad', rejected: 'bad',
};

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: keyof typeof TONES }) {
  return <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${TONES[tone]}`}>{children}</span>;
}

export const StatusBadge = ({ status }: { status: string }) => <Badge tone={STATUS_TONE[status] ?? 'neutral'}>{titleCase(status)}</Badge>;

export function StatCard({ label, value, hint, icon: Icon, tone, to }: { label: string; value: ReactNode; hint?: string; icon?: LucideIcon; tone?: 'bad' | 'warn' | 'ok'; to?: string }) {
  const toneClass = tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : tone === 'ok' ? 'text-ok' : 'text-ink-3';
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-ink-2">{label}</span>
        {Icon && <Icon size={16} className={toneClass} aria-hidden />}
      </div>
      <div className="tnum mt-1.5 text-xl font-bold tracking-tight text-ink">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-ink-3">{hint}</div>}
    </>
  );
  const shared = 'block rounded-lg border border-line bg-surface p-4';
  return to ? (
    <Link to={to} className={`${shared} transition-colors hover:border-brand`}>
      {body}
    </Link>
  ) : (
    <div className={shared}>{body}</div>
  );
}

export const StatGrid = ({ children }: { children: ReactNode }) => <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>;

export function DefinitionList({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs font-semibold text-ink-3">{label}</dt>
          <dd className="mt-0.5 text-sm break-words text-ink">{value ?? '-'}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---- modal

export function Modal({ title, onClose, children, footer, size = 'md' }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' }) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previous?.focus?.();
    };
  }, []);

  const width = size === 'sm' ? 'max-w-md' : size === 'lg' ? 'max-w-3xl' : 'max-w-xl';
  return (
    <div className="no-print fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={`flex max-h-[92vh] w-full ${width} flex-col rounded-t-xl border border-line bg-surface shadow-xl outline-none sm:rounded-xl`}>
        <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-base font-bold text-ink">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-ink-3 hover:bg-surface-2 hover:text-ink">
            <X size={18} />
          </button>
        </header>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}
