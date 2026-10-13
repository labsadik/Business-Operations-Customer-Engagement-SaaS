import { TASK_SPRINT_STATUSES, type TaskSprintStatus } from "./constants.ts";

function inputRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("SPRINT_INPUT_INVALID");
  return value as Record<string, unknown>;
}
function parseSprintDate(value: unknown, field: string): Date | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw new Error(field + "_INVALID");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(field + "_INVALID");
  return date;
}
export type TaskSprintPatch = {
  name?: string;
  goal?: string;
  startsAt?: Date | null;
  endsAt?: Date | null;
  status?: TaskSprintStatus;
};
export function validateSprintPatch(value: unknown): TaskSprintPatch {
  const input = inputRecord(value);
  const allowed = ["name", "goal", "startsAt", "endsAt", "status"];
  if (Object.keys(input).some((key) => !allowed.includes(key))) throw new Error("SPRINT_FIELDS_INVALID");
  const update: TaskSprintPatch = {};
  if (input.name !== undefined) {
    if (typeof input.name !== "string") throw new Error("SPRINT_NAME_INVALID");
    const name = input.name.trim();
    if (!name) throw new Error("SPRINT_NAME_REQUIRED");
    if (name.length > 80) throw new Error("SPRINT_NAME_TOO_LONG");
    update.name = name;
  }
  if (input.goal !== undefined) {
    if (typeof input.goal !== "string") throw new Error("SPRINT_GOAL_INVALID");
    const goal = input.goal.trim();
    if (goal.length > 500) throw new Error("SPRINT_GOAL_TOO_LONG");
    update.goal = goal;
  }
  if (input.startsAt !== undefined) update.startsAt = parseSprintDate(input.startsAt, "SPRINT_START");
  if (input.endsAt !== undefined) update.endsAt = parseSprintDate(input.endsAt, "SPRINT_END");
  if (input.status !== undefined) {
    if (typeof input.status !== "string" || !TASK_SPRINT_STATUSES.includes(input.status as TaskSprintStatus)) {
      throw new Error("SPRINT_STATUS_INVALID");
    }
    update.status = input.status as TaskSprintStatus;
  }
  if (Object.keys(update).length === 0) throw new Error("SPRINT_UPDATE_EMPTY");
  return update;
}
