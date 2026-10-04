import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  isValidSupportTicketStatusTransition,
  supportTicketStatusLabel,
  validateSupportTicketInput,
  validateSupportTicketStatus
} from "../lib/support-tickets.ts";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

test("support ticket input enforces required fields and bounded lengths", () => {
  assert.deepEqual(
    validateSupportTicketInput("Calendar sync problem", "Google Calendar availability is incorrect."),
    {
      subject: "Calendar sync problem",
      description: "Google Calendar availability is incorrect."
    }
  );
  assert.throws(() => validateSupportTicketInput("", "problem"), /SUPPORT_TICKET_SUBJECT_REQUIRED/);
  assert.throws(() => validateSupportTicketInput("subject", ""), /SUPPORT_TICKET_DESCRIPTION_REQUIRED/);
  assert.throws(() => validateSupportTicketInput("x".repeat(121), "problem"), /SUPPORT_TICKET_SUBJECT_TOO_LONG/);
  assert.throws(() => validateSupportTicketInput("subject", "x".repeat(2001)), /SUPPORT_TICKET_DESCRIPTION_TOO_LONG/);
});

test("support ticket statuses are stable and transition explicitly", () => {
  assert.equal(validateSupportTicketStatus("NOT_SEEN"), "NOT_SEEN");
  assert.equal(validateSupportTicketStatus("PROCESSING"), "PROCESSING");
  assert.equal(validateSupportTicketStatus("COMPLETED"), "COMPLETED");
  assert.throws(() => validateSupportTicketStatus("OPEN"), /SUPPORT_TICKET_STATUS_INVALID/);

  assert.equal(isValidSupportTicketStatusTransition("NOT_SEEN", "PROCESSING"), true);
  assert.equal(isValidSupportTicketStatusTransition("NOT_SEEN", "COMPLETED"), true);
  assert.equal(isValidSupportTicketStatusTransition("PROCESSING", "NOT_SEEN"), true);
  assert.equal(isValidSupportTicketStatusTransition("PROCESSING", "COMPLETED"), true);
  assert.equal(isValidSupportTicketStatusTransition("COMPLETED", "PROCESSING"), true);
  assert.equal(isValidSupportTicketStatusTransition("COMPLETED", "NOT_SEEN"), false);

  assert.equal(supportTicketStatusLabel("NOT_SEEN"), "Not seen");
  assert.equal(supportTicketStatusLabel("PROCESSING"), "Processing");
  assert.equal(supportTicketStatusLabel("COMPLETED"), "Completed");
});

test("company ticket creation derives identity and tenant scope from active membership", () => {
  const route = source("app/api/company/support-tickets/route.ts");
  assert.match(route, /getSession()/);
  assert.match(route, /"COMPANY_OWNER", "COMPANY_ADMIN", "EMPLOYEE"/);
  assert.match(route, /companyId: session.companyId/);
  assert.match(route, /userId: session.userId/);
  assert.match(route, /active: true/);
  assert.match(route, /role: session.role/);
  assert.match(route, /workspaceId: membership.workspaceId/);
  assert.match(route, /companyId: membership.companyId/);
  assert.match(route, /companyId: new Types.ObjectId(companyId)/);
  assert.match(route, /workspaceId: new Types.ObjectId(workspaceId)/);
  assert.match(route, /submitterUserId: new Types.ObjectId(session.userId)/);
  assert.match(route, /submitterName: session.name/);
  assert.match(route, /submitterEmail: session.email/);
  assert.doesNotMatch(route, /body?.userId|body?.companyId|body?.workspaceId|body?.companyName|body?.memberEmail|body?.memberName/);
});

