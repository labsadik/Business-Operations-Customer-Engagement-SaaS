import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

test("public feedback is session-bound, company-scoped, and cannot accept browser identity", () => {
  const route = source("app/api/public/[companySlug]/feedback/route.ts");
  assert.match(route, /session\.role !== "CUSTOMER"/);
  assert.match(route, /companySlug\.toLowerCase\(\),\s*publicBookingEnabled: true/);
  assert.match(route, /assertSameOrigin\(request\)/);
  assert.match(route, /withRedisLock\(/);
  assert.match(route, /FEEDBACK_COOLDOWN_ACTIVE/);
  assert.match(route, /companyId: company\._id/);
  assert.match(route, /submitterUserId: new Types\.ObjectId\(session\.userId\)/);
  assert.doesNotMatch(route, /body\?\.companyId|body\?\.userId|body\?\.email|body\?\.name|body\?\.image/);
  assert.match(route, /submitterName: session\.name/);
  assert.match(route, /submitterEmail: session\.email/);
  assert.match(route, /submitterImage: session\.image/);
});

test("company feedback is restricted to an active server-verified membership and workspace", () => {
  const route = source("app/api/company/feedback/route.ts");
  assert.match(route, /"COMPANY_OWNER", "COMPANY_ADMIN", "EMPLOYEE"/);
  assert.match(route, /companyId: session\.companyId/);
  assert.match(route, /userId: session\.userId/);
  assert.match(route, /active: true/);
  assert.match(route, /role: session\.role/);
  assert.match(route, /_id: membership\.workspaceId/);
  assert.match(route, /companyId: membership\.companyId/);
  assert.match(route, /companyId: new Types\.ObjectId\(companyId\)/);
  assert.match(route, /workspaceId: new Types\.ObjectId\(workspaceId\)/);
  assert.match(route, /submitterUserId: new Types\.ObjectId\(session\.userId\)/);
  assert.match(route, /assertSameOrigin\(request\)/);
  assert.match(route, /withRedisLock\(/);
  assert.doesNotMatch(route, /body\?\.companyId|body\?\.userId|body\?\.email|body\?\.name|body\?\.image/);
});

test("feedback storage snapshots only server-derived available identity fields", () => {
  const model = source("models/feedback.ts");
  assert.match(model, /companyId:[\s\S]*immutable: true/);
  assert.match(model, /submitterUserId:[\s\S]*immutable: true/);
  assert.match(model, /submitterName:[\s\S]*immutable: true/);
  assert.match(model, /submitterEmail:[\s\S]*immutable: true/);
  assert.match(model, /submitterImage:[\s\S]*immutable: true/);
  assert.match(model, /workspaceId:[\s\S]*immutable: true/);
});

test("cross-company customer feedback cannot be selected by a different company", () => {
  const route = source("app/api/public/[companySlug]/feedback/route.ts");
  const bookingLookup = route.slice(route.indexOf("BookingRequest.findOne"));
  assert.match(bookingLookup, /companyId: company\._id/);
  assert.match(bookingLookup, /customerId: session\.userId/);

  const companyRoute = source("app/api/company/feedback/route.ts");
  assert.match(companyRoute, /Feedback\.find\(\{[\s\S]*source: "CUSTOMER_BOOKING",[\s\S]*companyId: session\.companyId/);
});

test("public feedback is explicit, modal-based, and signed-out users keep their company page return path", () => {
  const entry = source("components/public-feedback-entry.tsx");
  const modal = source("components/public-feedback-prompt.tsx");
  const booking = source("components/public-booking.tsx");

  assert.match(entry, /Give feedback/);
  assert.match(entry, /intent=customer/);
  assert.match(entry, /returnTo/);
  assert.match(modal, /role="dialog"/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /role="radiogroup"/);
  assert.match(modal, /value=\{value\}/);
  assert.match(modal, /maxLength=\{300\}/);
  assert.match(modal, /description\.length/);
  assert.match(modal, /Continue with Google/);
  assert.match(modal, /Escape/);
  assert.match(modal, /event\.key !== "Tab"/);
  assert.match(modal, /document\.body\.style\.overflow = "hidden"/);
  assert.match(modal, /motion-reduce:animate-none/);
  assert.match(modal, /Sound off/);
  assert.match(modal, /isFeedbackSoundEnabled/);
  assert.match(modal, /onCloseRef/);
  assert.doesNotMatch(modal, /setOpen\(true\)/);
  assert.doesNotMatch(booking, /PublicFeedbackPrompt|PublicFeedbackEntry/);
});

test("workspace feedback is an explicit accessible modal and does not expose customer data to employees", () => {
  const sidebar = source("components/workspace-sidebar.tsx");
  const dashboard = source("components/workspace-dashboard.tsx");
  const modal = source("components/workspace-feedback.tsx");

  assert.match(sidebar, /Send feedback/);
  assert.match(sidebar, /currentRole !== "PLATFORM_ADMIN"/);
  assert.doesNotMatch(sidebar, /canManage && currentRole !== "PLATFORM_ADMIN".*Send feedback/);

  assert.match(dashboard, /openModal\(panel, section, true\)/);
  assert.match(dashboard, /playFeedbackSoundIfEnabled/);
  assert.match(dashboard, /<WorkspaceFeedback/);
  assert.doesNotMatch(dashboard, /<AppModal[\s\S]*WorkspaceFeedback/);

  assert.match(modal, /role="dialog"/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /Submit feedback/);
  assert.match(modal, /Cancel/);
  assert.match(modal, /role="radiogroup"/);
  assert.match(modal, /maxLength=\{300\}/);
  assert.match(modal, /description\.length/);
  assert.match(modal, /event\.key === "Escape"/);
  assert.match(modal, /event\.key !== "Tab"/);
  assert.match(modal, /document\.body\.style\.overflow = "hidden"/);
  assert.match(modal, /motion-reduce:animate-none/);
  assert.match(modal, /Sound off/);
});

test("feedback sound is off by default, first-party persisted, and never scheduled on page load", () => {
  const sound = source("lib/client-feedback-sound.ts");
  const publicEntry = source("components/public-feedback-entry.tsx");
  const dashboard = source("components/workspace-dashboard.tsx");

  assert.match(sound, /return false;/);
  assert.match(sound, /localStorage/);
  assert.match(publicEntry, /onClick=\{openFeedback\}/);
  assert.match(publicEntry, /playFeedbackSoundIfEnabled\(\)/);
  assert.match(dashboard, /name === "feedback" && fromUserGesture/);
  assert.doesNotMatch(publicEntry, /useEffect\([\s\S]*playFeedbackSoundIfEnabled/);
});

test("customer and company-member feedback stay distinct sources", () => {
  const publicRoute = source("app/api/public/[companySlug]/feedback/route.ts");
  const companyRoute = source("app/api/company/feedback/route.ts");
  const adminRoute = source("app/api/admin/feedback/route.ts");

  assert.match(publicRoute, /source: "CUSTOMER_BOOKING"/);
  assert.match(companyRoute, /source: "COMPANY_PLATFORM"/);
  assert.match(adminRoute, /FEEDBACK_SOURCES/);
  assert.match(adminRoute, /source: item\.source/);
});
