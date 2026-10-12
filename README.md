# Canvas by AlgoQuit

Canvas by AlgoQuit is a multi-tenant scheduling SaaS for companies that want customers to request live meetings and have the system automatically route each request to an available employee.

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

1. Use [`.env.example.md`](./.env.example.md) as the local environment setup reference.
2. Create a real `.env.local` file in the repository root and fill in development credentials.
3. Install dependencies with `npm install`.
4. Run `npm run dev` and open `http://localhost:3000`.

The `.env.example.md` file is documentation only; Next.js does not load Markdown files as environment files. Do not commit `.env.local` or real credentials.

## Production deployment

For the container image, Google Cloud Run deployment, Secret Manager setup, Cloud Scheduler jobs, and production smoke checks, see [docs/DEPLOY_GCP_CLOUD_RUN.md](./docs/DEPLOY_GCP_CLOUD_RUN.md).

## Sentry error monitoring

Sentry is optional and is initialized from environment variables. When no DSN is configured, Sentry stays disabled and the existing Axiom/console logging remains available.

Configure these values in each deployment environment (for example, Vercel Project Settings → Environment Variables):

- `NEXT_PUBLIC_SENTRY_DSN`: the Sentry project DSN used by the browser. DSNs are public identifiers, not auth tokens.
- `SENTRY_DSN`: the server/edge DSN. Use the same project DSN unless browser and server events should go to different projects.
- `SENTRY_ENVIRONMENT` and `NEXT_PUBLIC_SENTRY_ENVIRONMENT`: optional labels such as `production`, `preview`, or `development`. If omitted, the server uses `VERCEL_ENV`/ `NODE_ENV` and the browser uses `NODE_ENV`.
- `SENTRY_TRACES_SAMPLE_RATE` and `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`: optional values from `0` to `1`. Defaults are `1.0` in development and `0.1` in production. Invalid values safely fall back to these defaults.
- `SENTRY_RELEASE` and `NEXT_PUBLIC_SENTRY_RELEASE`: optional release identifier to correlate browser and server events with a deployment.
- `SENTRY_ORG`, `SENTRY_PROJECT`, and `SENTRY_AUTH_TOKEN`: build-time settings for uploading source maps. The auth token is secret and must never use a `NEXT_PUBLIC_*` name. Source-map upload is skipped when build credentials are absent.

Set the `NEXT_PUBLIC_*` variables before running `npm run build`; Next.js embeds public environment variables into the browser bundle at build time. Sentry v11 has more permissive collection defaults, so the shipped configuration explicitly disables user information, cookies, request/response headers and bodies, URL query parameters, GenAI inputs/outputs, database query data, queues, and GraphQL documents/variables. Sentry request-error reporting is composed with the existing Axiom request-error hook, rather than replacing it.

## Checks

- `npm run test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run check`

## Production runtime and scheduled maintenance

This repository builds as a standard Next.js application for a Node.js-compatible hosting environment. Run `npm run build` to create the production build and `npm start` to serve it.

The background booking sweep is exposed at `GET /api/jobs/sweep`. Configure an external scheduler to call this endpoint at the intended interval with the header `Authorization: Bearer <CRON_SECRET>`. In production, configure `CRON_SECRET` as a server-side secret. The repository does not provision a hosting provider or scheduler.

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

Canvas connects the Free, Starter, Elite, Pro, and Plus plan entitlements to Razorpay Checkout. Paid plans add the GST rate configured in MongoDB to the trusted base plan price before the Razorpay order is created. The server creates the Razorpay order from the trusted plan definition, validates the returned signature, confirms the payment is captured, and then activates the paid plan for one month. Razorpay webhook events are also accepted at `/api/webhooks/razorpay` for server-side reconciliation. Razorpay recommends server-side order creation, signature validation, payment-status verification, and HMAC validation for webhooks. citeturn731333search0turn318613search5

Required environment variables:

```
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
```

Platform legal/tax details are stored in the MongoDB `PlatformSettings` singleton and managed from `/admin/platform-settings`. New invoices snapshot the legal merchant identity and GST treatment at capture time; completed invoice snapshots are not silently rewritten later.

The runtime environment only contains service/application credentials. The platform legal name, website, billing email, phone, tax ID, GSTIN, SAC code, registered address, and GST treatment are database data. The Canvas brand mark is bundled locally as /favicon.svg and is used by the favicon, landing page, admin console, public scheduling shell, dashboard billing UI, and invoices/PDFs.

