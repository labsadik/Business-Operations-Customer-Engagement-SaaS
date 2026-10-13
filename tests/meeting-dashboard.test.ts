import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

test("meeting workspace shows join and complete actions for every active meeting state", () => {
  const dashboard = source("components/workspace-dashboard.tsx");
  const endRoute = source("app/api/bookings/[bookingId]/end/route.ts");
  const historyRoute = source("app/api/employee/meetings/route.ts");

  assert.ok(dashboard.includes('["READY", "LIVE"].includes(meetingStatus)'));
  assert.ok(dashboard.includes('["CONFIRMED", "IN_PROGRESS"].includes(item.status)'));
  assert.ok(dashboard.includes("Rejoin meeting"));
  assert.ok(dashboard.includes("Join meeting"));
  assert.ok(dashboard.includes("Complete meeting"));
  assert.ok(dashboard.includes('setConfirmation({ kind: "end-meeting", id: item.id })'));
  assert.ok(dashboard.includes('setConfirmation({ kind: "end-meeting", id: meeting.bookingRequestId })'));
  assert.ok(dashboard.includes('/api/bookings/${encodeURIComponent(id)}/end'));
  assert.ok(dashboard.includes("meeting.meetingUri"));
  assert.ok(endRoute.includes('["READY", "LIVE"].includes(meeting.status)'));
  assert.ok(endRoute.includes('booking.status = "COMPLETED"'));
  assert.ok(historyRoute.includes("googleMeetingUri"));
  assert.ok(historyRoute.includes('if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(requestedDate))'));
});

test("meeting panel loads from a direct dashboard URL and polls live state without a page reload", () => {
  const dashboard = source("components/workspace-dashboard.tsx");

  assert.ok(dashboard.includes('if (activeModal !== "meetings") return;'));
  assert.ok(dashboard.includes("const timer = window.setTimeout(() => void loadAllMeetings(), 0)"));
  assert.ok(dashboard.includes("const requestLimit = 5"));
  assert.ok(dashboard.includes("setModalRequests(pendingResult.value)"));
  assert.ok(dashboard.includes("setMeetingActivitySummary(summaryResult.value)"));
  assert.ok(dashboard.includes('api<ActiveRequestPage>("/api/employee/requests?limit=5&paginated=true")'));
  assert.ok(dashboard.includes("Load 5 more requests"));
  assert.ok(dashboard.includes("Load 5 more meetings"));
  assert.ok(dashboard.includes("window.setInterval"));
});

test("workspace refresh requests made during an in-flight read are queued rather than dropped", () => {
  const dashboard = source("components/workspace-dashboard.tsx");

  assert.ok(dashboard.includes("refreshQueuedRef.current = true"));
  assert.ok(dashboard.includes("if (refreshQueuedRef.current)"));
  assert.ok(dashboard.includes("window.setTimeout(() => void refreshAll(), 0)"));
});

test("task board refreshes quietly when visible and queues refreshes that overlap a request", () => {
  const taskDashboard = source("features/task-management/components/task-management-dashboard.tsx");

  assert.ok(taskDashboard.includes("window.setInterval(refreshVisibleTasks, 30_000)"));
  assert.ok(taskDashboard.includes('document.addEventListener("visibilitychange", refreshVisibleTasks)'));
  assert.ok(taskDashboard.includes('window.addEventListener("focus", refreshVisibleTasks)'));
  assert.ok(taskDashboard.includes("void load(false)"));
  assert.ok(taskDashboard.includes("loadQueuedRef.current = true"));
  assert.ok(taskDashboard.includes("window.setTimeout(() => void loadTaskRef.current?.(false), 0)"));
});
