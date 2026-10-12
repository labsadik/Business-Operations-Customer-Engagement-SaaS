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

export const TASK_ACTIVITY_EVENT_TYPES = [
  "TASK_CREATED",
  "TASK_UPDATED",
  "ASSIGNEES_ADDED",
  "ASSIGNEE_REMOVED",
  "ASSIGNEE_STATUS_CHANGED"
] as const;
export type TaskActivityEventType = (typeof TASK_ACTIVITY_EVENT_TYPES)[number];
