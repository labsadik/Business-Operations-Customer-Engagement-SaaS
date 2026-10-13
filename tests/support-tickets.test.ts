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

function has(text: string, value: string) {
  assert.ok(text.includes(value), `Expected source to contain: ${value}`);
}

function lacks(text: string, value: string) {
  assert.equal(text.includes(value), false, `Expected source to omit: ${value}`);
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
  has(route, "getSession()");
  has(route, '"COMPANY_ADMIN", "EMPLOYEE"');
  has(route, "companyId: session.companyId");
  has(route, "userId: session.userId");
  has(route, "active: true");
  has(route, "role: session.role");
  has(route, "String(membership.workspaceId)");
  has(route, "companyId: membership.companyId");
  has(route, "companyId: new Types.ObjectId(companyId)");
  has(route, "workspaceId: new Types.ObjectId(workspaceId)");
  has(route, "submitterUserId: new Types.ObjectId(session.userId)");
  has(route, "submitterName: session.name");
  has(route, "submitterEmail: session.email");
  lacks(route, "body?.userId");
  lacks(route, "body?.companyId");
  lacks(route, "body?.workspaceId");
  lacks(route, "body?.companyName");
  lacks(route, "body?.memberEmail");
  lacks(route, "body?.memberName");
});

test("company list and detail endpoints are tenant-scoped and read-only", () => {
  const listRoute = source("app/api/company/support-tickets/route.ts");
  const detailRoute = source("app/api/company/support-tickets/[id]/route.ts");

  has(listRoute, "SupportTicket.find({");
  has(listRoute, "companyId: new Types.ObjectId(scope.companyId)");
  has(listRoute, ".sort({ updatedAt: -1, _id: -1 })");
  has(listRoute, ".skip((page - 1) * limit)");
  has(listRoute, ".limit(limit + 1)");
  has(detailRoute, "_id: new Types.ObjectId(id)");
  has(detailRoute, "companyId: new Types.ObjectId(session.companyId)");
  lacks(detailRoute, "export async function PATCH");
  lacks(detailRoute, "export async function PUT");
  lacks(detailRoute, "export async function DELETE");
});

test("company support mutations use same-origin protection, Redis locking, dedupe and rate limits", () => {
  const route = source("app/api/company/support-tickets/route.ts");
  has(route, "assertSameOrigin(request)");
  has(route, "withRedisLock(");
  has(route, "SUPPORT_TICKET_DEDUPE_WINDOW_MS");
  has(route, "SUPPORT_TICKET_DUPLICATE");
  has(route, "SUPPORT_TICKET_RATE_WINDOW_MS");
  has(route, "SUPPORT_TICKET_RATE_LIMIT");
  has(route, "SUPPORT_TICKET_RATE_LIMITED");
});

test("admin ticket inbox and status endpoint require platform admin and bounded queries", () => {
  const listRoute = source("app/api/admin/support-tickets/route.ts");
  const detailRoute = source("app/api/admin/support-tickets/[id]/route.ts");
  const shell = source("components/admin-shell.tsx");

  has(listRoute, "requirePlatformAdmin()");
  has(listRoute, "SUPPORT_TICKET_STATUSES");
  has(listRoute, "companyId = params.get");
  has(listRoute, ".skip((page - 1) * limit)");
  has(listRoute, ".limit(limit + 1)");
  has(listRoute, ".sort({ updatedAt: -1, _id: -1 })");

  has(detailRoute, "requirePlatformAdmin()");
  has(detailRoute, "assertSameOrigin(request)");
  has(detailRoute, "validateSupportTicketStatus");
  has(detailRoute, "isValidSupportTicketStatusTransition");
  has(detailRoute, "ticket.status = nextStatus");
  has(detailRoute, "statusChangedAt");
  has(detailRoute, "statusChangedByUserId");
  has(detailRoute, 'entityType: "SUPPORT_TICKET"');
  has(detailRoute, "previousStatus: currentStatus");
  has(detailRoute, "newStatus: nextStatus");

  has(shell, 'href: "/admin/support-tickets"');
  has(shell, 'label: "Support tickets"');
});

test("viewing a ticket is not a status mutation and UI distinguishes all stable statuses", () => {
  const companyUi = source("components/workspace-support-tickets.tsx");
  const adminUi = source("components/admin-support-tickets.tsx");

  has(companyUi, "Ticket status is managed by Canvas support");
  has(companyUi, "Opening this ticket does not change its status");
  has(companyUi, '"NOT_SEEN"');
  has(companyUi, '"PROCESSING"');
  has(companyUi, '"COMPLETED"');

  has(adminUi, "Opening this ticket does not change its status");
  has(adminUi, "Not seen");
  has(adminUi, "Processing");
  has(adminUi, "Completed");
  has(adminUi, "statusChangedAt");
});

test("company support ticket UI has accessible modal controls, counters, pagination and recoverable states", () => {
  const sidebar = source("components/workspace-sidebar.tsx");
  const dashboard = source("components/workspace-dashboard.tsx");
  const ui = source("components/workspace-support-tickets.tsx");

  lacks(sidebar, "Platform Support");
  lacks(sidebar, "External");
  lacks(sidebar, "Raise a ticket");
  lacks(sidebar, "admin/support-tickets");
  has(sidebar, 'open("support-tickets")');
  has(dashboard, 'open={activeModal === "support-tickets"}');
  has(dashboard, "asPage");
  has(dashboard, "<WorkspaceSupportTickets");

  has(ui, 'role={asPage ? "region" : "dialog"}');
  has(ui, 'aria-modal={asPage ? undefined : true}');
  has(ui, 'event.key === "Escape"');
  has(ui, 'event.key !== "Tab"');
  has(ui, 'document.body.style.overflow = "hidden"');
  has(ui, "maxLength={SUBJECT_MAX}");
  has(ui, "maxLength={DESCRIPTION_MAX}");
  has(ui, "{subject.length}/{SUBJECT_MAX}");
  has(ui, "{description.length}/{DESCRIPTION_MAX}");
  has(ui, "Create ticket");
  has(ui, "Submit ticket");
  has(ui, "Cancel");
  has(ui, "Your signed-in company identity and workspace are attached automatically");
  has(ui, "Load 5 more tickets");
  has(ui, "Loading 5 more tickets…");
  has(ui, "SUPPORT_TICKET_DUPLICATE");
  has(ui, "SUPPORT_TICKET_RATE_LIMITED");
});

test("support ticket data model is immutable for submission identity and issue content, with tenant indexes", () => {
  const model = source("models/support-ticket.ts");
  const audit = source("models/platform-audit-event.ts");

  has(model, "companyId: {");
  has(model, "workspaceId: {");
  has(model, "submitterUserId: {");
  has(model, "submitterName: {");
  has(model, "submitterEmail: {");
  has(model, "subject: {");
  has(model, "description: {");
  has(model, "immutable: true");
  has(model, "supportTicketSchema.index({ companyId: 1, updatedAt: -1, _id: -1 })");
  has(model, "supportTicketSchema.index({ companyId: 1, submitterUserId: 1, createdAt: -1 })");
  has(model, "supportTicketSchema.index({ status: 1, updatedAt: -1, _id: -1 })");
  has(audit, '"SUPPORT_TICKET"');
});
