import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateSprintPatch } from "../features/task-management/shared/sprint-validation.ts";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}
import {
  validateAssigneeUserIds,
  validateAssignmentStatus,
  validateTaskCreateInput,
  validateTaskPatchInput
} from "../features/task-management/shared/task-validation.ts";

const employeeA = "64b000000000000000000001";
const employeeB = "64b000000000000000000002";

test("task creation accepts one or multiple valid assignees", () => {
  const one = validateTaskCreateInput({
    title: "Design onboarding screen",
    assigneeUserIds: [employeeA]
  });
  assert.equal(one.title, "Design onboarding screen");
  assert.equal(one.priority, "MEDIUM");
  assert.equal(one.assigneeUserIds.length, 1);
  assert.equal(one.dueAt, null);

  const many = validateTaskCreateInput({
    title: "Ship project",
    priority: "URGENT",
    description: "Coordinate handoff",
    dueAt: "2026-12-01T12:00:00.000Z",
    assigneeUserIds: [employeeA, employeeB]
  });
  assert.equal(many.priority, "URGENT");
  assert.equal(many.assigneeUserIds.length, 2);
  assert.equal(many.dueAt?.toISOString(), "2026-12-01T12:00:00.000Z");
});

test("task input validation rejects malformed or unsafe assignment data", () => {
  assert.throws(() => validateTaskCreateInput({ title: "", assigneeUserIds: [employeeA] }), /TASK_TITLE_REQUIRED/);
  assert.throws(() => validateTaskCreateInput({ title: "Work", priority: "P0", assigneeUserIds: [employeeA] }), /TASK_PRIORITY_INVALID/);
  assert.throws(() => validateTaskCreateInput({ title: "Work", assigneeUserIds: [employeeA, employeeA] }), /DUPLICATE_ASSIGNEE/);
  assert.throws(() => validateTaskCreateInput({ title: "Work", assigneeUserIds: ["not-an-id"] }), /ASSIGNEE_ID_INVALID/);
  assert.throws(() => validateTaskCreateInput({ title: "Work", dueAt: "not-a-date", assigneeUserIds: [employeeA] }), /DUE_AT_INVALID/);
});

test("daily task caps are enforced at both assignment entry points and are tenant-scoped", () => {
  const createRoute = source("app/api/tasks/route.ts");
  const assignmentRoute = source("app/api/tasks/[taskId]/assignments/route.ts");
  const limiter = source("features/task-management/server/task-daily-limit.ts");
  const usageModel = source("models/task-daily-usage.ts");
  const authorization = source("features/task-management/server/task-authorization.ts");

  assert.match(createRoute, /reserveDailyTaskAssignment\(scope, dailyLimit\)/);
  assert.match(createRoute, /releaseDailyTaskAssignment\(scope, dailyReservation\)/);
  assert.match(assignmentRoute, /reserveDailyTaskAssignment\(scope, dailyLimit\)/);
  assert.match(assignmentRoute, /releaseDailyTaskAssignment\(scope, dailyReservation\)/);
  assert.match(limiter, /count:\s*\{\s*\$lt:\s*effectiveLimit\s*\}/);
  assert.match(limiter, /companyId[\s\S]*workspaceId[\s\S]*dayKey/);
  assert.match(usageModel, /unique:\s*true/);
  assert.match(authorization, /timezone:/);
});

test("assignee selection is bounded and requires at least one recipient", () => {
  assert.throws(() => validateAssigneeUserIds([]), /ASSIGNEE_REQUIRED/);
  assert.throws(() => validateAssigneeUserIds(Array.from({ length: 51 }, (_, i) =>
    i.toString(16).padStart(24, "0")
  )), /ASSIGNEE_LIMIT_EXCEEDED/);
});

test("task update accepts only mutable fields", () => {
  const update = validateTaskPatchInput({
    title: "Updated task",
    priority: "HIGH",
    dueAt: null
  });
  assert.equal(update.title, "Updated task");
  assert.equal(update.priority, "HIGH");
  assert.equal(update.dueAt, null);
  assert.throws(() => validateTaskPatchInput({ companyId: "64b000000000000000000099" }), /TASK_FIELDS_INVALID/);
  assert.equal(validateTaskPatchInput({ sprintId: "64b000000000000000000099" }).sprintId, "64b000000000000000000099");
  assert.equal(validateTaskPatchInput({ sprintId: null }).sprintId, null);
  assert.throws(() => validateTaskPatchInput({ sprintId: "not-an-object-id" }), /TASK_SPRINT_ID_INVALID/);
  assert.throws(() => validateTaskPatchInput({}), /TASK_UPDATE_EMPTY/);
});

