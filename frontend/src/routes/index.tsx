import type { ReactNode } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { EmptyState, Spinner } from '../components/common/ui';
import { homeFor, useAuth } from '../context/AuthContext';
import { AppLayout } from '../layouts/AppLayout';
import AuditLogPage from '../pages/admin/AuditLogPage';
import CustomerDetailPage from '../pages/admin/CustomerDetailPage';
import CustomersPage from '../pages/admin/CustomersPage';
import AdminDashboard from '../pages/admin/AdminDashboard';
import DiscountsPage from '../pages/admin/DiscountsPage';
import InvoiceDetailPage from '../pages/admin/InvoiceDetailPage';
import InvoicesPage from '../pages/admin/InvoicesPage';
import PaymentsPage from '../pages/admin/PaymentsPage';
import PlansPage from '../pages/admin/PlansPage';
import ProductDetailPage from '../pages/admin/ProductDetailPage';
import ProductsPage from '../pages/admin/ProductsPage';
import QuotationDetailPage from '../pages/admin/QuotationDetailPage';
import QuotationFormPage from '../pages/admin/QuotationFormPage';
import QuotationsPage from '../pages/admin/QuotationsPage';
import ReportsPage from '../pages/admin/ReportsPage';
import SettingsPage from '../pages/admin/SettingsPage';
import StaffPage from '../pages/admin/StaffPage';
import SubscriptionDetailPage from '../pages/admin/SubscriptionDetailPage';
import SubscriptionFormPage from '../pages/admin/SubscriptionFormPage';
import SubscriptionsPage from '../pages/admin/SubscriptionsPage';
import TaxesPage from '../pages/admin/TaxesPage';
import TemplatesPage from '../pages/admin/TemplatesPage';
import { ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage } from '../pages/auth/AuthPages';
import * as portal from '../pages/customer/PortalPages';
import LandingPage from '../pages/LandingPage';
import FinanceDashboard from '../pages/staff/FinanceDashboard';
import OperationsDashboard from '../pages/staff/OperationsDashboard';
import ProfilePage from '../pages/staff/ProfilePage';
import RenewalsPage from '../pages/staff/RenewalsPage';
import SalesDashboard from '../pages/staff/SalesDashboard';

function Protected({ area }: { area: 'internal' | 'customer' }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if ((user.role === 'customer') !== (area === 'customer')) return <Navigate to={homeFor(user)} replace />;
  return <AppLayout area={area} />;
}

function Guard({ permission, adminOnly, children }: { permission?: string[]; adminOnly?: boolean; children: ReactNode }) {
  const { user, can } = useAuth();
  const allowed = adminOnly ? user?.role === 'admin' : !permission || can(...permission);
  if (!allowed) return <EmptyState title="You do not have access to this page" message="Ask your administrator if you need access." />;
  return <>{children}</>;
}

function Dashboard() {
  const { user } = useAuth();
  if (user?.profile === 'sales') return <SalesDashboard />;
  if (user?.profile === 'operations') return <OperationsDashboard />;
  if (user?.profile === 'finance') return <FinanceDashboard />;
  return <AdminDashboard />;
}

function PublicOnly() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  return user ? <Navigate to={homeFor(user)} replace /> : <Outlet />;
}

const perm = (permission: string[], element: ReactNode) => <Guard permission={permission}>{element}</Guard>;
const admin = (element: ReactNode) => <Guard adminOnly>{element}</Guard>;

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route element={<PublicOnly />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route path="/app" element={<Protected area="internal" />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="customers" element={perm(['customers.view'], <CustomersPage />)} />
        <Route path="customers/:id" element={perm(['customers.view'], <CustomerDetailPage />)} />
        <Route path="products" element={perm(['products.view'], <ProductsPage />)} />
        <Route path="products/:id" element={perm(['products.view'], <ProductDetailPage />)} />
        <Route path="plans" element={perm(['plans.view'], <PlansPage />)} />
        <Route path="templates" element={perm(['templates.view'], <TemplatesPage />)} />
        <Route path="quotations" element={perm(['quotations.view'], <QuotationsPage />)} />
        <Route path="quotations/new" element={perm(['quotations.manage'], <QuotationFormPage />)} />
        <Route path="quotations/:id" element={perm(['quotations.view'], <QuotationDetailPage />)} />
        <Route path="quotations/:id/edit" element={perm(['quotations.manage'], <QuotationFormPage />)} />
        <Route path="subscriptions" element={perm(['subscriptions.view'], <SubscriptionsPage />)} />
        <Route path="subscriptions/new" element={perm(['subscriptions.manage'], <SubscriptionFormPage />)} />
        <Route path="subscriptions/:id" element={perm(['subscriptions.view'], <SubscriptionDetailPage />)} />
        <Route path="subscriptions/:id/edit" element={perm(['subscriptions.manage'], <SubscriptionFormPage />)} />
        <Route path="renewals" element={perm(['subscriptions.manage'], <RenewalsPage />)} />
        <Route path="invoices" element={perm(['invoices.view'], <InvoicesPage />)} />
        <Route path="invoices/:id" element={perm(['invoices.view'], <InvoiceDetailPage />)} />
        <Route path="payments" element={perm(['payments.view'], <PaymentsPage />)} />
        <Route path="discounts" element={admin(<DiscountsPage />)} />
        <Route path="taxes" element={admin(<TaxesPage />)} />
        <Route path="reports" element={perm(['reports.view'], <ReportsPage />)} />
        <Route path="reports/:type" element={perm(['reports.view'], <ReportsPage />)} />
        <Route path="staff" element={admin(<StaffPage />)} />
        <Route path="settings" element={admin(<SettingsPage />)} />
        <Route path="audit-log" element={admin(<AuditLogPage />)} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="*" element={<EmptyState title="Page not found" />} />
      </Route>

      <Route path="/portal" element={<Protected area="customer" />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<portal.PortalDashboard />} />
        <Route path="plans" element={<portal.PortalPlans />} />
        <Route path="quotations" element={<portal.PortalQuotations />} />
        <Route path="quotations/:id" element={<portal.PortalQuotationDetail />} />
        <Route path="subscriptions" element={<portal.PortalSubscriptions />} />
        <Route path="subscriptions/:id" element={<portal.PortalSubscriptionDetail />} />
        <Route path="addons" element={<portal.PortalAddons />} />
        <Route path="invoices" element={<portal.PortalInvoices />} />
        <Route path="invoices/:id" element={<portal.PortalInvoiceDetail />} />
        <Route path="payments" element={<portal.PortalPayments />} />
        <Route path="account" element={<ProfilePage />} />
        <Route path="*" element={<EmptyState title="Page not found" />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
