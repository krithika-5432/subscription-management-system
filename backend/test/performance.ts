const API = process.env.API_URL ?? 'http://localhost:5000/api';
const TARGET_MS = 2000;

async function login(email: string, password: string) {
  const res = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  return (await res.json()).data.token as string;
}

async function time(path: string, token: string) {
  const start = performance.now();
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  await res.text();
  return { path, status: res.status, ms: Math.round(performance.now() - start) };
}

const admin = await login('admin@brightloop.in', 'Admin@1234');
const customer = await login('customer@acme.example', 'Customer@1234');

const adminPaths = [
  '/dashboard/admin', '/dashboard/sales', '/dashboard/operations', '/dashboard/finance', '/dashboard/finance?month=2026-06',
  '/customers', '/customers?search=company&sortBy=companyName&sortDir=desc', '/customers?page=100',
  '/subscriptions', '/subscriptions?status=active&sortBy=expiryDate', '/subscriptions?search=customer%201&page=5', '/subscriptions?expiringWithin=60',
  '/invoices', '/invoices?status=overdue', '/invoices?paymentStatus=partial&sortBy=outstanding&sortDir=desc', '/invoices?search=company&page=50', '/invoices?page=2000',
  '/payments', '/payments?method=card&sortBy=amount', '/payments?search=company',
  '/quotations', '/requests', '/audit-logs', '/search?q=company',
  '/reports/revenue', '/reports/payments', '/reports/outstanding', '/reports/overdue', '/reports/paid', '/reports/unpaid', '/reports/subscriptions', '/reports/active', '/reports/closed', '/reports/renewals', '/reports/customers', '/reports/customers?sortBy=outstanding&sortDir=desc',
];

const results = [];
for (const path of adminPaths) results.push(await time(path, admin));
for (const path of ['/portal/dashboard', '/portal/invoices', '/portal/subscriptions', '/portal/payments']) results.push(await time(path, customer));

results.sort((a, b) => b.ms - a.ms);
for (const r of results) console.log(`${String(r.ms).padStart(6)} ms  ${r.status}  ${r.path}`);
const failed = results.filter((r) => r.status !== 200 || r.ms > TARGET_MS);
console.log(`\n${results.length - failed.length}/${results.length} within ${TARGET_MS} ms`);
process.exitCode = failed.length ? 1 : 0;
