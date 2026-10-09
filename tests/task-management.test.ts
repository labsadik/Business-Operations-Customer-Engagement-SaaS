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
  assert.match(dashboard, /setShowCreateForm/);
  assert.match(sound, /localStorage/);
  assert.match(sound, /export async function playTaskSound/);
  assert.match(sidebar, /Platform Support/);
  assert.match(sidebar, /Raise a ticket/);
  assert.match(sidebar, /Collapse sidebar/);
  assert.match(sidebar, /Expand sidebar/);
});
