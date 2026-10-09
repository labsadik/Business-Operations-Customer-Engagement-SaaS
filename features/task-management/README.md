# Task Management Feature

This directory contains the Task Management feature as a cohesive module.

## Structure

- `components/` — user-facing task dashboard and its public component entry point.
- `server/` — authorization, task lifecycle services, event recording, errors, and pagination.
- `shared/` — task status/priority definitions and input validation shared between client and server.

## Boundaries

- Keep database access, authorization, and tenant scoping in server-side routes/services.
- Keep user input validation shared where it is safe to run on both client and server.
- Keep feature-specific UI and interaction logic inside this feature; put genuinely reusable workspace primitives in `components/`.
- Import the dashboard through `@/features/task-management/components`.
- Keep company/workspace filters and membership/entitlement checks enforced server-side. Client visibility is not an authorization control.

## Verification

Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` before merging changes to this feature.
