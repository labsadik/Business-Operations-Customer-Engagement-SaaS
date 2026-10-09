import { jsonError } from "@/lib/http";

const STATUS_BY_CODE: Record<string, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  CSRF_ORIGIN_INVALID: 403,
  COMPANY_NOT_CONFIGURED: 403,
  WORKSPACE_NOT_FOUND: 404,
  FEATURE_NOT_IN_PLAN: 403,
  TASK_NOT_FOUND: 404,
  ASSIGNMENT_NOT_FOUND: 404,
  NOTIFICATION_NOT_FOUND: 404,
  ASSIGNEE_NOT_FOUND: 404,
  TASK_ALREADY_COMPLETED: 409,
  TASK_ALREADY_CANCELLED: 409,
  ASSIGNEE_ALREADY_ASSIGNED: 409,
  ASSIGNMENT_ALREADY_COMPLETED: 409,
  TASK_STATUS_CONFLICT: 409,
  DUPLICATE_ASSIGNEE: 400,
  ASSIGNEE_REQUIRED: 400,
  ASSIGNEE_LIMIT_EXCEEDED: 400,
  ASSIGNEE_ID_INVALID: 400,
  INVALID_JSON: 400,
  INVALID_TASK_ID: 400,
  INVALID_ASSIGNMENT_ID: 400,
  INVALID_NOTIFICATION_ID: 400
};

export function taskErrorResponse(error: unknown, fallback = "TASK_REQUEST_FAILED") {
  const code = error instanceof Error ? error.message : fallback;
  const status = STATUS_BY_CODE[code] ??
    (code.endsWith("_INVALID") || code.endsWith("_REQUIRED") || code.endsWith("_TOO_LONG") ||
      code.endsWith("_EMPTY") || code.endsWith("_FIELDS_INVALID") ? 400 : 500);
  return jsonError(code, status);
}
