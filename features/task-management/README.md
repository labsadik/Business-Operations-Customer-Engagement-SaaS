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

## Kanban, Scrum, and live updates

- The task dashboard offers Kanban, Scrum canvas, and list views. Scrum sprint metadata is persisted per active company/workspace in the `TaskBoard` collection.
- Sprint writes are restricted to company administrators and platform administrators, validated on the server, and constrained to the authenticated tenant scope.
- In self-hosted Node.js development and production, `server.mjs` runs Next.js and the WebSocket upgrade handler on the same `PORT` (development defaults to `3000`). No second WebSocket port is opened.
- Authenticated clients request a short-lived HMAC-signed ticket from `GET /api/tasks/realtime-ticket` and present it as a WebSocket subprotocol. Events include only change metadata and are delivered only to subscribers in the same company and workspace.
- Polling remains enabled as a recovery path. Vercel serverless deployments return the polling-only capability because they do not run the repository's long-lived custom Node.js upgrade handler; deploy the custom Node server on a persistent Node host (such as the included Cloud Run container) to enable the socket.

