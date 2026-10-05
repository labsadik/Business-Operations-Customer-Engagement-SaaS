# Conventus

Conventus is a multi-tenant scheduling SaaS for companies that want customers to request live meetings and have the system automatically route each request to an available employee.

## Product model

- **Company** creates a workspace and a public booking page.
- **Employee** connects Google and participates in availability/routing.
- **Customer** opens the company's public page, signs in with Google, selects a date/time/duration, and sends a request.
- **Assignment engine** offers the request to eligible employees with a five-minute acceptance window.
- **Meeting engine** creates the Google Meet space and Calendar event after an employee accepts.
- **Meeting route** is company-scoped, for example `/acme/meet/abc123` (canonical public-company meeting route).

## Plans

| Plan | Price | Employees | Meetings / month | Max duration | Concurrent meetings |
| --- | ---: | ---: | ---: | ---: | ---: |
| Free | Free | 1 | 10 | 5 min | 1 |
| Starter | ₹99/month | 10 | 100 | 20 min | 10 |
| Elite | ₹399/month | 50 | 850 | 60 min | 25 |
| Pro | ₹799/month | 100 | 1,500 | 90 min | 50 |
| Plus | ₹1,499/month | 250 | 3,000 | 120 min | 100 |

## Architecture principles

- MongoDB is the source of truth.
- Redis is for low-latency coordination, cache, locks, and rate limiting.
- Google OAuth is used for identity and delegated Calendar/Meet access.
- Booking state changes are server authoritative.
- Acceptance and meeting creation are idempotent.
- Tenant isolation is enforced at the application/data-access layer.
- Background work is durable and retryable rather than held open in request handlers.
- Public booking and internal company/employee experiences are separated by route and authorization boundary.

## Development

1. Copy `.env.example` to `.env.local`.
2. Set MongoDB and Redis credentials.
3. Configure the Google Cloud project and OAuth credentials.
4. Install dependencies with `npm install`.
5. Run `npm run dev`.

## Checks

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run check`
- `npm run build:cloudflare`

## Cloudflare Workers deployment

Production is deployed as a Cloudflare Worker through the OpenNext Cloudflare adapter.

The repository uses `wrangler.jsonc` for the Worker entry point, assets, the Worker self-reference binding, and the 1-minute Cron Trigger. The `WORKER_SELF_REFERENCE` service name must stay identical to the Worker `name` (currently `test0001`). `custom-worker.ts` keeps the generated OpenNext fetch handler and adds the scheduled handler needed to preserve the existing background sweep.

For Cloudflare production, configure these server-side secrets/environment variables in the Worker:

```
MONGODB_URI=
REDIS_URL=
REDIS_TOKEN=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://YOUR_DOMAIN/api/auth/google/callback
AUTH_SECRET=
ENCRYPTION_KEY=
CRON_SECRET=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
AXIOM_HOST=
AXIOM_DATASET=
AXIOM_TOKEN=
AXIOM_SERVICE_NAME=conventus
```

Set the public build variables required by the application in the Cloudflare Workers Build configuration:

```
NEXT_PUBLIC_APP_URL=https://YOUR_DOMAIN
NEXT_PUBLIC_APP_NAME=Conventus
NEXT_PUBLIC_UMAMI_SCRIPT_URL=
NEXT_PUBLIC_UMAMI_WEBSITE_ID=
NEXT_PUBLIC_MIXPANEL_TOKEN=
NEXT_PUBLIC_CLARITY_PROJECT_ID=
```

For Cloudflare Workers Builds, use these exact commands:

- **Build command:** `npm run build:cloudflare`
- **Deploy command:** `npm run deploy:cloudflare`

The default `build` script intentionally remains `next build` because `opennextjs-cloudflare build` invokes the package `build` script internally. Pointing `build` back to OpenNext causes recursive builds and eventually the process is killed.

For a local one-command deployment, use:

```
npm run deploy
```

The 1-minute Cron Trigger invokes the existing `/api/jobs/sweep` route through the Worker self-reference binding; the HTTP API contract is unchanged.

## Delivery phases

### Phase 1 — Foundation
Application shell, landing page, route boundaries, plan entitlements, database/Redis configuration, security defaults, health endpoint, and documentation.

### Phase 2 — Identity and tenancy
Google OAuth, users, companies, workspaces, memberships, roles, secure OAuth token storage, onboarding.

### Phase 3 — Scheduling
Availability rules, Google Calendar free/busy, meeting types, public booking, five-minute request state machine, routing and concurrency protection.

### Phase 4 — Meetings
Google Meet creation, Calendar event creation, realtime confirmation, company-scoped `/meet/[meetingId]`, supported Meet embedding/meeting surface.

### Phase 5 — Billing and operations
Subscriptions, usage enforcement, notifications, admin operations, audit logs, monitoring, retries, rate limiting, and production hardening.

### Phase 6 — Scale
Queue tuning, Redis upgrade when required, database scaling, caching, load testing, SLOs, observability, and disaster recovery.

## Billing with Razorpay

Conventus connects the Free, Starter, Elite, Pro, and Plus plan entitlements to Razorpay Checkout. Paid plans add the GST rate configured in MongoDB to the trusted base plan price before the Razorpay order is created. The server creates the Razorpay order from the trusted plan definition, validates the returned signature, confirms the payment is captured, and then activates the paid plan for one month. Razorpay webhook events are also accepted at `/api/webhooks/razorpay` for server-side reconciliation. Razorpay recommends server-side order creation, signature validation, payment-status verification, and HMAC validation for webhooks. citeturn731333search0turn318613search5

Required environment variables:

```
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
```

Platform legal/tax details are stored in the MongoDB `PlatformSettings` singleton and managed from `/admin/platform-settings`. New invoices snapshot the legal merchant identity and GST treatment at capture time; completed invoice snapshots are not silently rewritten later.

The runtime environment only contains service/application credentials. The platform legal name, website, billing email, phone, tax ID, GSTIN, SAC code, registered address, and GST treatment are database data. The Conventus brand mark is bundled locally as /favicon.svg and is used by the favicon, landing page, admin console, public scheduling shell, dashboard billing UI, and invoices/PDFs.

For local development use Razorpay Test Mode credentials. For Cloudflare production, configure the Live Mode credentials as Worker secrets/environment variables and configure the Razorpay webhook URL as:

`https://YOUR_DOMAIN/api/webhooks/razorpay`

