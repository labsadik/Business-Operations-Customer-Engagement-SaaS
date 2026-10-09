export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_STATUSES = [
  "TODO",
  "IN_PROGRESS",
  "BLOCKED",
  "IN_REVIEW",
  "COMPLETED",
  "CANCELLED"
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_NOTIFICATION_TYPES = [
  "TASK_ASSIGNMENT_CONFIRMED",
  "TASK_ASSIGNED",
  "TASK_UNASSIGNED",
  "TASK_STATUS_CHANGED",
  "TASK_COMPLETED",
  "TASK_UPDATED"
] as const;
export type TaskNotificationType = (typeof TASK_NOTIFICATION_TYPES)[number];
