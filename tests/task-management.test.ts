import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
  assert.throws(() => validateTaskPatchInput({}), /TASK_UPDATE_EMPTY/);
});

test("assignment status is constrained to supported lifecycle states", () => {
  assert.equal(validateAssignmentStatus("IN_PROGRESS"), "IN_PROGRESS");
  assert.equal(validateAssignmentStatus("COMPLETED"), "COMPLETED");
  assert.throws(() => validateAssignmentStatus("FINISHED"), /TASK_STATUS_INVALID/);
});


test("task dashboard includes searchable Jira-style columns, persistent confirmation sounds and a collapsible sidebar", () => {
  const dashboard = source("components/task-management-dashboard.tsx");
  const sound = source("lib/client-task-sound.ts");
  const sidebar = source("components/workspace-sidebar.tsx");

  assert.match(dashboard, /TASK_STATUSES\.map/);
  assert.match(dashboard, /aria-label="Search tasks"/);
  assert.match(dashboard, /Sound effects/);
  assert.match(dashboard, /playTaskSoundIfEnabled\("created"\)/);
  assert.match(dashboard, /onDragStart/);
  assert.match(dashboard, /onDrop/);
  assert.match(dashboard, /tasksByStatus/);
  assert.match(dashboard, /Preview task created sound/);
  assert.match(dashboard, /Preview task updated sound/);
  assert.match(dashboard, /Preview task completed sound/);
  assert.match(dashboard, /image=\{employee\.image\}/);
  assert.match(dashboard, /image=\{detail\.createdBy\?\.image\}/);
  assert.match(dashboard, /setShowCreateForm/);
  assert.match(sound, /localStorage/);
  assert.match(sound, /wave: "square"/);
  assert.match(sound, /wave: "sine"/);
  assert.match(sound, /export async function playTaskSound/);
  assert.doesNotMatch(sidebar, /Platform Support|External|Raise a ticket|UserAvatar/);
  assert.match(sidebar, /Collapse sidebar/);
  assert.match(sidebar, /Expand sidebar/);
});

test("user profile dropdown shows role, company, position, department and status with a scoped persistence route", () => {
  const taskDashboard = source("components/task-management-dashboard.tsx");
  const profile = source("components/workspace-user-profile.tsx");
  const profileRoute = source("app/api/profile/member/route.ts");
  const userModel = source("models/user.ts");
  const companyDashboard = source("components/workspace-dashboard.tsx");
  const adminShell = source("components/admin-shell.tsx");

  assert.match(taskDashboard, /<WorkspaceUserProfile/);
  assert.match(companyDashboard, /<WorkspaceUserProfile/);
  assert.match(adminShell, /<WorkspaceUserProfile/);
  assert.match(profile, /Open your profile/);
  assert.match(profile, /Company/);
  assert.match(profile, /Account role/);
  assert.match(profile, /Position \/ job title/);
  assert.match(profile, /Department/);
  assert.match(profile, /Employment status/);
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
  const dashboard = source("components/task-management-dashboard.tsx");
  const listRoute = source("app/api/tasks/route.ts");
  const statusRoute = source("app/api/tasks/[taskId]/status/route.ts");
  const authorization = source("features/task-management/server/task-authorization.ts");

  for (const feature of [
    'aria-label="Filter tasks by status"',
    'aria-label="Filter tasks by priority"',
    'aria-label="Filter by task ownership"',
    'aria-label="List view"',
    'aria-label="Board view"',
    "Load 50 more tasks",
    "Overdue",
    "syncTaskFromDetail",
    "Something went wrong while working with tasks"
  ]) assert.ok(dashboard.includes(feature), "Missing task board feature: " + feature);

  assert.ok(listRoute.includes("companyId: new Types.ObjectId(scope.companyId)"));
  assert.ok(listRoute.includes("workspaceId: new Types.ObjectId(scope.workspaceId)"));
  assert.ok(statusRoute.includes("assertSameOrigin(request)"));
  assert.ok(authorization.includes("active: true"));
  assert.ok(authorization.includes("assertAssignableEmployees"));
});


test("task cleanup is tenant-scoped, permission-checked, period-limited, and cascades related records", () => {
  const route = source("app/api/tasks/route.ts");
  const dashboard = source("components/task-management-dashboard.tsx");

  assert.ok(route.includes('body?.confirm !== "CLEAR_CLOSED_TASKS"'));
  assert.ok(route.includes("WEEKLY: 7, MONTHLY: 30, YEARLY: 365"));
  assert.ok(route.includes('["COMPANY_OWNER", "COMPANY_ADMIN"]'));
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
  const dashboard = source("components/task-management-dashboard.tsx");
  const auth = source("features/task-management/server/task-authorization.ts");
  const employeeRoute = source("app/api/company/employees/route.ts");

  assert.ok(profileRoute.includes('body.employmentStatus !== undefined'));
  assert.ok(profileRoute.includes('["ACTIVE", "ON_LEAVE", "INACTIVE"]'));
  assert.ok(profileRoute.includes("Membership.findOneAndUpdate"));
  assert.ok(profile.includes("Work availability"));
  assert.ok(profile.includes('profileRole !== "PLATFORM_ADMIN"'));
  assert.ok(profile.includes("On leave — not eligible for new tasks"));
  assert.ok(profileRoute.includes("EMPLOYMENT_STATUS_NOT_APPLICABLE"));
  assert.ok(profile.includes('method: "PATCH"'));
  assert.ok(dashboard.includes("Team availability"));
  assert.ok(dashboard.includes('employee.employmentStatus === "ACTIVE"'));
  assert.ok(dashboard.includes("conventus:employment-status-updated"));
  assert.ok(auth.includes('employmentStatus: "ACTIVE"'));
  assert.ok(auth.includes('{ employmentStatus: { $exists: false } }'));
  assert.ok(employeeRoute.includes('employmentStatus: membership?.employmentStatus ?? "ACTIVE"'));
});