Never commit the secret values.

## Platform administration

Platform administrator access is a **database role**, not a client-side flag. The role is stored on `User.role`, checked again when a session is loaded, and restricted to `/admin/*` through the server layout. Administrators can manage platform-admin access from `/admin/access`; grants and revocations are written to `AdminAuditEvent`, self-demotion is blocked, and the last active platform admin cannot be removed.

Platform admins can open a specific company from `/admin/companies/:companyId` with **Manage workspace**. That sets a short-lived, server-only management scope while keeping the real user role as `PLATFORM_ADMIN`. The normal company dashboard, team, announcements, profile, and scheduling APIs then operate against that scoped company. Billing checkout stays disabled in admin management mode.

To create the first platform administrator, create/promote the existing MongoDB user with the provided admin bootstrap command:

```
npm run admin:create -- admin@example.com
```

The standalone admin CLI reads `.env.local` first (then `.env`), so `MONGODB_URI` does not need to be exported separately in PowerShell.

After that, the platform admin can use `/admin/access` to grant or revoke `PLATFORM_ADMIN` on other MongoDB users. No admin email allow-list is read from environment variables.

## Platform-owned billing

Tenant companies are the **customers/billing subjects**. Payments are created with the Conventus Razorpay credentials and merchant identity, so the funds are collected by the Conventus merchant account rather than a tenant's own payment account.

The payment flow is:
- The signed-in company owner/admin chooses a trusted Conventus plan.
- The server creates the Razorpay order using the server-side plan price and Conventus merchant metadata.
- Razorpay Checkout displays **Conventus** as the merchant and the paying company as the prefilled customer.
- Signature, order, amount, currency, and captured status are verified server-side.
- Webhook reconciliation can safely retry, including successful retries after a failed payment attempt.
- Payment activation, invoice creation, subscription changes, and workspace plan state are idempotent.
- The successful result page is `/billing/result` and is company-scoped; it shows Conventus merchant branding plus the paying company's name, short description, and logo.

For the Razorpay account itself, the legal merchant/business identity, settlement account, checkout branding, and statement descriptor must also be configured in the Conventus-owned Razorpay account. Application code cannot change the Razorpay account holder or settlement account.
## Security

Never commit secrets. Google refresh tokens, application secrets, Redis credentials, database credentials, billing secrets, and email provider keys must stay server-side.
