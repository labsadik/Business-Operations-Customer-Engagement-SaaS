import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

test("public feedback embed is unauthenticated but resolves and stores feedback against the published company", () => {
  const route = source("app/api/public/[companySlug]/embedded-feedback/route.ts");
  const page = source("app/embed/feedback/[companySlug]/page.tsx");
  const model = source("models/feedback.ts");

  assert.match(route, /assertSameOrigin\(request\)/);
  assert.match(route, /publicBookingEnabled: true/);
  assert.match(route, /source: "PUBLIC_EMBED"/);
  assert.match(route, /reviewStatus: "NEW"/);
  assert.match(route, /submitterIpHash: ipHash/);
  assert.match(route, /withRedisLock\(/);
  assert.match(route, /IP_COOLDOWN_MS/);
  assert.match(route, /EMAIL_COOLDOWN_MS/);
  assert.match(route, /MAX_BODY_BYTES/);
  assert.match(route, /website/);
  assert.doesNotMatch(route, /getSession\(/);
  assert.match(page, /PublicFeedbackEmbed/);
  assert.match(model, /"PUBLIC_EMBED"/);
  assert.match(model, /submitterPhone/);
  assert.match(model, /submitterUserId:[\s\S]*immutable: true/);
});

test("anonymous feedback requires name, email, phone, rating and review text with server-side validation", () => {
  const validation = source("features/public-feedback/server/validation.ts");
  const widget = source("features/public-feedback/components/public-feedback-embed.tsx");

  assert.match(validation, /requiredText\(body\.name, "FEEDBACK_NAME", 100\)/);
  assert.match(validation, /FEEDBACK_EMAIL_INVALID/);
  assert.match(validation, /FEEDBACK_PHONE_INVALID/);
  assert.match(validation, /FEEDBACK_RATING_INVALID/);
  assert.match(validation, /requiredText\(body\.description, "FEEDBACK_DESCRIPTION", 1000\)/);
  assert.match(validation, /cleaned\.length > maxLength/);
  assert.match(widget, /type="email"/);
  assert.match(widget, /type="tel"/);
  assert.match(widget, /Submit review/);
  assert.match(widget, /Published reviews/);
  assert.match(widget, /credentials: "omit"/);
});

test("public review reads return only explicitly published display-safe fields", () => {
  const route = source("app/api/public/[companySlug]/embedded-feedback/route.ts");
  const companyRoute = source("app/api/company/feedback/route.ts");
  const workspaceFeedback = source("components/workspace-feedback.tsx");

  assert.match(route, /reviewStatus: "REVIEWED"/);
  assert.match(route, /select\("_id submitterName rating description createdAt"\)/);
  assert.doesNotMatch(route.slice(route.indexOf("return jsonOk({"), route.indexOf("export async function POST")), /submitterEmail|submitterPhone|submitterIpHash/);
  assert.match(companyRoute, /PUBLIC_EMBED/);
  assert.match(companyRoute, /export async function PATCH/);
  assert.match(workspaceFeedback, /Public embed/);
  assert.match(workspaceFeedback, /Publish review/);
  assert.match(workspaceFeedback, /Hide review/);
  assert.match(workspaceFeedback, /iframe/);
});

test("public feedback iframe has an explicit cross-site frame policy while other pages remain protected", () => {
  const config = source("next.config.ts");
  const page = source("app/embed/feedback/[companySlug]/page.tsx");
  const docs = source("features/public-feedback/README.md");

  assert.ok(config.includes("frame-ancestors *;"));
  assert.ok(config.includes("frame-ancestors 'self';"));
  assert.doesNotMatch(config, /X-Frame-Options/);
  assert.match(page, /publicBookingEnabled: true/);
  assert.match(docs, /raw request IP is not stored/);
});

test("action sounds are automatic, distinct and unlocked by a normal first interaction", () => {
  const root = source("components/sound-autoplay.tsx");
  const task = source("lib/client-task-sound.ts");
  const meeting = source("lib/client-meeting-sound.ts");
  const feedback = source("lib/client-feedback-sound.ts");
  const taskDashboard = source("features/task-management/components/task-management-dashboard.tsx");
  const workspace = source("components/workspace-dashboard.tsx");

  assert.match(root, /pointerdown/);
  assert.match(root, /unlockTaskSound\(\)/);
  assert.match(root, /unlockMeetingSound\(\)/);
  assert.match(root, /unlockFeedbackSound\(\)/);
  assert.match(task, /Kept as a backwards-compatible name; action sounds are always enabled/);
  assert.match(meeting, /"completed"/);
  assert.match(workspace, /playMeetingSound\("completed"\)/);
  assert.match(taskDashboard, /Action sounds on automatically/);
  assert.doesNotMatch(taskDashboard, /Turn task sound effects off|Preview task created sound/);
  assert.doesNotMatch(feedback, /localStorage/);
});

test("feedback dashboard snippet is company-specific and only owners/admins can publish embedded reviews", () => {
  const workspace = source("components/workspace-feedback.tsx");
  const dashboard = source("components/workspace-dashboard.tsx");
  assert.match(workspace, /\/embed\/feedback\//);
  assert.match(workspace, /navigator\.clipboard\.writeText\(embedCode\)/);
  assert.match(dashboard, /canManageReviews=\{\["COMPANY_ADMIN"\]/);
});