test("assignment status is constrained to supported lifecycle states", () => {
  assert.equal(validateAssignmentStatus("IN_PROGRESS"), "IN_PROGRESS");
  assert.equal(validateAssignmentStatus("COMPLETED"), "COMPLETED");
  assert.throws(() => validateAssignmentStatus("FINISHED"), /TASK_STATUS_INVALID/);
});


test("task dashboard includes searchable Jira-style columns, persistent confirmation sounds and a collapsible sidebar", () => {
  const dashboard = source("features/task-management/components/task-management-dashboard.tsx");
  const sound = source("lib/client-task-sound.ts");
  const sidebar = source("components/workspace-sidebar.tsx");

  assert.match(dashboard, /TASK_STATUSES\.map/);
  assert.match(dashboard, /aria-label="Search tasks"/);
  assert.match(dashboard, /Action sounds on automatically/);
  assert.match(dashboard, /playTaskSoundIfEnabled\("created"\)/);
  assert.match(dashboard, /onDragStart/);
  assert.match(dashboard, /onDrop/);
  assert.match(dashboard, /tasksByStatus/);
  assert.doesNotMatch(dashboard, /Preview task (created|updated|completed) sound/);
  assert.match(dashboard, /image=\{employee\.image\}/);
  assert.match(dashboard, /image=\{detail\.createdBy\?\.image\}/);
  assert.match(dashboard, /setShowCreateForm/);
  assert.doesNotMatch(sound, /localStorage/);
  assert.match(sound, /Kept as a backwards-compatible name; action sounds are always enabled/);
  assert.match(sound, /wave: "square"/);
  assert.match(sound, /wave: "sine"/);
  assert.match(sound, /export async function playTaskSound/);
  assert.doesNotMatch(sidebar, /Platform Support|External|Raise a ticket|UserAvatar/);
  assert.match(sidebar, /Collapse sidebar/);
  assert.match(sidebar, /Expand sidebar/);
});

test("user profile dropdown shows only identity, role, employee status, work schedule, position and department", () => {
  const taskDashboard = source("features/task-management/components/task-management-dashboard.tsx");
  const profile = source("components/workspace-user-profile.tsx");
  const profileRoute = source("app/api/profile/member/route.ts");
  const userModel = source("models/user.ts");
  const companyDashboard = source("components/workspace-dashboard.tsx");
  const adminShell = source("components/admin-shell.tsx");

  assert.match(taskDashboard, /<WorkspaceUserProfile/);
  assert.match(companyDashboard, /<WorkspaceUserProfile/);
  assert.match(adminShell, /<WorkspaceUserProfile/);
  assert.match(profile, /Open your profile/);
  assert.doesNotMatch(profile, /Plan period|billingPlan|profileCompany|Company name/);
  assert.match(profile, /Account role/);
  assert.match(profile, /Position \/ job title/);
  assert.match(profile, /Department/);
  assert.match(profile, /Employee status/);
  assert.match(profile, /Work availability/);
  assert.match(profileRoute, /AvailabilityRule\.find/);
  assert.match(profileRoute, /active: true/);
  assert.match(profileRoute, /dayOfWeek startMinute endMinute timezone/);
  assert.match(profile, /On leave/);
  assert.match(profile, /Save profile/);
  assert.match(profileRoute, /assertSameOrigin\(request\)/);
  assert.match(profileRoute, /Membership\.findOneAndUpdate/);
  assert.match(profileRoute, /User\.findByIdAndUpdate/);
  assert.match(profileRoute, /department/);
  assert.match(userModel, /jobTitle/);
  assert.match(userModel, /department/);
});


