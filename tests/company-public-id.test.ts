import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");
}

test("company public IDs are unique, immutable tenant identifiers separate from MongoDB _id", () => {
  const company = source("models/company.ts");
  const sequence = source("models/company-sequence.ts");
  const route = source("app/api/company/route.ts");

  assert.ok(company.includes("publicId: { type: Number, min: 100001, immutable: true }"));
  assert.ok(company.includes('{ publicId: 1 }, { unique: true, sparse: true, name: "uniq_company_public_id" }'));
  assert.ok(sequence.includes('collection: "companysequences"'));
  assert.ok(route.includes('CompanySequence.findOneAndUpdate('));
  assert.ok(route.includes('{ $inc: { value: 1 } }'));
  assert.ok(route.includes('if (!sequence || !Number.isSafeInteger(sequence.value) || sequence.value < 100001)'));
  assert.ok(route.includes("session: tx"));
  assert.ok(route.indexOf("CompanySequence.findOneAndUpdate(") < route.indexOf("Company.create([{"));
  assert.ok(route.includes("publicId: sequence.value"));
  assert.ok(route.includes('message === "COMPANY_PUBLIC_ID_SEQUENCE_NOT_INITIALIZED" ? 503 : 500'));
});

test("only the authenticated company profile receives its own public ID", () => {
  const route = source("app/api/company/route.ts");
  const profile = source("components/company-profile.tsx");

  assert.ok(route.includes("const company = await getScopedCompany(session)"));
  assert.ok(route.includes("publicId: company.publicId ?? null"));
  assert.ok(route.includes("session.companyId ? Company.findById(session.companyId).lean() : null"));
  assert.ok(profile.includes("Company ID #"));
  assert.ok(profile.includes('aria-label="Your company public ID"'));
});

test("admin company IDs are visible and open the corresponding admin details route", () => {
  const admin = source("lib/admin.ts");
  const directory = source("components/admin-companies.tsx");
  const details = source("components/admin-company-details.tsx");

  assert.ok(admin.includes("publicId: company.publicId ?? null"));
  assert.ok(directory.includes("Company ID #"));
  assert.ok(directory.includes('href={`/admin/companies/${company.id}` as Route}'));
  assert.ok(details.includes("company.publicId?.toLocaleString"));
  assert.ok(details.includes("Company details"));
});

test("public company ID migration preserves issued IDs and verifies uniqueness before enabling allocation", () => {
  const migration = source("scripts/migrate-company-public-ids.mjs");
  const route = source("app/api/company/route.ts");
  const packageJson = JSON.parse(source("package.json")) as { scripts: Record<string, string> };

  assert.ok(migration.includes('const SEQUENCE_ID = "company-public-id"'));
  assert.ok(migration.includes("sort({ createdAt: 1, _id: 1 })"));
  assert.ok(migration.includes("Never silently renumber an ID already issued."));
  assert.ok(migration.includes('name: "uniq_company_public_id"'));
  assert.ok(migration.includes("remainingMissingPublicIds: finalMissing"));
  assert.ok(packageJson.scripts["company-ids:migrate"].includes("migrate-company-public-ids.mjs"));
  assert.ok(route.includes("COMPANY_PUBLIC_ID_SEQUENCE_NOT_INITIALIZED"));
});

test("high-volume tenant collections retain compound indexes led by companyId", () => {
  const booking = source("models/booking-request.ts");
  const task = source("models/task.ts");
  const taskAssignment = source("models/task-assignment.ts");
  const payment = source("models/payment.ts");
  const meeting = source("models/meeting.ts");
  const invoice = source("models/invoice.ts");
  const liveChat = source("models/live-chat-conversation.ts");
  const liveChatMessage = source("models/live-chat-message.ts");
  const feedback = source("models/feedback.ts");
  const support = source("models/support-ticket.ts");
  const vault = source("models/vault-file.ts");
  const invitation = source("models/invitation.ts");

  assert.ok(booking.includes("bookingRequestSchema.index({ companyId: 1, status: 1, createdAt: -1 })"));
  assert.ok(task.includes("taskSchema.index({ companyId: 1, workspaceId: 1, status: 1, createdAt: -1, _id: -1 })"));
  assert.ok(taskAssignment.includes("taskAssignmentSchema.index({ companyId: 1, workspaceId: 1, assigneeUserId: 1, status: 1, updatedAt: -1 })"));
  assert.ok(payment.includes("paymentSchema.index({ companyId: 1, createdAt: -1 })"));
  assert.ok(meeting.includes("meetingSchema.index({ companyId: 1, startAt: 1 })"));
  assert.ok(invoice.includes("invoiceSchema.index({ companyId: 1, issuedAt: -1 })"));
  assert.ok(liveChat.includes("liveChatConversationSchema.index({ companyId: 1, workspaceId: 1, lastMessageAt: -1, _id: -1 })"));
  assert.ok(liveChatMessage.includes("liveChatMessageSchema.index({ companyId: 1, workspaceId: 1, conversationId: 1 })"));
  assert.ok(feedback.includes("feedbackSchema.index({ source: 1, companyId: 1, reviewStatus: 1, createdAt: -1 })"));
  assert.ok(support.includes("supportTicketSchema.index({ companyId: 1, status: 1, updatedAt: -1, _id: -1 })"));
  assert.ok(vault.includes("vaultFileSchema.index({ companyId: 1, workspaceId: 1, folderId: 1, createdAt: -1, _id: -1 })"));
  assert.ok(invitation.includes("invitationSchema.index({ companyId: 1, workspaceId: 1, createdAt: -1, _id: -1 })"));
});
