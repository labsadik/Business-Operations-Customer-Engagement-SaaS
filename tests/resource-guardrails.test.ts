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

test("public availability uses the same valid ISO date check before calculation and cache reads", () => {
  const availability = source("lib/public-availability.ts");
  const dateChecks = availability
    .split("\n")
    .filter((line) => line.includes(".test(dateIso)"));

  assert.equal(dateChecks.length, 2);
  assert.equal(dateChecks[0], dateChecks[1]);
  assert.ok(dateChecks[0].includes("/^\\d{4}-\\d{2}-\\d{2}$/"));
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

test("task board avoids reloading the whole employee directory on every task poll", () => {
  const dashboard = source("features/task-management/components/task-management-dashboard.tsx");
  const employees = source("app/api/company/employees/route.ts");

  assert.ok(dashboard.includes("EMPLOYEE_DIRECTORY_REFRESH_MS = 5 * 60_000"));
  assert.ok(dashboard.includes("Date.now() - employeeDirectoryLoadedAtRef.current >= EMPLOYEE_DIRECTORY_REFRESH_MS"));
  assert.ok(employees.includes('.select("userId role jobTitle department employmentStatus")'));
  assert.ok(employees.includes('.select("_id name email image role")'));
});

test("Redis-cached Google tokens use a short local TTL below the token-expiry safety margin", () => {
  const calendar = source("lib/google-calendar.ts");
  assert.ok(calendar.includes("TOKEN_CACHE_FROM_REDIS_TTL_MS = 30_000"));
  assert.ok(calendar.includes("Math.floor(refreshed.expires_in) - 60"));
});

test("desktop notifications show a real service-worker popup and support authenticated Web Push delivery", () => {
  const center = source("components/desktop-notification-settings.tsx");
  const worker = source("public/sw.js");
  const pushRoute = source("app/api/notifications/push/route.ts");
  const sender = source("lib/web-push.ts");
  const subscriptionModel = source("models/push-subscription.ts");
  const taskEvents = source("features/task-management/server/task-events.ts");
  const publicBookings = source("app/api/public/[companySlug]/bookings/route.ts");

  assert.ok(center.includes('navigator.serviceWorker.register("/sw.js"'));
  assert.ok(center.includes('showNotification("Conventus desktop alerts are on"'));
  assert.ok(center.includes("ensureWebPushSubscription"));
  assert.ok(center.includes('"/api/notifications/push"'));
  assert.ok(worker.includes('self.addEventListener("push"'));
  assert.ok(worker.includes("self.registration.showNotification"));
  assert.ok(worker.includes('self.addEventListener("notificationclick"'));
  assert.ok(pushRoute.includes("assertSameOrigin(request)"));
  assert.ok(pushRoute.includes("authorizedUser()"));
  assert.ok(pushRoute.includes("isAllowedPushEndpoint(body.endpoint)"));
  assert.ok(subscriptionModel.includes("userId: 1, endpoint: 1"));
  assert.ok(sender.includes('createCipheriv("aes-128-gcm"'));
  assert.ok(sender.includes("Authorization: vapidAuthorization"));
  assert.ok(sender.includes("AbortSignal.timeout(5000)"));
  assert.ok(taskEvents.includes("sendWebPushNotifications(pushEvents)"));
  assert.ok(publicBookings.includes("sendWebPushNotifications(recipients.map"));
});


test("only the four canonical user roles are allowed and tenant authorization does not implicitly bypass roles", () => {
  const domain = source("types/domain.ts");
  const user = source("models/user.ts");
  const membership = source("models/membership.ts");
  const session = source("models/session.ts");
  const authz = source("lib/authz.ts");
  const dashboardLayout = source("app/dashboard/layout.tsx");

  assert.ok(domain.includes('["PLATFORM_ADMIN", "COMPANY_ADMIN", "EMPLOYEE", "CUSTOMER"] as const'));
  assert.ok(user.includes("enum: [...USER_ROLES]"));
  assert.ok(membership.includes("enum: [...COMPANY_MEMBER_ROLES]"));
  assert.ok(session.includes("enum: [...USER_ROLES]"));
  assert.ok(authz.includes("!roles.includes(session.role)"));
  assert.ok(!authz.includes("adminManaged"));
  assert.ok(dashboardLayout.includes('session.role === "PLATFORM_ADMIN"'));
  assert.ok(dashboardLayout.includes('session.role !== "EMPLOYEE"'));
});

test("findOneAndUpdate and findOneAndReplace call sites avoid deprecated new: true", () => {
  const paths = [
    "app/api/admin/plans/[identifier]/route.ts",
    "app/api/admin/platform-settings/route.ts",
    "app/api/auth/google/callback/route.ts",
    "app/api/billing/free/route.ts",
    "app/api/billing/invoices/route.ts",
    "app/api/bookings/[bookingId]/accept/route.ts",
    "app/api/bookings/[bookingId]/decline/route.ts",
    "app/api/company/employees/[userId]/route.ts",
    "app/api/company/route.ts",
    "app/api/profile/member/route.ts",
    "app/api/tasks/[taskId]/route.ts",
    "app/api/tasks/[taskId]/status/route.ts",
    "app/api/tasks/notifications/[notificationId]/route.ts",
    "app/api/jobs/sweep/route.ts",
    "lib/platform.ts",
    "lib/booking-history.ts",
    "lib/plans-server.ts",
    "lib/billing.ts",
    "features/task-management/server/task-daily-limit.ts"
  ];
  for (const path of paths) {
    assert.doesNotMatch(source(path), /\bnew\s*:\s*true\b/, `${path} still uses the deprecated option`);
  }
});
