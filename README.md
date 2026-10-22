# Canvas — Business Operations & Customer Engagement SaaS

Canvas is a multi-tenant Software-as-a-Service (SaaS) platform for organizations that need one place to coordinate employees, manage internal work, and serve customers. It supports business-to-business use: each customer organization operates in its own workspace, with company-scoped members, workflows, and configurable feature access.

The application combines customer meeting scheduling, collaborative visual planning, task management, a private company vault, website live chat, embedded customer feedback, subscriptions, and platform-level administration.

## Product screenshots

The following screenshots show examples of the application's workspace, canvas, scheduling, and related interfaces.

### Workspace and scheduling

![Workspace interface](https://ik.imagekit.io/xvqovhmcyr/canvas/Workspace%20_%20Conventus%20-%20Google%20Chrome%2010_6_2026%2011_15_55%20AM.png)

![Workspace view](https://ik.imagekit.io/xvqovhmcyr/canvas/Workspace%20_%20Conventus%20-%20Google%20Chrome%2010_6_2026%2011_16_11%20AM.png)

![Workspace overview](https://ik.imagekit.io/xvqovhmcyr/canvas/Workspace%20_%20Conventus%20-%20Google%20Chrome%2010_6_2026%2011_20_54%20AM.png)

![Scheduling interface](https://ik.imagekit.io/xvqovhmcyr/canvas/Conventus%20_%20Connect.%20Schedule.%20Meet.%20-%20Google%20Chrome%2010_6_2026%2011_20_58%20AM.png)

![Meeting interface](https://ik.imagekit.io/xvqovhmcyr/canvas/Conventus%20_%20Connect.%20Schedule.%20Meet.%20-%20Google%20Chrome%2010_6_2026%2011_21_18%20AM.png)

### Canvas and application views

![Collaborative workspace canvas](https://ik.imagekit.io/xvqovhmcyr/canvas/Workspace%20_%20Canvas%20by%20AlgoQuit%20-%20Google%20Chrome%2010_22_2026%206_55_06%20PM.png)

![Canvas workspace](https://ik.imagekit.io/xvqovhmcyr/canvas/Workspace%20_%20Canvas%20by%20AlgoQuit%20-%20Google%20Chrome%2010_22_2026%206_55_22%20PM.png)

![Canvas workspace detail](https://ik.imagekit.io/xvqovhmcyr/canvas/Workspace%20_%20Canvas%20by%20AlgoQuit%20-%20Google%20Chrome%2010_22_2026%206_55_26%20PM.png)

![Canvas project view](https://ik.imagekit.io/xvqovhmcyr/canvas/Workspace%20_%20Canvas%20by%20AlgoQuit%20-%20Google%20Chrome%2010_22_2026%206_56_57%20PM.png)

![Canvas workspace view](https://ik.imagekit.io/xvqovhmcyr/canvas/Workspace%20_%20Canvas%20by%20AlgoQuit%20-%20Google%20Chrome%2010_22_2026%206_57_04%20PM.png)

![Canvas editor](https://ik.imagekit.io/xvqovhmcyr/canvas/Workspace%20_%20Canvas%20by%20AlgoQuit%20-%20Google%20Chrome%2010_22_2026%207_00_02%20PM.png)

![Canvas view](https://ik.imagekit.io/xvqovhmcyr/canvas/Workspace%20_%20Canvas%20by%20AlgoQuit%20-%20Google%20Chrome%2010_22_2026%207_00_14%20PM.png)

![Canvas project workspace](https://ik.imagekit.io/xvqovhmcyr/canvas/Workspace%20_%20Canvas%20by%20AlgoQuit%20-%20Google%20Chrome%2010_22_2026%207_01_49%20PM.png)

![Live application view](https://ik.imagekit.io/xvqovhmcyr/canvas/test%20-%20Stream%20-%20Axiom%20-%20Google%20Chrome%2010_6_2026%2011_21_31%20AM.png)

## Key features

### 1. Customer meeting scheduling

- Companies can publish a company-scoped booking page for customers.
- Customers can sign in with Google, choose an available date, time, and meeting duration, and submit a meeting request.
- Google Calendar availability is checked before a booking is confirmed.
- The assignment engine offers eligible requests to available employees with a five-minute acceptance window.
- If an eligible employee accepts, the application creates the Google Meet space and Google Calendar event and returns the confirmation to the customer.
- If no employee is available or the request is not accepted in time, the customer can wait, try again, or choose another available time instead of receiving a false confirmation.
- Meeting pages are scoped to the relevant company, keeping each organization's meeting routes separate.

### 2. Collaborative live canvas

Teams can use a shared, visual canvas to plan and collaborate on complex work. Employees can work together on diagrams and designs such as:

- Database schemas and data flows
- Software and system architecture
- Project structures and technical workflows
- Other visual planning and design tasks

Multiple authorized employees can collaborate on the same canvas, making it useful for distributed teams and collaborative project design.

### 3. Task management

The task management module helps teams track work from creation through completion. It includes:

- Kanban, Scrum canvas, and list views
- Task creation, task details, assignments, and activity history
- Workflow statuses such as To do, In progress, Completed, Cancelled, and Blocked
- Support for assigning work to multiple active employees in the same workspace
- In-app notifications and read status
- Scrum sprint name, goal, dates, and lifecycle management
- Application action sounds for relevant task events; browsers may require an initial user interaction before audio can play
- Company/workspace-scoped task access, with platform-wide task views restricted to platform administrators

Task management is controlled through the platform's feature-entitlement settings. Availability depends on the effective entitlement assigned to the company.

### 4. Private Company Vault

The Company Vault gives each eligible organization a private place to store and manage documents and other files.

- Nested folders, including folder rename and deletion
- Multi-file uploads using chunked transfers
- Authenticated downloads and supported previews
- Company-specific storage quotas, file-size limits, and item-count limits
- Recursive folder deletion
- Server-side enforcement of company scope and storage entitlements
- Administrative usage visibility by company

Uploads use sequential 3 MiB chunks. Each file has a hard maximum size of 250 MiB, and each upload batch is limited to 25 files. Actual company quotas and plan limits are configurable by platform administrators.

The vault is designed around protected file transfer, controlled access, and encrypted storage/retrieval flows. Access is limited to authenticated, authorized users. The exact encryption and key-management behavior depends on the deployed implementation; strict zero-knowledge end-to-end encryption should only be claimed when the server cannot access plaintext or the decryption keys.

### 5. Website live chat

Companies can connect a website visitor chat experience to their workspace using an embeddable link or widget.

- Visitors can start a live chat from the company's website.
- Incoming conversations appear in the company's application workspace.
- Authorized employees can respond to customer conversations.
- A conversation is not tied permanently to one employee being online; another eligible employee can help handle it when needed.
- Server-side coordination helps prevent duplicate open conversations from being created simultaneously for the same company.

### 6. Embedded customer feedback and reviews

Companies can add a company-specific feedback form to an external website using an embeddable iframe snippet.

- Visitors do not need a Canvas account to submit feedback.
- The form collects a name, email address, phone number, a one-to-five-star rating, and a written review.
- New submissions remain private until a company owner or administrator publishes them.
- The public widget exposes only approved display fields; reviewer email addresses and phone numbers are not sent to the public display widget.
- Company owners and administrators can access the embed setup from the dashboard's feedback area.

### 7. Subscriptions and billing integration

The platform integrates with Razorpay Checkout for subscription payments. The server uses trusted plan definitions when creating orders, validates payment signatures and payment status, and accepts webhook events for reconciliation. Payment activation, invoice creation, subscription changes, and workspace entitlement updates are designed to be idempotent.

Plan names, demo pricing, and sample price tables are intentionally not published in this README. The platform's configurable entitlements may include feature access, employee limits, usage limits, storage quotas, maximum file sizes, and maximum stored items.

### 8. Platform administration and organization-level controls

Platform administrators can administer the SaaS across its customer organizations. Depending on the configured permissions and entitlements, administrative controls include:

- Creating, granting, or revoking platform administrator access, with audit events
- Reviewing and managing customer companies and their workspaces
- Opening a company-specific management scope to work with that company's dashboard, team, announcements, profile, and scheduling areas
- Configuring subscription plan entitlements and deciding which features are available to each plan
- Controlling feature availability and company-level limits, including task-management access and vault quotas
- Reviewing company vault usage
- Accessing platform-wide task records through protected, read-only administration endpoints
- Reviewing platform and operational settings, including billing/legal settings stored in the database

Company and workspace operations remain tenant-scoped. A company's ordinary users cannot select another company by supplying a different company ID to an API. Platform administration is protected by server-side role checks and audit controls; administrative management mode does not change the administrator's underlying platform role, and billing checkout remains disabled while managing a company in that mode.

## Technology stack

| Area | Technology / approach |
| --- | --- |
| Application | Next.js and Node.js-compatible runtime |
| Server APIs | Next.js route handlers / API endpoints |
| Primary database | MongoDB |
| Coordination and short-lived cache | Redis, including Upstash Redis REST support |
| Hosting | Google Cloud Run |
| Build and deployment | Google Cloud Build and deployment script |
| Scheduled maintenance | Google Cloud Scheduler |
| Server-side secret storage | Google Secret Manager |
| Identity | Google OAuth |
| Scheduling and meetings | Google Calendar API and Google Meet integration |
| File storage | Bunny.net Storage |
| Subscription payments | Razorpay Checkout and webhooks |
| Error monitoring | Optional Sentry integration, alongside existing Axiom/console logging |

## Architecture and data isolation

- **MongoDB is the source of truth** for durable application records, including organizations, users, memberships, bookings, meetings, tasks, notifications, payments, and audit history.
- **Redis is not the system of record.** It is used for short-lived coordination, distributed locks, advisory availability caching, and related low-latency operations.
- **Availability is revalidated on the server.** Cached availability is advisory; booking submission checks current eligibility and capacity again.
- **Booking and meeting state changes are server-authoritative.** Creation and acceptance paths use idempotency and coordination to protect against duplicate actions.
- **Tenant isolation is enforced server-side.** Queries and mutations are scoped to the authenticated user's company/workspace and active membership.
- **Background maintenance is scheduled.** The booking sweep is available at `GET /api/jobs/sweep` and must be called with `Authorization: Bearer <CRON_SECRET>`.
- **Public and private routes have separate authorization boundaries.** Public booking and embed experiences do not grant access to private company dashboards or unrelated tenant data.
- **Secrets stay on the server.** Database credentials, Redis tokens, Google refresh tokens, payment secrets, and other private credentials must never be exposed through `NEXT_PUBLIC_*` variables.

Redis currently holds short-lived availability entries and coordination locks for booking state transitions, meeting finalization, maintenance sweeps, and live-chat conversation creation. Durable records remain in MongoDB. If Redis is unavailable in production, lock-protected operations fail safely rather than proceeding without coordination; availability calculation can fall back to a non-cached calculation.

## Application roles

Canvas uses four canonical application roles:

- `PLATFORM_ADMIN` — platform-wide administrative permissions
- `COMPANY_ADMIN` — administration within the user's company/workspace
- `EMPLOYEE` — employee access within an active company/workspace membership
- `CUSTOMER` — customer-facing product access

Authorization is checked on the server. A legacy `COMPANY_OWNER` database role may exist in older installations and should be migrated to `COMPANY_ADMIN` before deploying role-hardening changes.

## Local development

### Prerequisites

- Node.js compatible with the project's Next.js runtime
- npm
- Access to the required development services and provider credentials, such as MongoDB, Redis, Google OAuth/Calendar/Meet, and any enabled storage or billing integrations

### Setup

1. Use [`.env.example.md`](./.env.example.md) as the reference for local environment variables. This Markdown file is documentation only; Next.js does not load it as an environment file.
2. Create a real `.env.local` file in the repository root and fill in your development values.
3. Install dependencies:

   ```bash
   npm install
   ```

4. Start the development server:

   ```bash
   npm run dev
   ```

5. Open `http://localhost:3000` in your browser.

Do not commit `.env.local`, real credentials, provider tokens, or production secrets.

## Production deployment on Google Cloud Run

The repository includes a deployment script for Google Cloud Run. Before using it, configure the target Google Cloud project, billing, IAM permissions, external services, domain and DNS, OAuth consent/callback settings, and payment callback/webhook settings.

1. Copy `cloudrun.env.example` to a local `.env` file and fill in the environment-specific configuration. Keep secret values local and out of version control.
2. Review the Cloud Run deployment guide: [`docs/DEPLOY_GCP_CLOUD_RUN.md`](./docs/DEPLOY_GCP_CLOUD_RUN.md).
3. Deploy from PowerShell:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\deploy-cloud-run.ps1
   ```

The deployment script builds through Cloud Build, places server credentials in Secret Manager, deploys a scale-to-zero Cloud Run service, and configures three Cloud Scheduler maintenance jobs. The target project, IAM permissions, DNS, OAuth configuration, and provider-side settings must still be valid for the deployment to operate correctly.

For a conventional Node.js-compatible production runtime, build and start the application with:

```bash
npm run build
npm start
```

### Required production configuration

Use the example environment files and deployment guide as the canonical, repository-specific configuration reference. At a minimum, review and securely configure the following areas before serving real customers:

- MongoDB connection details
- Redis URL and server-only Redis token
- Google OAuth credentials and the required Calendar/Meet access
- Bunny.net Storage Zone and server-only storage password, if the Company Vault is enabled
- Razorpay live credentials and webhook secret, if paid subscriptions are enabled
- `CRON_SECRET` for the scheduled booking sweep
- Public application URL and provider callback URLs
- Optional Sentry and other monitoring settings

Redis can be configured with `REDIS_URL` or `UPSTASH_REDIS_REST_URL` and its corresponding server-only token (`REDIS_TOKEN` or `UPSTASH_REDIS_REST_TOKEN`). Production must not expose these credentials to the browser.

For Bunny.net Storage, set `BUNNY_STORAGE_ZONE` and `BUNNY_STORAGE_PASSWORD` on the server; `BUNNY_STORAGE_ENDPOINT` is optional. Use a dedicated Storage Zone that is not connected to a public Pull Zone, and never store Bunny credentials in a `NEXT_PUBLIC_*` variable.

For Razorpay, configure `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` as server-side environment secrets. Configure the webhook in the Razorpay dashboard to point to:

```text
https://<your-domain>/api/webhooks/razorpay
```

Use test-mode credentials for development and the appropriate live credentials for production. Replace every example value with the matching environment-specific configuration.

## Maintenance and operational notes

### Booking sweep

The scheduled maintenance endpoint is `GET /api/jobs/sweep`. The scheduler must send the header `Authorization: Bearer <CRON_SECRET>`. Keep `CRON_SECRET` server-side and configure the intended schedule in the deployment environment.

### Monitoring

Sentry is optional. Configure `NEXT_PUBLIC_SENTRY_DSN` for browser reporting and `SENTRY_DSN` for server/edge reporting. Optional settings include environment labels, trace sampling, release identification, and source-map upload credentials. Source-map upload credentials must be kept secret and must not use a `NEXT_PUBLIC_*` variable. When Sentry is not configured, existing Axiom/console logging remains available.

### Database role migration

Before applying role hardening to an existing database:

1. Back up the intended MongoDB database.
2. Confirm that `MONGODB_URI` points to that database.
3. Run:

   ```bash
   npm run roles:migrate
   ```

The migration reports unsupported user or membership roles and fails closed if any remain. Do not run it against the wrong database.

### Initial platform administrator

Use the provided bootstrap command with the email address of the existing account that should become a platform administrator:

```bash
npm run admin:create -- admin@example.com
```

The standalone admin CLI reads `.env.local` first and then `.env`. After the first administrator is created, platform-admin access can be managed through the administration interface. Grants and revocations are audited, self-demotion is blocked, and the last active platform administrator cannot be removed.

### Resource and availability behavior

The application uses bounded database connection pools and query pages, short-lived availability caching, capped Google Calendar free/busy concurrency, bounded background batches, and throttled browser polling when tabs are hidden. Availability cache results are advisory and are checked again when a booking is submitted. Under saturation, the availability endpoint may return HTTP `503` so clients can retry rather than creating unbounded work.

Desktop notifications and Web Push delivery are not supported in the current implementation. Authenticated in-app task notifications remain available. Older notification service workers are unregistered by a temporary service worker.

## Validation and quality checks

Run the repository's checks before releasing a new build:

```bash
npm run test
npm run typecheck
npm run lint
npm run build
npm run check
```

Load, smoke, and quality testing should be verified against the exact release candidate and deployment configuration. Keep the corresponding test reports with the release records; a successful local build alone does not verify external credentials, DNS, OAuth callbacks, payment webhooks, scheduled jobs, or production capacity.

## Further documentation

- [Local environment reference](./.env.example.md)
- [Google Cloud Run deployment guide](./docs/DEPLOY_GCP_CLOUD_RUN.md)
- [Company Vault guide](./features/company-vault/README.md)
- [Public feedback embed guide](./features/public-feedback/README.md)

## Proprietary Commercial Source License — Important Notice

Canvas is proprietary software distributed under the license included in this repository. **The included `LICENSE` file is the governing license and must be read before accessing, using, modifying, or distributing this software.** This README is a summary, not a replacement for the license.

Unless the included license expressly grants written permission, no person or company may copy, clone, reproduce, redistribute, resell, sublicense, publish, or create derivative works from this codebase or use its protected implementation for commercial purposes. Do not remove ownership notices or treat access to this repository as permission to reuse the software.

Unauthorized copying, redistribution, resale, or use of protected code may lead to enforcement action, including legal action where permitted by the governing license and applicable law. All rights not expressly granted by the included license are reserved.
