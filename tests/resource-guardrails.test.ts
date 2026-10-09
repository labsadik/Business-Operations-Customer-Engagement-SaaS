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
  assert.ok(/requestInFlight\\s*\\|\\|\\s*terminal/.test(booking));
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
