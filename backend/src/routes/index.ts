import { Router } from 'express';
import * as a from '../controllers/admin.controller.js';
import * as auth from '../controllers/auth.controller.js';
import * as b from '../controllers/billing.controller.js';
import * as portal from '../controllers/portal.controller.js';
import * as r from '../controllers/report.controller.js';
import * as s from '../controllers/sales.controller.js';
import * as sys from '../controllers/system.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { rateLimit } from '../middleware/rateLimit.middleware.js';
import { adminOnly, customerOnly, internalOnly, requirePermission as can } from '../middleware/role.middleware.js';

export const api = Router();

// public

api.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok' } });
});
api.get('/public/plans', sys.publicPlans);
api.get('/public/info', sys.publicInfo);

const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: Number(process.env.AUTH_RATE_LIMIT ?? 30) });
api.post('/auth/register', authLimit, auth.register);
api.post('/auth/login', authLimit, auth.login);
api.post('/auth/google', authLimit, auth.google);
api.post('/auth/forgot-password', authLimit, auth.forgot);
api.post('/auth/reset-password', authLimit, auth.reset);

// every route below needs a valid session

api.use(authenticate);

api.post('/auth/logout', auth.logout);
api.get('/auth/me', auth.me);
api.put('/auth/me', auth.updateMe);
api.post('/auth/change-password', auth.changePassword);

api.get('/notifications', sys.notifications);
api.post('/notifications/read-all', sys.readAllNotifications);
api.post('/notifications/:id/read', sys.readNotification);

// customer portal

const me = Router();
me.use(customerOnly);
me.get('/dashboard', portal.dashboard);
me.get('/catalog', portal.catalog);
me.get('/addons', portal.addons);
me.get('/requests', portal.listRequests);
me.post('/requests', portal.createRequest);
me.get('/quotations', portal.listQuotations);
me.get('/quotations/:id', portal.getQuotation);
me.get('/quotations/:id/pdf', portal.quotationPdf);
me.post('/quotations/:id/accept', portal.acceptQuotation);
me.post('/quotations/:id/reject', portal.rejectQuotation);
me.get('/subscriptions', portal.listSubscriptions);
me.get('/subscriptions/:id', portal.getSubscription);
me.get('/invoices', portal.listInvoices);
me.get('/invoices/:id', portal.getInvoice);
me.get('/invoices/:id/pdf', portal.invoicePdf);
me.get('/payments', portal.listPayments);
api.use('/portal', me);

//  internal application. Customers are stopped here, whatever the permission below.

const app = Router();
app.use(internalOnly);

app.get('/search', sys.search);
app.get('/dashboard/:kind', r.dashboard);

app.get('/staff-profiles', adminOnly, a.listProfiles);
app.put('/staff-profiles/:code', adminOnly, a.updateProfile);
app.get('/staff', adminOnly, a.listStaff);
app.post('/staff', adminOnly, a.createStaff);
app.get('/staff/:id', adminOnly, a.getStaff);
app.put('/staff/:id', adminOnly, a.updateStaff);
app.patch('/staff/:id/status', adminOnly, a.setStaffStatus);
app.post('/staff/:id/reset-password', adminOnly, a.resetStaffPassword);

app.get('/customers', can('customers.view'), a.listCustomers);
app.post('/customers', can('customers.manage'), a.createCustomer);
app.get('/customers/:id', can('customers.view'), a.getCustomer);
app.put('/customers/:id', can('customers.manage'), a.updateCustomer);
app.patch('/customers/:id/status', can('customers.manage'), a.setCustomerStatus);

app.get('/products', can('products.view'), a.listProducts);
app.post('/products', adminOnly, a.createProduct);
app.get('/products/:id', can('products.view'), a.getProduct);
app.put('/products/:id', adminOnly, a.updateProduct);
app.patch('/products/:id/status', adminOnly, a.setProductStatus);
app.post('/products/:id/variants', adminOnly, a.createVariant);
app.put('/products/:id/variants/:variantId', adminOnly, a.updateVariant);

app.get('/plans', can('plans.view'), a.listPlans);
app.post('/plans', adminOnly, a.createPlan);
app.get('/plans/:id', can('plans.view'), a.getPlan);
app.put('/plans/:id', adminOnly, a.updatePlan);
app.patch('/plans/:id/status', adminOnly, a.setPlanStatus);