test("company list and detail endpoints are tenant-scoped and read-only", () => {
  const listRoute = source("app/api/company/support-tickets/route.ts");
  const detailRoute = source("app/api/company/support-tickets/[id]/route.ts");

  assert.match(listRoute, /SupportTicket.find({[sS]*companyId: new Types.ObjectId(scope.companyId)/);
  assert.match(listRoute, /.sort({ updatedAt: -1, _id: -1 })/);
  assert.match(listRoute, /.skip((page - 1) * limit)/);
  assert.match(listRoute, /.limit(limit + 1)/);
  assert.match(detailRoute, /_id: new Types.ObjectId(id)/);
  assert.match(detailRoute, /companyId: new Types.ObjectId(session.companyId)/);
  assert.doesNotMatch(detailRoute, /PATCH|PUT|DELETE/);
});

test("company support mutations use same-origin protection, Redis locking, dedupe and rate limits", () => {
  const route = source("app/api/company/support-tickets/route.ts");
  assert.match(route, /assertSameOrigin(request)/);
  assert.match(route, /withRedisLock(/);
  assert.match(route, /SUPPORT_TICKET_DEDUPE_WINDOW_MS/);
  assert.match(route, /SUPPORT_TICKET_DUPLICATE/);
  assert.match(route, /SUPPORT_TICKET_RATE_WINDOW_MS/);
  assert.match(route, /SUPPORT_TICKET_RATE_LIMIT/);
  assert.match(route, /SUPPORT_TICKET_RATE_LIMITED/);
});

test("admin ticket inbox and status endpoint require platform admin and bounded queries", () => {
  const listRoute = source("app/api/admin/support-tickets/route.ts");
  const detailRoute = source("app/api/admin/support-tickets/[id]/route.ts");
  const shell = source("components/admin-shell.tsx");

  assert.match(listRoute, /requirePlatformAdmin()/);
  assert.match(listRoute, /SUPPORT_TICKET_STATUSES/);
  assert.match(listRoute, /companyId = params/);
  assert.match(listRoute, /.skip((page - 1) * limit)/);
  assert.match(listRoute, /.limit(limit + 1)/);
  assert.match(listRoute, /.sort({ updatedAt: -1, _id: -1 })/);

  assert.match(detailRoute, /requirePlatformAdmin()/);
  assert.match(detailRoute, /assertSameOrigin(request)/);
  assert.match(detailRoute, /validateSupportTicketStatus/);
  assert.match(detailRoute, /isValidSupportTicketStatusTransition/);
  assert.match(detailRoute, /ticket.status = nextStatus/);
  assert.match(detailRoute, /statusChangedAt/);
  assert.match(detailRoute, /statusChangedByUserId/);
  assert.match(detailRoute, /entityType: "SUPPORT_TICKET"/);
  assert.match(detailRoute, /previousStatus: currentStatus/);
  assert.match(detailRoute, /newStatus: nextStatus/);

  assert.match(shell, /href: "/admin/support-tickets"/);
  assert.match(shell, /label: "Support tickets"/);
});

test("viewing a ticket is not a status mutation and UI distinguishes all stable statuses", () => {
  const companyUi = source("components/workspace-support-tickets.tsx");
  const adminUi = source("components/admin-support-tickets.tsx");

  assert.match(companyUi, /Ticket status is managed by Conventus support/);
  assert.match(companyUi, /Opening this ticket does not change its status/);
  assert.match(companyUi, /NOT_SEEN/);
  assert.match(companyUi, /PROCESSING/);
  assert.match(companyUi, /COMPLETED/);

  assert.match(adminUi, /Opening this ticket does not change its status/);
  assert.match(adminUi, /Not seen/);
  assert.match(adminUi, /Processing/);
  assert.match(adminUi, /Completed/);
  assert.match(adminUi, /statusChangedAt/);
});

test("company support ticket UI has accessible modal controls, counters, pagination and recoverable states", () => {
  const sidebar = source("components/workspace-sidebar.tsx");
  const dashboard = source("components/workspace-dashboard.tsx");
  const ui = source("components/workspace-support-tickets.tsx");

  assert.match(sidebar, /Support tickets/);
  assert.match(sidebar, /open("support-tickets")/);
  assert.match(dashboard, /support-tickets/);
  assert.match(dashboard, /<WorkspaceSupportTickets/);

  assert.match(ui, /role="dialog"/);
  assert.match(ui, /aria-modal="true"/);
  assert.match(ui, /event.key === "Escape"/);
  assert.match(ui, /event.key !== "Tab"/);
  assert.match(ui, /document.body.style.overflow = "hidden"/);
  assert.match(ui, /maxLength={SUBJECT_MAX}/);
  assert.match(ui, /maxLength={DESCRIPTION_MAX}/);
  assert.match(ui, /{subject.length}/{SUBJECT_MAX}/);
  assert.match(ui, /{description.length}/{DESCRIPTION_MAX}/);
  assert.match(ui, /Create ticket/);
  assert.match(ui, /Submit ticket/);
  assert.match(ui, /Cancel/);
  assert.match(ui, /Your signed-in company identity and workspace are attached automatically/);
  assert.match(ui, /Previous/);
  assert.match(ui, /Next/);
  assert.match(ui, /SUPPORT_TICKET_DUPLICATE/);
  assert.match(ui, /SUPPORT_TICKET_RATE_LIMITED/);
});

test("support ticket data model is immutable for submission identity and issue content, with tenant indexes", () => {
  const model = source("models/support-ticket.ts");
  const audit = source("models/platform-audit-event.ts");

  assert.match(model, /companyId:[sS]*immutable: true/);
  assert.match(model, /workspaceId:[sS]*immutable: true/);
  assert.match(model, /submitterUserId:[sS]*immutable: true/);
  assert.match(model, /submitterName:[sS]*immutable: true/);
  assert.match(model, /submitterEmail:[sS]*immutable: true/);
  assert.match(model, /subject:[sS]*immutable: true/);
  assert.match(model, /description:[sS]*immutable: true/);
  assert.match(model, /supportTicketSchema.index({ companyId: 1, updatedAt: -1, _id: -1 })/);
  assert.match(model, /supportTicketSchema.index({ status: 1, updatedAt: -1, _id: -1 })/);
  assert.match(audit, /"SUPPORT_TICKET"/);
});
