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
- Task data refreshes through authenticated HTTP polling every 30 seconds, with additional refreshes when the dashboard becomes visible or regains focus. Standard Next.js development and production servers are sufficient; no custom server or persistent socket is required.
