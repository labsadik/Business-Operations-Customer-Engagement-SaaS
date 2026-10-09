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
  assert.match(route, /"COMPANY_ADMIN", "EMPLOYEE"/);
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
  assert.match(companyRoute, /source: \{ \$in: \["CUSTOMER_BOOKING", "PUBLIC_EMBED"\] \}/);
  assert.match(companyRoute, /companyId: session\.companyId/);
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
  assert.match(modal, /Feedback could not be submitted/);
  assert.match(modal, /Your text is still here/);
  assert.match(modal, /flex items-end justify-center/);
  assert.match(modal, /Escape/);
  assert.match(modal, /event\.key !== "Tab"/);
  assert.match(modal, /document\.body\.style\.overflow = "hidden"/);
  assert.match(modal, /motion-reduce:animate-none/);
  assert.match(modal, /Action sounds are enabled automatically/);
  assert.match(modal, /playFeedbackSound/);
  assert.match(modal, /savingRef/);
  assert.doesNotMatch(modal, /setOpen\(true\)/);
  assert.doesNotMatch(booking, /PublicFeedbackPrompt|PublicFeedbackEntry/);
});

test("workspace feedback is an explicit accessible modal and does not expose customer data to employees", () => {
  const sidebar = source("components/workspace-sidebar.tsx");
  const dashboard = source("components/workspace-dashboard.tsx");
  const modal = source("components/workspace-feedback.tsx");

  assert.match(sidebar, /useNavigationLabels/);
  assert.match(sidebar, /labels\.feedback/);
  assert.match(sidebar, /onClick=\{\(\) => open\("feedback"\)\}/);
  assert.doesNotMatch(sidebar, /UserAvatar|userImage|userEmail|Platform Support|External/);
  assert.match(dashboard, /<WorkspaceUserProfile/);
  assert.match(dashboard, /image=\{user\.image\}/);

  assert.match(dashboard, /openModal\(panel, section, true\)/);
  assert.match(dashboard, /playFeedbackSound/);
  assert.match(dashboard, /<WorkspaceFeedback/);
  assert.doesNotMatch(dashboard, /<AppModal[\s\S]*WorkspaceFeedback/);

  assert.match(modal, /role=\{asPage \? "region" : "dialog"\}/);
  assert.match(modal, /aria-modal=\{asPage \? undefined : true\}/);
  assert.match(modal, /if \(asPage\) return/);
  assert.match(modal, /Submit feedback/);
  assert.match(modal, /Cancel/);
  assert.match(modal, /role="radiogroup"/);
  assert.match(modal, /maxLength=\{300\}/);
  assert.match(modal, /description\.length/);
  assert.match(modal, /event\.key === "Escape"/);
  assert.match(modal, /event\.key !== "Tab"/);
  assert.match(modal, /document\.body\.style\.overflow = "hidden"/);
  assert.match(modal, /motion-reduce:animate-none/);
  assert.match(modal, /Action sounds are enabled automatically/);
  assert.doesNotMatch(modal, /Sound off|toggleSound|isFeedbackSoundEnabled/);
});

test("feedback action sounds are automatic and unlocked after the first ordinary interaction", () => {
  const sound = source("lib/client-feedback-sound.ts");
  const publicEntry = source("components/public-feedback-entry.tsx");
  const dashboard = source("components/workspace-dashboard.tsx");
  const globalUnlock = source("components/sound-autoplay.tsx");

  assert.ok(sound.includes("export async function playFeedbackSound"));
  assert.ok(sound.includes("0.36"));
  assert.doesNotMatch(sound, /localStorage|isFeedbackSoundEnabled/);
  assert.ok(publicEntry.includes("playFeedbackSound()"));
  assert.ok(dashboard.includes("playFeedbackSound()"));
  assert.ok(globalUnlock.includes("pointerdown"));
  assert.ok(globalUnlock.includes("unlockTaskSound()"));
  assert.ok(globalUnlock.includes("unlockMeetingSound()"));
  assert.ok(globalUnlock.includes("unlockFeedbackSound()"));
  assert.doesNotMatch(publicEntry, /Sound off|toggleSound/);
});

test("customer and company-member feedback stay distinct sources", () => {
  const publicRoute = source("app/api/public/[companySlug]/feedback/route.ts");
  const companyRoute = source("app/api/company/feedback/route.ts");
  const adminRoute = source("app/api/admin/feedback/route.ts");

  assert.match(publicRoute, /source: "CUSTOMER_BOOKING"/);
  assert.match(companyRoute, /PUBLIC_EMBED/);
  assert.match(companyRoute, /source: "COMPANY_PLATFORM"/);
  assert.match(adminRoute, /FEEDBACK_SOURCES/);
  assert.match(adminRoute, /source: item\.source/);
});


test("shared user avatars keep a visible fallback when Google image rendering fails", () => {
  const avatar = source("components/user-avatar.tsx");
  const session = source("lib/session.ts");
  const oauth = source("app/api/auth/google/callback/route.ts");

  assert.match(avatar, /googleAvatarUrl\(image\)/);
  assert.match(avatar, /aria-hidden="true"/);
  assert.match(avatar, /onError=\{\(\) => \{/);
  assert.match(avatar, /setFailedImageSrc\(imageSrc\)/);
  assert.match(avatar, /failedImageSrc !== fallbackImage/);
  assert.doesNotMatch(avatar, /style\.display = "none"/);
  assert.match(avatar, /referrerPolicy="no-referrer"/);
  assert.match(session, /image: googleAvatarUrl\(user\.image\)/);
  assert.match(oauth, /image: googleAvatarUrl\(googleUser\.picture\)/);
});

test("admin feedback inbox remains a separate platform ticket source", () => {
  const shell = source("components/admin-shell.tsx");
  const page = source("app/admin/feedback/page.tsx");
  const api = source("app/api/admin/feedback/route.ts");

  assert.match(shell, /href: "\/admin\/feedback"/);
  assert.match(shell, /label: "Feedback"/);
  assert.match(page, /AdminFeedback/);
  assert.match(api, /requirePlatformAdmin/);
  assert.match(api, /FEEDBACK_SOURCES/);
});

test("company feedback reads are tenant-scoped for every active company role", () => {
  const policy = source("lib/platform-communication.ts");
  const route = source("app/api/company/feedback/route.ts");
  const dashboard = source("components/workspace-dashboard.tsx");

  assert.match(policy, /role === "EMPLOYEE"/);
  assert.match(route, /active: true/);
  assert.match(route, /role: session\.role/);
  assert.match(route, /companyId: session\.companyId/);
  assert.match(route, /source: \{ \$in: \["CUSTOMER_BOOKING", "PUBLIC_EMBED"\] \}/);
  assert.match(route, /source: "COMPANY_PLATFORM"/);
  assert.match(dashboard, /canViewCustomerFeedback=\{Boolean\(data\.currentRole && data\.company\?\.id\)\}/);
});

test("public customer feedback requires and server-attaches an eligible company booking", () => {
  const route = source("app/api/public/[companySlug]/feedback/route.ts");
  const prompt = source("components/public-feedback-prompt.tsx");

  assert.match(route, /status: \{ \$in: eligibleBookingStatuses \}/);
  assert.match(route, /customerId: session\.userId/);
  assert.match(route, /if \(!eligibleBooking\) throw new Error\("BOOKING_REQUIRED_FOR_FEEDBACK"\)/);
  assert.match(route, /bookingRequestId = eligibleBooking\._id/);
  assert.match(prompt, /BOOKING_REQUIRED_FOR_FEEDBACK/);
});
