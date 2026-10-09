import { TASK_PRIORITIES, TASK_STATUSES, type TaskPriority, type TaskStatus } from "./constants";

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("INVALID_JSON");
  }
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") throw new Error(field + "_INVALID");
  const cleaned = value.trim();
  if (!cleaned) throw new Error(field + "_REQUIRED");
  if (cleaned.length > maxLength) throw new Error(field + "_TOO_LONG");
  return cleaned;
}

function optionalText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") throw new Error(field + "_INVALID");
  const cleaned = value.trim();
  if (cleaned.length > maxLength) throw new Error(field + "_TOO_LONG");
  return cleaned;
}

export function validateAssigneeUserIds(value: unknown, required = true): string[] {
  if (value === undefined && !required) return [];
  if (!Array.isArray(value)) throw new Error("ASSIGNEES_INVALID");
  if (value.length > 50) throw new Error("ASSIGNEE_LIMIT_EXCEEDED");
  const ids = value.map((id) => {
    if (typeof id !== "string" || !OBJECT_ID_PATTERN.test(id)) {
      throw new Error("ASSIGNEE_ID_INVALID");
    }
    return id.toLowerCase();
  });
  const unique = [...new Set(ids)];
  if (unique.length !== ids.length) throw new Error("DUPLICATE_ASSIGNEE");
  if (required && unique.length === 0) throw new Error("ASSIGNEE_REQUIRED");
  return unique;
}

function parseDueAt(value: unknown): Date | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw new Error("DUE_AT_INVALID");
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error("DUE_AT_INVALID");
  return parsed;
}

export function validateTaskCreateInput(value: unknown) {
  const input = record(value);
  const title = requiredText(input.title, "TASK_TITLE", 160);
  const description = input.description == null ? "" : optionalText(input.description, "TASK_DESCRIPTION", 5000);
  const priority = input.priority == null ? "MEDIUM" : input.priority;
  if (typeof priority !== "string" || !TASK_PRIORITIES.includes(priority as TaskPriority)) {
    throw new Error("TASK_PRIORITY_INVALID");
  }
  return {
    title,
    description,
    priority: priority as TaskPriority,
    dueAt: parseDueAt(input.dueAt),
    assigneeUserIds: validateAssigneeUserIds(input.assigneeUserIds)
  };
}

export function validateTaskPatchInput(value: unknown) {
  const input = record(value);
  const allowed = ["title", "description", "priority", "dueAt"];
  if (Object.keys(input).some((key) => !allowed.includes(key))) {
    throw new Error("TASK_FIELDS_INVALID");
  }

  const update: {
    title?: string;
    description?: string;
    priority?: TaskPriority;
    dueAt?: Date | null;
  } = {};

  if (input.title !== undefined) update.title = requiredText(input.title, "TASK_TITLE", 160);
  if (input.description !== undefined) update.description = optionalText(input.description, "TASK_DESCRIPTION", 5000);
  if (input.priority !== undefined) {
    if (typeof input.priority !== "string" || !TASK_PRIORITIES.includes(input.priority as TaskPriority)) {
      throw new Error("TASK_PRIORITY_INVALID");
    }
    update.priority = input.priority as TaskPriority;
  }
  if (input.dueAt !== undefined) update.dueAt = parseDueAt(input.dueAt);
  if (Object.keys(update).length === 0) throw new Error("TASK_UPDATE_EMPTY");
  return update;
}

export function validateAssignmentStatus(value: unknown): TaskStatus {
  if (typeof value !== "string" || !TASK_STATUSES.includes(value as TaskStatus)) {
    throw new Error("TASK_STATUS_INVALID");
  }
  return value as TaskStatus;
}