test("task management provides enterprise filters, list/board views, pagination and tenant-safe APIs", () => {
  const dashboard = source("features/task-management/components/task-management-dashboard.tsx");
  const listRoute = source("app/api/tasks/route.ts");
  const statusRoute = source("app/api/tasks/[taskId]/status/route.ts");
  const authorization = source("features/task-management/server/task-authorization.ts");
  const planAccess = source("lib/plans-server.ts");

  for (const feature of [
    'aria-label="Filter tasks by status"',
    'aria-label="Filter tasks by priority"',
    'aria-label="Filter by task ownership"',
    'aria-label="List view"',
    'aria-label="Board view"',
    "Load 5 more tasks",
    "Overdue",
    "syncTaskFromDetail",
    "Something went wrong while working with tasks"
  ]) assert.ok(dashboard.includes(feature), "Missing task board feature: " + feature);

  assert.ok(listRoute.includes("companyId: new Types.ObjectId(scope.companyId)"));
  assert.ok(listRoute.includes("workspaceId: new Types.ObjectId(scope.workspaceId)"));
  assert.ok(statusRoute.includes("assertSameOrigin(request)"));
  assert.ok(authorization.includes("active: true"));
  assert.ok(authorization.includes("assertAssignableEmployees"));
  assert.ok(planAccess.includes("if (company.planSuspended || company.planExpiryTestActive) return true;"));
  assert.ok(planAccess.includes('["PAID", "ADMIN_GRANTED"].includes(subscription.source)'));
  assert.ok(planAccess.includes('periodEndMs > now && subscription.status === "ACTIVE"'));
  assert.ok(planAccess.includes('subscription.status !== "ACTIVE"'));
  assert.ok(planAccess.includes("const periodEndMs = periodEnd?.getTime?.() ?? 0;"));
  assert.ok(dashboard.includes("PLAN_SUSPENDED: \"Task updates are locked because this company's plan is suspended or expired."));
});


test("task cleanup is tenant-scoped, permission-checked, period-limited, and cascades related records", () => {
  const route = source("app/api/tasks/route.ts");
  const dashboard = source("features/task-management/components/task-management-dashboard.tsx");

  assert.ok(route.includes('body?.confirm !== "CLEAR_CLOSED_TASKS"'));
  assert.ok(route.includes("WEEKLY: 7, MONTHLY: 30, YEARLY: 365"));
  assert.ok(route.includes('["COMPANY_ADMIN"]'));
  assert.ok(route.includes('status: { $in: ["COMPLETED", "CANCELLED"] }'));
  assert.ok(route.includes("updatedAt: { $gte: cutoff }"));
  assert.ok(route.includes("TaskAssignment.deleteMany(childFilter, { session: dbSession })"));
  assert.ok(route.includes("TaskActivity.deleteMany(childFilter, { session: dbSession })"));
  assert.ok(route.includes("TaskNotification.deleteMany(childFilter, { session: dbSession })"));
  assert.ok(dashboard.includes("Clear task history"));
  assert.ok(dashboard.includes("Active tasks are never cleared"));
  assert.ok(dashboard.includes("WEEKLY"));
  assert.ok(dashboard.includes("MONTHLY"));
  assert.ok(dashboard.includes("YEARLY"));
});


test("members can save their own work availability and only active members can be newly assigned tasks", () => {
  const profileRoute = source("app/api/profile/member/route.ts");
  const profile = source("components/workspace-user-profile.tsx");
  const dashboard = source("features/task-management/components/task-management-dashboard.tsx");
  const auth = source("features/task-management/server/task-authorization.ts");
  const employeeRoute = source("app/api/company/employees/route.ts");

  assert.ok(profileRoute.includes('body.employmentStatus !== undefined'));
  assert.ok(profileRoute.includes("isEmploymentStatus"));
  assert.ok(source("types/domain.ts").includes('["ACTIVE", "ON_LEAVE", "INACTIVE"]'));
  assert.ok(profileRoute.includes("Membership.findOneAndUpdate"));
  assert.ok(profile.includes("Work availability"));
  assert.ok(profile.includes('profileRole !== "PLATFORM_ADMIN"'));
  assert.ok(profile.includes("EMPLOYMENT_STATUS_LABELS[status]"));
  assert.ok(profile.includes("not eligible for new tasks"));
  assert.ok(profileRoute.includes("EMPLOYMENT_STATUS_NOT_APPLICABLE"));
  assert.ok(profile.includes('method: "PATCH"'));
  assert.ok(dashboard.includes("Team availability"));
  assert.ok(dashboard.includes('employee.employmentStatus === "ACTIVE"'));
  assert.ok(dashboard.includes("canvas:employment-status-updated"));
  assert.ok(auth.includes('employmentStatus: "ACTIVE"'));
  assert.ok(auth.includes('{ employmentStatus: { $exists: false } }'));
  assert.ok(employeeRoute.includes('employmentStatus: member.employmentStatus ?? "ACTIVE"'));
});