app.get('/taxes', adminOnly, a.listTaxes);
app.post('/taxes', adminOnly, a.createTax);
app.get('/taxes/:id', adminOnly, a.getTax);
app.put('/taxes/:id', adminOnly, a.updateTax);
app.patch('/taxes/:id/status', adminOnly, a.setTaxStatus);

app.get('/discounts', can('discounts.view'), a.listDiscounts);
app.post('/discounts', adminOnly, a.createDiscount);
app.get('/discounts/:id', can('discounts.view'), a.getDiscount);
app.put('/discounts/:id', adminOnly, a.updateDiscount);
app.patch('/discounts/:id/status', adminOnly, a.setDiscountStatus);

app.get('/templates', can('templates.view'), a.listTemplates);
app.post('/templates', adminOnly, a.createTemplate);
app.get('/templates/:id', can('templates.view'), a.getTemplate);
app.get('/templates/:id/defaults', can('templates.view'), s.templateDefaults);
app.put('/templates/:id', adminOnly, a.updateTemplate);
app.patch('/templates/:id/status', adminOnly, a.setTemplateStatus);
app.post('/templates/:id/duplicate', adminOnly, a.duplicateTemplate);

app.get('/quotations', can('quotations.view'), s.listQuotations);
app.post('/quotations', can('quotations.manage'), s.createQuotation);
app.post('/quotations/preview', can('quotations.manage', 'subscriptions.manage'), s.previewQuotation);
app.get('/quotations/:id', can('quotations.view'), s.getQuotation);
app.get('/quotations/:id/pdf', can('quotations.view'), s.quotationPdf);
app.put('/quotations/:id', can('quotations.manage'), s.updateQuotation);
app.delete('/quotations/:id', can('quotations.manage'), s.deleteQuotation);
app.post('/quotations/:id/send', can('quotations.manage'), s.sendQuotation);
app.post('/quotations/:id/convert', can('quotations.manage', 'subscriptions.manage'), s.convertQuotation);

app.get('/requests', can('quotations.view', 'subscriptions.view'), s.listRequests);
app.get('/requests/:id', can('quotations.view', 'subscriptions.view'), s.getRequest_);
app.post('/requests/:id/decline', can('quotations.manage', 'subscriptions.manage'), s.declineRequest);
app.post('/requests/:id/approve-addon', can('subscriptions.manage'), s.approveAddon);

app.get('/subscriptions', can('subscriptions.view'), s.listSubscriptions);
app.post('/subscriptions', can('subscriptions.manage'), s.createSubscription);
app.get('/subscriptions/:id', can('subscriptions.view'), s.getSubscription);
app.put('/subscriptions/:id', can('subscriptions.manage'), s.updateSubscription);
app.post('/subscriptions/:id/transition', can('subscriptions.manage'), s.transitionSubscription);
app.post('/subscriptions/:id/renew', can('subscriptions.manage'), s.renewSubscription);
app.post('/subscriptions/:id/generate-invoice', can('invoices.manage'), b.generateForSubscription);

app.get('/invoices', can('invoices.view'), b.listInvoices);
app.post('/invoices/run-billing', can('invoices.manage'), b.runBilling);
app.get('/invoices/:id', can('invoices.view'), b.getInvoice);
app.get('/invoices/:id/pdf', can('invoices.view'), b.invoicePdf);
app.put('/invoices/:id', can('invoices.manage'), b.updateInvoice);
app.post('/invoices/:id/confirm', can('invoices.manage'), b.confirmInvoice);
app.post('/invoices/:id/cancel', can('invoices.manage'), b.cancelInvoice);
app.post('/invoices/:id/send', can('invoices.manage'), b.sendInvoice);

app.get('/payments', can('payments.view'), b.listPayments);
app.post('/payments', can('payments.record'), b.recordPayment);
app.get('/payments/:id', can('payments.view'), b.getPayment);
app.post('/payments/:id/void', can('payments.record'), b.voidPayment);

app.get('/reports/:type', can('reports.view'), r.report);
app.get('/reports/:type/export', can('reports.view'), r.exportReport);

app.get('/settings', adminOnly, a.getSettings);
app.put('/settings/sequences/:code', adminOnly, a.saveSequence);
app.put('/settings/:key', adminOnly, a.saveSettings);
app.get('/audit-logs', adminOnly, a.listAuditLogs);

api.use(app);
