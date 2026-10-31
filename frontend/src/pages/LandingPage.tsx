import { ArrowRight, BarChart3, Check, FileText, MoreHorizontal, Receipt, Repeat, ShieldCheck, Sparkles, Users, Zap, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { buttonClass, Logo, Spinner, ThemeToggle } from '../components/common/ui';
import { homeFor, useAuth } from '../context/AuthContext';
import { useFetch } from '../hooks/useFetch';
import { get } from '../services/api';
import type { Row } from '../types';
import { FREQUENCY_LABEL, money } from '../utils/format';

const FEATURES: [LucideIcon, string, string][] = [
  [Repeat, 'Subscription lifecycle', 'Track every subscription from quotation to closure, with pause, renewal and early closure rules set per plan.'],
  [FileText, 'Quotations customers can approve', 'Build from reusable templates. Customers accept or reject in their own portal, then one click creates the subscription.'],
  [Receipt, 'Automatic invoicing', 'Invoices generate on each billing schedule, and the same period can never be billed twice.'],
  [Zap, 'Taxes and discounts', 'Rates and eligibility apply automatically, and each invoice keeps the exact values it was issued with.'],
  [BarChart3, 'Finance reporting', 'Revenue, outstanding balances and overdue invoices, always current, with no spreadsheet to reconcile.'],
  [ShieldCheck, 'Access by role', 'Admin, Sales, Operations, Finance and Customers each see what their job needs, and nothing else.'],
];

const WORKFLOW: [string, string][] = [
  ['Set up your catalogue', 'Add products, plans, tax rules, discounts and quotation templates.'],
  ['Quote the customer', 'Sales prepares a quotation and sends it to the customer portal.'],
  ['Get approval', 'The customer accepts, and the quotation becomes a subscription.'],
  ['Bill on schedule', 'Invoices generate on time. Staff confirm and send them.'],
  ['Record payment', 'Full or partial payments update the balance immediately.'],
  ['Renew and report', 'Renewals follow plan rules, and finance sees it all live.'],
];

const FAQ: [string, string][] = [
  ['Do customers need to pay through Brightloop?', 'No. Brightloop records payments made by bank transfer, cash, card or other methods. It does not process card payments itself.'],
  ['Can a customer see another customer’s records?', 'No. Portal access is limited on the server to the signed-in customer’s own quotations, subscriptions, invoices and payments.'],
  ['What happens if a tax rate changes?', 'New documents use the new rate. Invoices already issued keep the rate they were created with.'],
  ['Can we pause a subscription?', 'Yes, if its plan allows it. Billing stops while paused, and the billing and expiry dates move forward by the paused time when it resumes.'],
];

const CURVE = 'M0 150 C 40 142, 70 128, 105 132 S 165 142, 200 118 S 255 72, 300 76 S 360 90, 400 66 S 460 22, 520 18 L 560 18';

/** Illustrative product preview for the marketing page. Sample figures only, never connected to live data. */
function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-2xl" aria-label="Illustration of the finance overview, using sample figures" role="img">
      <div className="rounded-2xl border border-line bg-surface p-5 shadow-xl sm:p-6">
        <div className="mb-4 flex items-center justify-between border-b border-line pb-4">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white">
            <Sparkles size={17} />
          </span>
          <span className="text-sm font-medium text-ink-2">Finance overview</span>
          <MoreHorizontal size={18} className="text-ink-3" />
        </div>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {[
            ['Monthly revenue', '₹5.42L', '+12.4%'],
            ['Outstanding', '₹1.18L', '18 invoices'],
            ['Collected', '₹4.24L', '96.2%'],
          ].map(([label, value, note]) => (
            <div key={label} className="rounded-xl border border-line p-2.5 sm:p-3.5">
              <p className="truncate text-[11px] text-ink-2">{label}</p>
              <p className="mt-1.5 text-base font-bold text-ink sm:text-xl">{value}</p>
              <p className="mt-1 truncate text-[11px] text-ok">{note}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 flex items-end justify-between">
          <div>
            <p className="text-xs text-ink-2">Revenue growth</p>
            <p className="mt-0.5 text-sm font-bold text-ink">₹28.6L total</p>
          </div>
          <p className="text-xs text-ink-3">Last 6 months</p>
        </div>
        <svg viewBox="0 0 560 170" className="mt-2 w-full" aria-hidden>
          <defs>
            <linearGradient id="previewFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.2" />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[20, 70, 120, 168].map((y) => (
            <line key={y} x1="0" x2="560" y1={y} y2={y} stroke="var(--line)" />
          ))}
          <path d={`${CURVE} L 560 168 L 0 168 Z`} fill="url(#previewFill)" />
          <path d={CURVE} fill="none" stroke="var(--chart-1)" strokeWidth="2.5" />
          <circle cx="554" cy="18" r="5" fill="var(--surface)" stroke="var(--chart-1)" strokeWidth="2.5" />
        </svg>
        <div className="flex justify-between text-[11px] text-ink-3">
          {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'].map((m) => (
            <span key={m}>{m}</span>
          ))}
        </div>
      </div>
      <div className="absolute -top-4 -right-1 hidden items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2.5 shadow-lg sm:flex lg:-right-6">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-warn-soft text-warn">
          <Zap size={16} />
        </span>
        <span className="text-[11px] leading-tight text-ink-2">
          Renewal automated
          <span className="mt-0.5 block text-xs font-bold text-ink">SUB-001</span>
        </span>
      </div>
      <div className="absolute bottom-20 -left-1 hidden items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2.5 shadow-lg sm:flex lg:-left-6">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-ok-soft text-ok">
          <Check size={16} />
        </span>
        <span className="text-[11px] leading-tight text-ink-2">
          Payment received
          <span className="mt-0.5 block text-xs font-bold text-ink">₹56,640</span>
        </span>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const { user } = useAuth();
  const plans = useFetch<Row[]>(() => get('/public/plans'), []);
  const [company, setCompany] = useState<Row | null>(null);

  useEffect(() => {
    document.title = 'Brightloop | Recurring revenue, on autopilot';
    get('/public/info').then(setCompany).catch(() => undefined);
  }, []);

  const demoHref = `mailto:${company?.email ?? 'admin@brightloop.in'}?subject=${encodeURIComponent('Brightloop demo request')}`;

  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-30 border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between gap-3 px-4 sm:px-8 xl:px-16">
          <Logo />
          <nav aria-label="Website" className="hidden items-center gap-8 text-sm font-medium text-ink-2 md:flex">
            {['Features', 'Workflow', 'Pricing', 'FAQ'].map((item) => (
              <a key={item} href={`#${item.toLowerCase()}`} className="hover:text-ink">
                {item}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-1 sm:gap-3">
            <ThemeToggle />
            {user ? (
              <Link to={homeFor(user)} className={`${buttonClass('primary')} h-10 rounded-lg px-4`}>
                Workspace <ArrowRight size={16} />
              </Link>
            ) : (
              <>
                <Link to="/login" className="px-2 text-sm font-semibold text-ink hover:text-brand-ink sm:px-3">
                  Log in
                </Link>
                {/* On phones the hero's "Start free" takes this button's place. */}
                <Link to="/register" className={`${buttonClass('primary')} hidden! h-10 rounded-lg px-4 sm:inline-flex!`}>
                  Get started <ArrowRight size={16} />
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="grid lg:min-h-[calc(100vh-4rem)] lg:grid-cols-[47%_53%]">
        <div className="hero-panel flex flex-col justify-between px-5 py-10 text-white sm:px-10 xl:px-[4.5rem]">
          <Logo light />
          <div className="my-12 lg:my-0">
            <p className="mb-5 text-xs font-bold tracking-[0.2em] text-white/75">ONE SYSTEM. EVERY RECURRING RUPEE.</p>
            <h1 className="text-5xl leading-[1.05] font-medium tracking-tight xl:text-[4.25rem]">
              Recurring revenue, <br />
              on <span className="font-serif font-normal italic">autopilot.</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-white/80">Automate subscriptions, invoices and payments without losing sight of the customer behind every number.</p>
            <div className="mt-8 flex flex-wrap gap-2.5">
              <Link to="/register" className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#0b0b1e] px-4.5 text-sm font-semibold text-white hover:bg-black">
                Start free <ArrowRight size={16} />
              </Link>
              <a href={demoHref} className="inline-flex h-11 items-center rounded-lg border border-white/35 bg-white/10 px-4.5 text-sm font-semibold text-white hover:bg-white/20">
                Book a demo
              </a>
            </div>
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/80">
            <li className="inline-flex items-center gap-1.5">
              <Check size={14} /> No credit card required
            </li>
            <li className="inline-flex items-center gap-1.5">
              <Check size={14} /> Set up in minutes
            </li>
          </ul>
        </div>
        <div className="flex items-center bg-bg px-5 py-12 sm:px-10 xl:px-20">
          <ProductPreview />
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20">
        <p className="text-xs font-bold tracking-[0.18em] text-brand-ink">FEATURES</p>
        <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Replace the spreadsheets and the manual billing</h2>
        <div className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(([Icon, title, text]) => (
            <div key={title}>
              <Icon size={22} className="text-brand-ink" />
              <h3 className="mt-3 text-base font-bold text-ink">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="workflow" className="scroll-mt-16 border-y border-line bg-bg">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <p className="text-xs font-bold tracking-[0.18em] text-brand-ink">WORKFLOW</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">From first quotation to final payment</h2>
          <ol className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {WORKFLOW.map(([title, text], i) => (
              <li key={title} className="border-t-2 border-line-strong pt-3">
                <span className="tnum text-sm font-bold text-brand-ink">{String(i + 1).padStart(2, '0')}</span>
                <h3 className="mt-1 text-base font-bold text-ink">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-2">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20">
        <p className="text-xs font-bold tracking-[0.18em] text-brand-ink">PRICING</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Plans available today</h2>
        <p className="mt-2 text-sm text-ink-2">Prices exclude applicable taxes.</p>
        {plans.loading && !plans.data ? (
          <Spinner label="Loading plans" />
        ) : plans.error ? (
          <p className="mt-8 text-sm text-ink-2">Plans could not be loaded just now. Please try again shortly.</p>
        ) : !plans.data?.length ? (
          <p className="mt-8 text-sm text-ink-2">No plans are available right now.</p>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {plans.data.map((plan) => (
              <div key={plan.id} className="flex flex-col rounded-lg border border-line p-5">
                <h3 className="text-base font-bold text-ink">{plan.name}</h3>
                <p className="mt-1 flex-1 text-sm text-ink-2">{plan.description}</p>
                <p className="tnum mt-4 text-2xl font-bold tracking-tight text-ink">{money(plan.price)}</p>
                <p className="text-xs text-ink-3">{FREQUENCY_LABEL[plan.billingFrequency]}</p>
                <Link to="/register" className={`${buttonClass('secondary')} mt-4`}>
                  Request a quotation
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      <section id="faq" className="scroll-mt-16 border-t border-line bg-bg">
        <div className="mx-auto max-w-3xl px-5 py-20">
          <p className="text-xs font-bold tracking-[0.18em] text-brand-ink">FAQ</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Common questions</h2>
          <div className="mt-8 divide-y divide-line border-y border-line">
            {FAQ.map(([question, answer]) => (
              <details key={question} className="group py-4">
                <summary className="cursor-pointer text-sm font-bold text-ink">{question}</summary>
                <p className="mt-2 text-sm leading-relaxed text-ink-2">{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-xs text-ink-3">
          <span className="inline-flex items-center gap-1.5">
            <Users size={14} /> &copy; {new Date().getFullYear()} Brightloop Technologies
          </span>
          <Link to="/login" className="font-semibold hover:text-ink">
            Log in
          </Link>
        </div>
      </footer>
    </div>
  );
}
