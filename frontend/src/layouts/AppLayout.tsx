import {
  AlertOctagon, BarChart3, Bell, ClipboardList, CreditCard, FileText, History, LayoutDashboard, LogOut, Menu, Package, PackagePlus, Percent, Receipt, RefreshCw,
  Repeat, ScrollText, Search, Settings, Tag, TrendingUp, UserCircle, Users, UsersRound, Wallet, X, type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Logo, ThemeToggle } from '../components/common/ui';
import { useAuth } from '../context/AuthContext';
import { useFetch } from '../hooks/useFetch';
import { get, post } from '../services/api';
import type { Row, User } from '../types';
import { dateTime, titleCase } from '../utils/format';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  show: (user: User, can: (...p: string[]) => boolean) => boolean;
}

const isAdmin = (u: User) => u.role === 'admin';
/** Each profile's sidebar follows its job. A permission alone does not put a page in the menu, but it does open the route. */
const adminOr = (...profiles: string[]) => (u: User) => isAdmin(u) || profiles.includes(u.profile ?? '');

const INTERNAL_NAV: NavItem[] = [
  { to: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard, show: () => true },
  { to: '/app/customers', label: 'Customers', icon: Users, show: adminOr('sales', 'operations') },
  { to: '/app/products', label: 'Products', icon: Package, show: adminOr('sales') },
  { to: '/app/plans', label: 'Subscription Plans', icon: Tag, show: adminOr('sales') },
  { to: '/app/quotations', label: 'Quotations', icon: FileText, show: adminOr('sales') },
  { to: '/app/templates', label: 'Quotation Templates', icon: ScrollText, show: adminOr('sales') },
  { to: '/app/subscriptions', label: 'Subscriptions', icon: Repeat, show: adminOr('operations') },
  { to: '/app/renewals', label: 'Renewals', icon: RefreshCw, show: adminOr('operations') },
  { to: '/app/invoices', label: 'Invoices', icon: Receipt, show: adminOr('operations', 'finance') },
  { to: '/app/payments', label: 'Payments', icon: CreditCard, show: adminOr('operations', 'finance') },
  { to: '/app/discounts', label: 'Discounts', icon: Percent, show: isAdmin },
  { to: '/app/taxes', label: 'Taxes', icon: Wallet, show: isAdmin },
  { to: '/app/reports', label: 'Reports', icon: BarChart3, show: isAdmin },
  { to: '/app/reports/revenue', label: 'Revenue Reports', icon: TrendingUp, show: (u) => u.profile === 'finance' },
  { to: '/app/reports/outstanding', label: 'Outstanding Reports', icon: Wallet, show: (u) => u.profile === 'finance' },
  { to: '/app/reports/overdue', label: 'Overdue Invoices', icon: AlertOctagon, show: (u) => u.profile === 'finance' },
  { to: '/app/reports/subscriptions', label: 'Subscription Summary', icon: ClipboardList, show: (u) => u.profile === 'finance' },
  { to: '/app/staff', label: 'Users and Staff', icon: UsersRound, show: isAdmin },
  { to: '/app/settings', label: 'Settings', icon: Settings, show: isAdmin },
  { to: '/app/audit-log', label: 'Audit Log', icon: History, show: isAdmin },
  { to: '/app/profile', label: 'My Profile', icon: UserCircle, show: (u) => u.role === 'staff' },
];

const CUSTOMER_NAV: NavItem[] = [
  { to: '/portal/dashboard', label: 'Dashboard', icon: LayoutDashboard, show: () => true },
  { to: '/portal/plans', label: 'Browse Plans', icon: Tag, show: () => true },
  { to: '/portal/quotations', label: 'My Quotations', icon: FileText, show: () => true },
  { to: '/portal/subscriptions', label: 'My Subscriptions', icon: Repeat, show: () => true },
  { to: '/portal/addons', label: 'Add-ons', icon: PackagePlus, show: () => true },
  { to: '/portal/invoices', label: 'My Invoices', icon: Receipt, show: () => true },
  { to: '/portal/payments', label: 'Payments', icon: CreditCard, show: () => true },
  { to: '/portal/account', label: 'Account Settings', icon: Settings, show: () => true },
];