test("platform admin task usage is aggregated and displayed per company", () => {
  const adminData = source("lib/admin.ts");
  const companyDirectory = source("components/admin-companies.tsx");
  const companyDetails = source("components/admin-company-details.tsx");
  const platformOverview = source("components/admin-overview.tsx");

  assert.ok(adminData.includes("Task.aggregate"));
  assert.ok(adminData.includes("companyId: { $in: ids }"));
  assert.ok(adminData.includes("totalTaskAssignments"));
  assert.ok(companyDirectory.includes("{company.totalTasks}"));
  assert.ok(companyDirectory.includes("{company.activeTasks}"));
  assert.ok(companyDetails.includes("Company task usage"));
  assert.ok(companyDetails.includes("company.overdueTasks"));
  assert.ok(platformOverview.includes("data.totalTasks"));
});


test("session and transport hardening reduce avoidable reads and fail closed on missing CSRF origin", () => {
  const session = source("lib/session.ts");
  const security = source("lib/security.ts");
  const config = source("next.config.ts");

  assert.ok(session.includes('select("_id userId role companyId workspaceId expiresAt lastSeenAt")'));
  assert.ok(session.includes("lastSeenThreshold"));
  assert.ok(session.includes("5 * 60 * 1000"));
  assert.ok(security.includes('if (!candidate) throw new Error("CSRF_ORIGIN_INVALID")'));
  assert.ok(security.includes("new URL(candidate).origin"));
  assert.ok(config.includes("Strict-Transport-Security"));
  assert.ok(config.includes("Cross-Origin-Opener-Policy"));
  assert.ok(config.includes("X-Content-Type-Options"));
});


test("shared client API deduplicates mount reads and rejects invalid success payloads", () => {
  const clientApi = source("lib/client-api.ts");

  assert.ok(clientApi.includes("pendingApiReads"));
  assert.ok(clientApi.includes("if (pending) return pending as Promise<T>"));
  assert.ok(clientApi.includes("if (method !== \"GET\" || init?.signal)"));
  assert.ok(clientApi.includes('throw new Error("API_RESPONSE_INVALID")'));
  assert.ok(clientApi.includes("(response.ok && !hasJsonContentType)"));
  assert.ok(clientApi.includes("RETRYABLE_SERVER_STATUSES"));
});


test("production MongoDB connections explicitly require transport TLS", () => {
  const mongo = source("lib/mongodb.ts");
  assert.match(mongo, /process\.env\.NODE_ENV === "production" \? \{ tls: true \}/);
  assert.ok(mongo.includes("serverSelectionTimeoutMS: 5000"));
});


test("task creation, search and cancellation use modal dialogs and distinct task sounds", () => {
  const dashboard = source("features/task-management/components/task-management-dashboard.tsx");
  const sounds = source("lib/client-task-sound.ts");
  assert.match(dashboard, /role="dialog" aria-modal="true" aria-labelledby="create-task-title"/);
  assert.match(dashboard, /role="dialog" aria-modal="true" aria-labelledby="task-search-title"/);
  assert.match(dashboard, /role="dialog" aria-modal="true" aria-labelledby="cancel-task-assignment-title"/);
  assert.match(dashboard, /setCancelConfirm\(\{ task, assignment \}\)/);
  assert.match(sounds, /"created" \| "updated" \| "completed" \| "cancelled"/);
});


test("workspace overview exposes employee states and tenant-scoped task usage only", () => {
  const route = source("app/api/company/route.ts");
  const dashboard = source("components/workspace-dashboard.tsx");
  assert.match(route, /employeeStatusCounts/);
  assert.match(route, /Task\.aggregate/);
  assert.match(route, /TaskAssignment\.countDocuments\(taskScope\)/);
  assert.match(route, /const taskScope = \{ companyId: company\._id, workspaceId: workspace\._id \}/);
  assert.match(dashboard, /Employees on leave/);
  assert.match(dashboard, /Employees inactive/);
  assert.match(dashboard, /Plan renewal/);
  assert.match(dashboard, /meetingDateFilter/);
  assert.match(dashboard, /Meeting activity summary/);
  assert.match(dashboard, /playMeetingSound\(action === "accept" \? "accepted" : "declined"\)/);
});


