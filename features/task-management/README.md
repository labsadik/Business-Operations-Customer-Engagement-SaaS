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

## Kanban, calendar, timeline, and live updates

- The task dashboard uses a Kanban board as its primary workflow, with Calendar, Timeline, and List views inside a focused work-view dialog. Scrum is not exposed in the task UI.
- Task calendar entries are grouped by due date, show a per-day task count, and identify assignees with their profile avatars. Task timeline tracks due dates, status, priority, assignees, and assignment completion.
- Work view, Team directory, and Task status are compact workspace panels that open detail dialogs. Team availability distinguishes active, on-leave, and inactive members. Status overview includes queued, in-progress, blocked/locked, review, completed, and cancelled work.
- In self-hosted Node.js development and production, `server.mjs` runs Next.js and the WebSocket upgrade handler on the same `PORT` (development defaults to `3000`). No second WebSocket port is opened.
- Authenticated clients request a short-lived HMAC-signed ticket from `GET /api/tasks/realtime-ticket` and present it as a WebSocket subprotocol. Events include only change metadata and are delivered only to subscribers in the same company and workspace.
- Local development generates a process-scoped signing secret when no suitable secret is configured; restarting the server invalidates existing development tickets. In production, configure `TASK_REALTIME_SECRET` (at least 32 characters). `AUTH_SECRET` or `NEXTAUTH_SECRET` may be used as an explicit fallback.
- Authenticated polling remains enabled as a recovery path. Vercel serverless deployments use polling because they do not run this repository's long-lived custom Node.js upgrade handler; deploy the custom Node server on a persistent Node host (such as the included Cloud Run container) for WebSocket updates.