function roleLabel(user: User) {
  if (user.role === 'admin') return 'Admin';
  if (user.role === 'customer') return 'Customer';
  return `${titleCase(user.profile)} Staff`;
}

function useOutsideClose(close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [close]);
  return ref;
}

const SEARCH_GROUPS: [string, string, string][] = [
  ['customers', 'Customers', '/app/customers'],
  ['quotations', 'Quotations', '/app/quotations'],
  ['subscriptions', 'Subscriptions', '/app/subscriptions'],
  ['invoices', 'Invoices', '/app/invoices'],
  ['payments', 'Payments', '/app/payments'],
];

function GlobalSearch() {
  const [text, setText] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const ref = useOutsideClose(() => setOpen(false));

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(text.trim()), 250);
    return () => clearTimeout(timer);
  }, [text]);

  const results = useFetch<Row | null>(() => (debounced.length >= 2 ? get('/search', { q: debounced }) : Promise.resolve(null)), [debounced]);
  const groups = SEARCH_GROUPS.filter(([key]) => results.data?.[key]?.length);

  return (
    <div ref={ref} className="relative hidden w-full max-w-sm md:block">
      <label>
        <span className="sr-only">Search customers, quotations, subscriptions, invoices and payments</span>
        <Search size={15} className="absolute top-2.5 left-2.5 text-ink-3" aria-hidden />
        <input
          type="search"
          value={text}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          placeholder="Search records"
          className="h-9 w-full rounded-md border border-line bg-surface-2 pr-3 pl-8 text-sm text-ink placeholder:text-ink-3"
        />
      </label>
      {open && debounced.length >= 2 && results.data && (
        <div className="absolute z-40 mt-1 max-h-96 w-full overflow-y-auto rounded-md border border-line bg-surface py-1 shadow-lg">
          {!groups.length && <p className="px-3 py-3 text-sm text-ink-3">No matches for "{debounced}"</p>}
          {groups.map(([key, label, base]) => (
            <div key={key}>
              <p className="px-3 pt-2 pb-1 text-xs font-semibold text-ink-3">{label}</p>
              {results.data![key].map((item: Row) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setOpen(false);
                    setText('');
                    // Payments have no page of their own: the list opens filtered to the match.
                    navigate(key === 'payments' ? `${base}?search=${encodeURIComponent(item.label)}` : `${base}/${item.id}`);
                  }}
                  className="block w-full px-3 py-1.5 text-left hover:bg-surface-2"
                >
                  <span className="block truncate text-sm text-ink">{item.label}</span>
                  <span className="block truncate text-xs text-ink-3">{item.sublabel}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const ref = useOutsideClose(() => setOpen(false));
  const state = useFetch<{ items: Row[]; unread: number }>(() => get('/notifications'), []);

  useEffect(() => {
    const timer = setInterval(() => void state.reload(), 60_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unread = state.data?.unread ?? 0;
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} aria-label={`Notifications, ${unread} unread`} aria-expanded={open} className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-2 hover:bg-surface-2 hover:text-ink">
        <Bell size={19} />
        {unread > 0 && <span className="absolute top-1 right-1 min-w-4 rounded-full bg-bad px-1 text-center text-[10px] leading-4 font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="fixed right-2 left-2 z-40 mt-1 rounded-md border border-line bg-surface shadow-lg sm:absolute sm:left-auto sm:w-96 sm:right-0">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="text-sm font-bold text-ink">Notifications</span>
            {unread > 0 && (
              <button
                className="text-xs font-semibold text-brand-ink hover:underline"
                onClick={async () => {
                  await post('/notifications/read-all');
                  void state.reload();
                }}
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {!state.data?.items.length && <p className="px-3 py-6 text-center text-sm text-ink-3">You have no notifications</p>}
            {state.data?.items.map((n) => (
              <button
                key={n.id}
                onClick={async () => {
                  setOpen(false);
                  if (!n.readAt) await post(`/notifications/${n.id}/read`).catch(() => undefined);
                  void state.reload();
                  if (n.link) navigate(n.link);
                }}
                className={`block w-full border-b border-line px-3 py-2.5 text-left last:border-0 hover:bg-surface-2 ${n.readAt ? '' : 'bg-brand-soft/60'}`}
              >
                <span className="block text-sm font-semibold text-ink">{n.title}</span>
                <span className="block text-xs text-ink-2">{n.message}</span>
                <span className="mt-0.5 block text-[11px] text-ink-3">{dateTime(n.createdAt)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProfileMenu({ area }: { area: 'internal' | 'customer' }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const ref = useOutsideClose(() => setOpen(false));
  if (!user) return null;
  const initials = user.fullName.split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Open user menu" className="flex items-center gap-2 rounded-md py-1 pr-1 pl-1 hover:bg-surface-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand-ink">{initials}</span>
        <span className="hidden text-left leading-tight lg:block">
          <span className="block max-w-32 truncate text-sm font-semibold text-ink">{user.fullName}</span>
          <span className="block text-xs text-ink-3">{roleLabel(user)}</span>
        </span>
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-1 w-56 rounded-md border border-line bg-surface py-1 shadow-lg">
          <div className="border-b border-line px-3 py-2">
            <p className="truncate text-sm font-semibold text-ink">{user.fullName}</p>
            <p className="truncate text-xs text-ink-3">{user.email}</p>
            <p className="text-xs text-ink-3">{roleLabel(user)}</p>
          </div>
          <Link to={area === 'customer' ? '/portal/account' : '/app/profile'} onClick={() => setOpen(false)} className="flex items-center gap-2 px-3 py-2 text-sm text-ink hover:bg-surface-2">
            <UserCircle size={16} /> {area === 'customer' ? 'Account settings' : 'My profile'}
          </Link>
          <button
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-ink hover:bg-surface-2"
          >
            <LogOut size={16} /> Log out
          </button>
        </div>
      )}
    </div>
  );
}

export function AppLayout({ area }: { area: 'internal' | 'customer' }) {
  const { user, can } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setMenuOpen(false), [location.pathname]);
  if (!user) return null;

  const nav = (area === 'customer' ? CUSTOMER_NAV : INTERNAL_NAV).filter((item) => item.show(user, can));
  const sidebar = (
    <nav aria-label="Main" className="flex-1 space-y-0.5 overflow-y-auto p-3">
      {nav.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/app/reports'}
          className={({ isActive }) =>
            `flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium ${isActive ? 'bg-brand-soft font-semibold text-brand-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'}`
          }
        >
          <Icon size={17} aria-hidden />
          {label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen lg:pl-60">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface lg:flex">
        <div className="flex h-14 items-center border-b border-line px-4">
          <Logo to={area === 'customer' ? '/portal/dashboard' : '/app/dashboard'} />
        </div>
        {sidebar}
      </aside>

      {menuOpen && (
        <div className="no-print fixed inset-0 z-40 bg-black/45 lg:hidden" onMouseDown={(e) => e.target === e.currentTarget && setMenuOpen(false)}>
          <aside className="flex h-full w-64 flex-col bg-surface">
            <div className="flex h-14 items-center justify-between border-b border-line px-4">
              <Logo to={area === 'customer' ? '/portal/dashboard' : '/app/dashboard'} />
              <button aria-label="Close menu" onClick={() => setMenuOpen(false)} className="text-ink-2">
                <X size={20} />
              </button>
            </div>
            {sidebar}
          </aside>
        </div>
      )}

      <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-surface px-3 sm:px-5">
        <button aria-label="Open menu" onClick={() => setMenuOpen(true)} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-2 hover:bg-surface-2 lg:hidden">
          <Menu size={20} />
        </button>
        {area === 'internal' ? <GlobalSearch /> : <span className="hidden text-sm font-semibold text-ink-2 sm:block">Customer portal</span>}
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <Notifications />
          <ProfileMenu area={area} />
        </div>
      </header>

      <main className="print-full mx-auto max-w-7xl px-3 py-5 sm:px-5 lg:px-6">
        <Outlet />
      </main>
    </div>
  );
}