For local development use Razorpay Test Mode credentials. For a production deployment, configure the Live Mode credentials as server-side environment secrets and configure the Razorpay webhook URL as:

`https://YOUR_DOMAIN/api/webhooks/razorpay`

Do not copy the demo values into a real production environment. Replace them with the real environment-specific values before production.

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

Tenant companies are the **customers/billing subjects**. Canvas is the product. AlgoQuit is the company operating the service and merchant for paid plans. Payments use AlgoQuit's Razorpay credentials and merchant identity; funds are collected by the AlgoQuit merchant account, not a tenant's own payment account.

The payment flow is:
- The signed-in company owner/admin chooses a trusted Canvas plan.
- The server creates the Razorpay order using the server-side plan price and AlgoQuit merchant metadata.
- Razorpay Checkout displays **AlgoQuit** as the merchant and the paying company as the prefilled customer.
- Signature, order, amount, currency, and captured status are verified server-side.
- Webhook reconciliation can safely retry, including successful retries after a failed payment attempt.
- Payment activation, invoice creation, subscription changes, and workspace plan state are idempotent.
- The successful result page is `/billing/result` and is company-scoped; it shows AlgoQuit merchant branding plus the paying company's name, short description, and logo.

For the Razorpay account itself, the legal merchant/business identity, settlement account, checkout branding, and statement descriptor must also be configured in the Razorpay account managed by AlgoQuit. Application code cannot change the Razorpay account holder or settlement account.
## Task management module (feature-gated)

Task Management is a separate feature module within the existing Next.js application. UI pages live under `app/dashboard/tasks` and `components/task-management`; route handlers live under `app/api/tasks`; business logic lives under `features/task-management/server`; MongoDB documents live under `models/task*`.

The global platform-admin read-only view lives under `/api/admin/task-management/tasks`. Tenant task APIs always derive company/workspace scope from the authenticated session and active membership; they do not accept a client-supplied company ID to choose the tenant. Global cross-company reads are restricted to platform administrators.

The `taskManagementEnabled` entitlement is configurable in the platform admin plan editor. It is captured in checkout and subscription entitlement snapshots. Plan edits intentionally do not rewrite existing subscription snapshots; the new configuration applies to new purchases/renewals. A company whose effective entitlement is disabled receives `403 FEATURE_NOT_IN_PLAN` from task APIs.

### Task API route map

| Method | Route | Purpose |
| --- | --- | --- |
| GET, POST | `/api/tasks` | List visible tasks; create a task with one or more assignees |
| GET, PATCH | `/api/tasks/:taskId` | Read task details; update task metadata |
| POST | `/api/tasks/:taskId/assignments` | Assign additional active employees |
| DELETE | `/api/tasks/:taskId/assignments/:assignmentId` | Remove an unfinished assignment |
| PATCH | `/api/tasks/:taskId/status` | Update the current user's assignment status (or a target assignment for managers) |
| GET | `/api/tasks/:taskId/activity` | Read a tenant-scoped activity timeline |
| GET | `/api/tasks/notifications` | Poll notifications for the current recipient only |
| PATCH | `/api/tasks/notifications/:notificationId` | Mark the current user's notification as read |
| GET | `/api/admin/task-management/tasks` | Platform-admin list across all companies |
| GET | `/api/admin/task-management/tasks/:taskId` | Platform-admin cross-company task detail |

Every task query and mutation is company/workspace-scoped, and assignees must have an active membership in the same workspace. Notification rows carry a recipient ID and the notification feed is filtered server-side so users cannot read other users' alerts. The authenticated in-app notification endpoint remains available; desktop browser notifications are intentionally not supported.

## Security

Do not commit real production secrets. Google refresh tokens, application secrets, Redis credentials, database credentials, billing secrets, and email provider keys must stay server-side.

The demo environment reference is intentionally documented in `.env.example.md`; those values are for the demo configuration only and must be replaced before real production use.


## Public embedded feedback

Company owners and administrators can open `/dashboard?panel=feedback`, select **Public embed**, and copy a company-specific iframe snippet for another website. Visitors need no Canvas account; the embedded form requires name, email, phone, a 1–5 star rating, and a written review. Public embed API and UI boundaries are documented in [`features/public-feedback/README.md`](./features/public-feedback/README.md). New submissions stay private until a company owner or administrator publishes them. The public widget receives only approved display fields, never the reviewer's email or phone.

Application action sounds are enabled automatically. Since browsers restrict audio before the first user gesture, the root sound handler attempts to unlock audio on the first normal click, tap, or key press; employees do not need a separate sound setting.


