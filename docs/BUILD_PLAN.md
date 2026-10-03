# Conventus Build Plan

## Phase 1 — Foundation (current)

Acceptance criteria:
- Next.js 16 Active LTS application shell.
- Responsive marketing landing page.
- Canonical company route: /[companySlug].
- Canonical meeting route: /[companySlug]/meet/[meetingId].
- MongoDB connection primitive.
- Redis connection primitive.
- Core Mongoose models and indexes.
- Booking state machine.
- Plan entitlement definitions.
- Health endpoint.
- Google OAuth start/callback boundary.
- CI typecheck, lint and production build.

## Phase 2 — Identity and tenancy

Build:
- Google OAuth code exchange and OpenID identity verification.
- Secure session management.
- Encrypted refresh-token storage.
- User/company/workspace creation.
- Company owner, admin, employee and customer roles.
- Membership authorization and tenant isolation.
- Company onboarding and employee invitation flow.

## Phase 3 — Scheduling engine

Build:
- Meeting types.
- Company and employee availability rules.
- Google Calendar free/busy integration.
- Public customer booking UI.
- Booking request persistence.
- Five-minute server deadline.
- Employee offers.
- Safe accept/decline race handling.
- Retry routing.
- Monthly and concurrent usage enforcement.

## Phase 4 — Google meetings

Build:
- Google Meet space creation using employee-authorized credentials.
- Calendar event creation.
- Idempotent external operations.
- Meeting readiness state.
- Company-scoped /[companySlug]/meet/[meetingId].
- Supported Google Meet web meeting/embedding surface verification.
- Realtime status updates.
- Failure recovery for Meet and Calendar separately.

## Phase 5 — SaaS operations

Build:
- Paid subscriptions.
- Usage billing.
- Emails/reminders.
- Admin console.
- Audit events.
- Rate limiting.
- Abuse controls.
- Monitoring and alerting.
- Job retry/dead-letter handling.
- Data export and deletion flows.

## Phase 6 — Scale and reliability

Build:
- Load tests for booking spikes and concurrent acceptance.
- Queue capacity tuning.
- Redis production tier when required.
- MongoDB capacity planning and backup/restore drills.
- Service-level objectives.
- Distributed tracing/correlation IDs.
- Regional strategy only when traffic requires it.
- Disaster recovery runbooks.
