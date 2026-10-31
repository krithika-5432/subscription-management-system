# subscription-management-system
Manages the full subscription lifecycle for a B2B SaaS business: customers, quotations, subscriptions, recurring invoices, payments, renewals and financial reporting. It has one internal application for Admin and Sales, Operations and Finance staff, and a separate customer portal.

**Stack:** React, TypeScript, Vite, Tailwind CSS, Express, PostgreSQL , JWT, bcrypt, Nodemailer, PDFKit.

## How the business rules work

**Quotation to payment:** the customer or Sales starts a quotation, Sales sends it, the customer accepts, Sales converts it to a confirmed subscription, Operations activates it, a draft invoice is generated, staff confirm and send it, and payments settle it.

**Subscription lifecycle:** Draft, Quotation, Confirmed, Active, Closed, with Active and Paused moving both ways. Any other transition is refused. Pausing and early closure follow the plan's settings. Resuming moves the billing and expiry dates forward by the paused time.

**Billing schedule:** the scheduler runs when the API starts and every five minutes, in the API process. No Redis is needed. Each run expires old quotations, applies expiry rules, generates due invoices and sends renewal reminders. "Run billing now" on the Invoices page does the same immediately.

**At expiry:** `auto` plans renew, plans with automatic closure or no renewal close, and `manual` plans wait for staff on the Renewals page.

**Duplicate protection:**
- A unique database index allows one live invoice per subscription billing period.
- A PostgreSQL advisory lock stops billing runs overlapping, even across server processes.
- Each payment form sends a one-time key, so a double submit records one payment.

**Money:** stored as `NUMERIC` and calculated in integer paise. Tax and discount values are saved on each document line, so later rate changes never alter issued documents. An invoice's balance is always recomputed from its recorded payments.

**Discounts:** one per document, re-validated on every invoice. An expired or used-up discount stops applying and the subscription continues at full price. A use is counted when an invoice takes the discount, and released if that invoice is cancelled.

**Permissions:** role and permissions are read from the database on every request, so changes apply immediately. Portal routes take the customer's identity only from the session. Admin can edit what each staff profile may do under Users and Staff.
