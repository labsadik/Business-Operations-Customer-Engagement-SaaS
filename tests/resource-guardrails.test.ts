import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

test("live views throttle API polling and pause background work", () => {
  const workspace = source("components/workspace-dashboard.tsx");
  const tasks = source("features/task-management/components/task-management-dashboard.tsx");
  const booking = source("components/public-booking.tsx");

  assert.ok(workspace.includes("if (document.visibilityState === \"visible\") void refreshLive();\n    }, 30_000);"));
  assert.ok(tasks.includes("window.setInterval(refreshVisibleTasks, 30_000)"));
  assert.ok(booking.includes("window.setInterval(refreshAvailabilityWhenVisible, 60_000)"));
  assert.ok(booking.includes("timer = window.setInterval(() => void pollBookingStatus(), 5000)"));
  assert.ok(booking.includes("document.visibilityState !== \"visible\""));
  assert.ok(/requestInFlight\s*\|\|\s*terminal/.test(booking));
});

test("availability results use a bounded short-lived cache and coalesce duplicate reads", () => {
  const availability = source("lib/public-availability.ts");

  assert.ok(availability.includes("AVAILABILITY_CACHE_TTL_SECONDS = 75"));
  assert.ok(availability.includes("MAX_AVAILABILITY_CACHE_ENTRIES = 128"));
  assert.ok(availability.includes("inFlightAvailability"));
  assert.ok(availability.includes('redis.set(\n          cacheKey,\n          JSON.stringify(result),\n          { EX: AVAILABILITY_CACHE_TTL_SECONDS }'));
});

test("scheduled sweep work is capped per request", () => {
  const sweep = source("app/api/jobs/sweep/route.ts");

  assert.ok(sweep.includes("EXPIRY_SWEEP_BATCH_LIMIT = 25"));
  assert.ok(sweep.includes("RETRY_SWEEP_BATCH_LIMIT = 25"));
  assert.ok(sweep.includes("MEETING_RETRY_SWEEP_BATCH_LIMIT = 5"));
  assert.ok(sweep.includes("hasMoreWork:"));
});

test("Google access tokens are cached locally with bounded memory and single-flight refresh", () => {
  const calendar = source("lib/google-calendar.ts");
  const ignore = source(".gitignore");

  assert.ok(calendar.includes("MAX_ACCESS_TOKEN_CACHE_ENTRIES = 500"));
  assert.ok(calendar.includes("pendingAccessTokenLoads"));
  assert.ok(calendar.includes("function rememberAccessToken"));
  assert.ok(ignore.includes("/tsconfig.tsbuildinfo"));
});

test("Google Calendar free/busy calls have bounded concurrency and queue size", () => {
  const calendar = source("lib/google-calendar.ts");

  assert.ok(calendar.includes("MAX_CONCURRENT_FREE_BUSY_REQUESTS = 20"));
  assert.ok(calendar.includes("MAX_QUEUED_FREE_BUSY_REQUESTS = 500"));
  assert.ok(calendar.includes('throw new Error("GOOGLE_CALENDAR_BUSY")'));
  assert.ok(calendar.includes("return withFreeBusyCapacity(async () =>"));
});

test("desktop alerts are opt-in, recipient scoped, and use lightweight event feeds", () => {
  const center = source("components/desktop-notification-settings.tsx");
  const tasks = source("app/api/tasks/notifications/route.ts");
  const meetings = source("app/api/employee/requests/route.ts");
  const workspacePage = source("app/dashboard/page.tsx");
  const taskPage = source("features/task-management/components/task-management-dashboard.tsx");

  assert.ok(center.includes("Notification.requestPermission()"));
  assert.ok(center.includes("isDesktopNotificationsEnabled(userId)"));
  assert.ok(center.includes("TASK_POLL_HIDDEN_MS = 120_000"));
  assert.ok(tasks.includes('url.searchParams.get("desktop") === "1"'));
  assert.ok(tasks.includes('type: "TASK_ASSIGNED"'));
  assert.ok(meetings.includes('url.searchParams.get("notifications") === "true"'));
  assert.ok(meetings.includes("createdAt: { $gte: cutoff }"));
  assert.ok(workspacePage.includes("id: session.userId"));
  assert.ok(taskPage.includes("<DesktopNotificationCenter userId={userId}"));
});

test("Google-backed availability work has bounded concurrency and fails fast when saturated", () => {
  const availability = source("lib/public-availability.ts");
  const route = source("app/api/public/[companySlug]/availability/route.ts");

  assert.ok(availability.includes("MAX_CONCURRENT_AVAILABILITY_CALCULATIONS = 10"));
  assert.ok(availability.includes("MAX_QUEUED_AVAILABILITY_CALCULATIONS = 40"));
  assert.ok(availability.includes('throw new Error("AVAILABILITY_BUSY")'));
  assert.ok(availability.includes("withAvailabilityCalculationCapacity(async () =>"));
  assert.ok(route.includes('code === "AVAILABILITY_BUSY" || code === "GOOGLE_CALENDAR_BUSY" ? 503 : 400'));
});

test("desktop notifications continue to cover public meetings without the optional task feature", () => {
  const center = source("components/desktop-notification-settings.tsx");
  assert.ok(center.includes('clientApi<{ items: MeetingAlert[] }>'));
  assert.ok(center.includes('"/api/employee/requests?notifications=true&limit=10"'));
  assert.ok(center.includes("taskManagementEnabled"));
  assert.ok(!center.includes("if (!taskManagementEnabled) return;"));
});