test("meeting activity summary counts are authorized and isolated to the current company", () => {
  const route = source("app/api/employee/meetings/summary/route.ts");
  assert.match(route, /requireCompanyMember/);
  assert.match(route, /const scope = \{ companyId: session\.companyId \}/);
  assert.match(route, /BookingRequest\.countDocuments/);
  assert.match(route, /Meeting\.countDocuments/);
  assert.match(route, /requestedCount/);
  assert.match(route, /processingCount/);
  assert.match(route, /ongoingCount/);
  assert.match(route, /happenedCount/);
  assert.doesNotMatch(route, /searchParams\.get\("companyId"\)/);
});


test("plan suspension and expiry use one server access gate across feature entry points", () => {
  const planServer = source("lib/plans-server.ts");
  const accessRoute = source("app/api/company/plan-access/route.ts");
  const guard = source("components/plan-access-guard.tsx");
  const billing = source("lib/billing.ts");
  const taskPage = source("app/dashboard/tasks/page.tsx");
  const vaultPage = source("app/dashboard/vault/page.tsx");
  const chatPage = source("app/dashboard/live-chat/page.tsx");
  const taskAuth = source("features/task-management/server/task-authorization.ts");
  const vaultAuth = source("features/company-vault/server/vault-storage.ts");
  const chatAuth = source("lib/live-chat.ts");

  assert.match(planServer, /getCompanyPlanAccessState/);
  assert.match(planServer, /currentPeriodEnd/);
  assert.match(planServer, /planSuspended:\s*\{\s*\$ne:\s*true\s*\}/);
  assert.match(accessRoute, /getCompanyPlanAccessState/);
  assert.match(guard, /Plan renewal reminder/);
  assert.match(guard, /Plan access is suspended/);
  assert.match(guard, /Your plan has expired/);
  assert.match(guard, /Your plan is not active/);
  assert.match(guard, /router\.refresh\(\)/);
  assert.match(taskPage, /PlanAccessGuard/);
  assert.match(vaultPage, /PlanAccessGuard/);
  assert.match(chatPage, /PlanAccessGuard/);

  assert.match(taskAuth, /if \(!scope\.isPlatformAdmin\)\s*\{\s*await assertCompanyPlanNotSuspended/);
  assert.doesNotMatch(vaultAuth, /!options\.allowSuspendedRead/);
  assert.doesNotMatch(chatAuth, /!options\.allowSuspendedRead/);

  // A paid renewal clears expiry/test state but cannot silently override a
  // separate administrative suspension.
  assert.match(billing, /planExpiryTestActive:\s*false/);
  assert.doesNotMatch(billing, /planSuspended:\s*false/);
});


test("TaskAssignment is the single source of truth for persisted task assignees", () => {
  const taskModel = source("models/task.ts");
  const taskList = source("app/api/tasks/route.ts");
  const addAssignments = source("app/api/tasks/[taskId]/assignments/route.ts");
  const removeAssignment = source("app/api/tasks/[taskId]/assignments/[assignmentId]/route.ts");
  const taskDetail = source("app/api/tasks/[taskId]/route.ts");
  const taskActivity = source("app/api/tasks/[taskId]/activity/route.ts");
  const adminTaskList = source("app/api/admin/task-management/tasks/route.ts");
  const migration = source("scripts/migrate-task-assignees.mjs");
  const packageJson = JSON.parse(source("package.json")) as { scripts: Record<string, string> };

  assert.doesNotMatch(taskModel, /assigneeUserIds/);
  assert.ok(taskList.includes('TaskAssignment.distinct("taskId"'));
  assert.ok(taskList.includes("assigneesByTask.get(String(task._id))"));
  assert.ok(!addAssignments.includes("$addToSet: { $each: targetIds }"));
  assert.ok(!removeAssignment.includes("$pull: { assigneeUserIds:"));
  assert.ok(taskDetail.includes("assignedToCurrentUser"));
  assert.ok(taskDetail.includes("existingAssignments.map"));
  assert.doesNotMatch(taskActivity, /assigneeUserIds/);
  assert.ok(taskActivity.includes("TaskAssignment.exists"));
  assert.ok(adminTaskList.includes("assigneesByTask.get(String(task._id))"));
  assert.ok(migration.includes("TASK_ASSIGNEE_SOURCE_DRIFT"));
  assert.ok(migration.includes('$unset: { assigneeUserIds: "" }'));
  assert.equal(packageJson.scripts["task-assignees:migrate"], "node scripts/migrate-task-assignees.mjs");
});


test("Scrum sprint settings accept valid patches and reject invalid fields", () => {
  const patch = validateSprintPatch({
    name: " Sprint 7 ",
    goal: "Deliver account settings",
    startsAt: "2026-10-01T00:00:00.000Z",
    endsAt: "2026-10-14T23:59:59.999Z",
    status: "ACTIVE"
  });
  assert.equal(patch.name, "Sprint 7");
  assert.equal(patch.goal, "Deliver account settings");
  assert.equal(patch.status, "ACTIVE");
  assert.equal(patch.startsAt?.toISOString(), "2026-10-01T00:00:00.000Z");
  assert.throws(() => validateSprintPatch({ companyId: "64b000000000000000000099" }), /SPRINT_FIELDS_INVALID/);
  assert.throws(() => validateSprintPatch({ name: "  " }), /SPRINT_NAME_REQUIRED/);
  assert.throws(() => validateSprintPatch({ status: "RUNNING" }), /SPRINT_STATUS_INVALID/);
  assert.throws(() => validateSprintPatch({ name: "Sprint", startsAt: "not-a-date" }), /SPRINT_START_INVALID/);
});

test("task live updates use authenticated polling without a WebSocket server", () => {
  const dashboard = source("features/task-management/components/task-management-dashboard.tsx");
  const eventRecorder = source("features/task-management/server/task-events.ts");
  const packageConfig = JSON.parse(source("package.json")) as { scripts: Record<string, string> };

  assert.equal(packageConfig.scripts.dev, "next dev");
  assert.equal(packageConfig.scripts.start, "next start");
  assert.match(dashboard, /setInterval\(refreshVisibleTasks, 30_000\)/);
  assert.match(dashboard, /Live updates active · refreshes every 30 seconds/);
  assert.doesNotMatch(dashboard, /WebSocket|new WebSocket|realtime-ticket|CONNECTING|CONNECTED/);
  assert.doesNotMatch(eventRecorder, /publishTaskRealtime|task-realtime/);

  assert.equal(existsSync(resolve(process.cwd(), "server.mjs")), false);
  assert.equal(existsSync(resolve(process.cwd(), "lib/task-realtime.ts")), false);
  assert.equal(existsSync(resolve(process.cwd(), "lib/task-realtime-auth.ts")), false);
  assert.equal(existsSync(resolve(process.cwd(), "app/api/tasks/realtime-ticket/route.ts")), false);
});


test("task dashboard renders the workspace inline and keeps team/status dialogs without Scrum", () => {
  const dashboard = source("features/task-management/components/task-management-dashboard.tsx");
  assert.doesNotMatch(dashboard, /SCRUM|Scrum canvas|Sprint work|Product backlog|Add to sprint/);
  assert.match(dashboard, /aria-label="Task calendar"/);
  assert.match(dashboard, /aria-label="Task timeline"/);
  assert.match(dashboard, /aria-label="Go to task workspace"/);
  assert.match(dashboard, /id="task-workspace" aria-labelledby="task-workspace-title"/);
  assert.doesNotMatch(dashboard, /workViewOpen|setWorkViewOpen/);
  assert.doesNotMatch(dashboard, /role="dialog" aria-modal="true" aria-labelledby="task-workspace-title"/);
  assert.match(dashboard, /role="dialog" aria-modal="true" aria-labelledby="team-directory-title"/);
  assert.match(dashboard, /role="dialog" aria-modal="true" aria-labelledby="task-status-overview-title"/);
  assert.match(dashboard, /id="team-directory-title"/);
  assert.match(dashboard, /id="task-status-overview-title"/);
  assert.match(dashboard, /Live updates active/);
  assert.match(dashboard, /refreshVisibleTasks, 30_000/);
  assert.match(dashboard, /max-w-screen-2xl/);
  assert.match(dashboard, /grid gap-3 sm:grid-cols-2 xl:grid-cols-3/);
  assert.match(dashboard, /w-full min-w-0 flex-1 sm:w-auto sm:min-w-\[8.5rem\]/);
  assert.match(dashboard, /auto-cols-\[minmax\(14rem,1fr\)\]/);
  assert.match(dashboard, /min-w-\[860px\]/);
});