## Production resource guardrails

The application uses a small MongoDB connection pool per running instance, bounded task/history query pages, short-lived/capped availability caching, single-flight Google access-token refresh, capped Google Calendar free/busy concurrency, a bounded queue for uncached availability calculations, and bounded batches for the booking maintenance sweep. Browser polling is throttled while tabs are hidden.

Desktop notifications and Web Push delivery have been removed. A temporary service worker at `/sw.js` unregisters older notification workers and unsubscribes their push subscriptions; it does not display notifications. The task notification API remains available to authenticated, tenant-scoped in-app clients.

Availability results are advisory and cached briefly to reduce repeated Google Calendar reads. Booking submission still revalidates availability and capacity server-side. When the application is saturated, the availability endpoint can return HTTP 503 so clients retry later instead of expanding unbounded work.




## Redis production behavior

MongoDB remains the source of truth. Redis holds only short-lived coordination keys and an advisory availability cache; it is not the durable store for company/member records, bookings, meeting records, chat messages, tasks, notifications, payments, or audit logs.

Current Redis usage:

- `canvas:availability:v1:<companyId>:<date>:<duration>:<buffers>:<capacity>` — serialized availability results with a 75-second Redis TTL. Booking submission rechecks capacity and eligibility, so this cache is advisory only.
- `booking:create:*`, `booking:accept:*`, `booking:respond:*`, `meeting:end:*`, `meeting:finalize:*` and `booking:sweep:*` — short-lived distributed locks that protect state transitions and overlapping maintenance work.
- `live-chat:create:<companyId>` — a short-lived lock to prevent concurrent creation of duplicate open conversations for the same company.

Use a dedicated Redis database for this app. Existing distributed lock key names are intentionally preserved for compatibility while old and new application revisions overlap during a rolling deployment.

Production must configure `REDIS_URL` (or `UPSTASH_REDIS_REST_URL`) and the server-only REST token (`REDIS_TOKEN` or `UPSTASH_REDIS_REST_TOKEN`). The health endpoint pings Redis. Lock-protected operations fail with HTTP 503 in production when Redis is unconfigured or unavailable; development can still run without Redis. Availability caching remains best-effort and falls back to calculating availability without Redis.

Task lists, dashboard data, admin reports and live-chat transcripts are not currently cached in Redis. Do not cache these indiscriminately: tenant scope, permission/entitlement changes, and freshness requirements must be addressed before adding each cache.


## Canonical access roles

Canvas has exactly four canonical application roles: `PLATFORM_ADMIN`, `COMPANY_ADMIN`, `EMPLOYEE`, and `CUSTOMER`. Company and workspace APIs enforce authorization server-side and require an explicit role allowlist plus an active membership in the requested company/workspace. `COMPANY_OWNER` is only recognized as a legacy database value so it can be migrated to `COMPANY_ADMIN`; it is not an application permission.

Before deploying this role hardening to an existing database, back up the database and run `npm run roles:migrate` with the intended `MONGODB_URI`. The migration reports any user or membership records with unsupported role values and fails closed if any remain. Do not run it against the wrong database.


## Company Vault (Bunny.net Storage)

The company-scoped document vault is available at `/dashboard/vault` only when the company's active plan includes Cloud vault. It supports nested folders, folder rename/delete, chunked multi-file uploads, authenticated downloads and safe previews, plan-enforced company-wide quotas, and recursive folder deletion. Every API derives tenant scope from the authenticated company/workspace session.

Set server-only `BUNNY_STORAGE_ZONE` and `BUNNY_STORAGE_PASSWORD`; optionally configure `BUNNY_STORAGE_ENDPOINT`. Plan-based storage quotas and maximum file sizes are configured under Admin → Plans. Uploads use sequential 3 MiB chunks, and completed files are streamed from Bunny staging objects into the final object without buffering the full file in application RAM. The absolute per-file hard cap is 250 MiB and upload batches are limited to 25 files. Do not put Bunny credentials in any `NEXT_PUBLIC_*` variable. Use a dedicated Storage Zone **not connected to a public Pull Zone**. See [the Company Vault guide](./features/company-vault/README.md).


## Company Cloud Vault

The Company Vault is an optional plan entitlement. Platform admins enable it per plan and configure the exact per-company storage quota, maximum file size, and maximum stored item count. The server enforces access, byte quota, item reservations, and the global file cap; companies without the entitlement are denied vault API access. See the Company Vault operations and security guide at features/company-vault/README.md. Platform admins can review company-by-company usage at /admin/vault-usage.
