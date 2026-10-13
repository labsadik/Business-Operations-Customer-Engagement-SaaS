import { Types } from "mongoose";
import { getMongo } from "@/lib/mongodb";
import { requireCompanyMember } from "@/lib/authz";
import { getCompanyEntitlements } from "@/lib/plans-server";
import type { AuthSession } from "@/lib/session";
import { jsonError } from "@/lib/http";

export type TaskCanvasScope = {
  session: AuthSession;
  companyId: string;
  workspaceId: string;
  isPlatformAdmin: boolean;
  isManager: boolean;
  maxCollaborators: number;
  historyLimit: number;
};

export async function requireTaskCanvasScope(): Promise<TaskCanvasScope> {
  await getMongo();
  const { session } = await requireCompanyMember(["COMPANY_ADMIN", "EMPLOYEE", "PLATFORM_ADMIN"]);
  const companyId = session.companyId;
  const workspaceId = session.workspaceId;
  if (!companyId || !workspaceId || !Types.ObjectId.isValid(companyId) || !Types.ObjectId.isValid(workspaceId)) {
    throw new Error("COMPANY_NOT_CONFIGURED");
  }

  const isPlatformAdmin = session.role === "PLATFORM_ADMIN";
  const isManager = isPlatformAdmin || session.role === "COMPANY_ADMIN";
  if (isPlatformAdmin) {
    return { session, companyId, workspaceId, isPlatformAdmin, isManager, maxCollaborators: 200, historyLimit: 100 };
  }

  const plan = await getCompanyEntitlements(companyId);
  if (!plan.taskCanvasEnabled) throw new Error("FEATURE_NOT_IN_PLAN");
  return {
    session,
    companyId,
    workspaceId,
    isPlatformAdmin,
    isManager,
    maxCollaborators: Math.min(200, Math.max(2, plan.taskCanvasMaxCollaborators ?? 2)),
    historyLimit: Math.min(100, Math.max(1, plan.taskCanvasHistoryLimit ?? 10))
  };
}

export function canReadTaskCanvas(
  scope: TaskCanvasScope,
  canvas: { createdByUserId: unknown; memberUserIds?: unknown[] }
) {
  if (scope.isManager) return true;
  const userId = scope.session.userId;
  return String(canvas.createdByUserId) === userId ||
    (canvas.memberUserIds ?? []).some((id) => String(id) === userId);
}

export function canManageTaskCanvas(
  scope: TaskCanvasScope,
  canvas: { createdByUserId: unknown }
) {
  return scope.isManager || String(canvas.createdByUserId) === scope.session.userId;
}

export function taskCanvasErrorResponse(error: unknown, fallback = "TASK_CANVAS_REQUEST_FAILED") {
  const code = error instanceof Error ? error.message : fallback;
  const status =
    code === "UNAUTHENTICATED" ? 401 :
    ["FORBIDDEN", "CSRF_ORIGIN_INVALID", "FEATURE_NOT_IN_PLAN"].includes(code) ? 403 :
    ["TASK_CANVAS_NOT_FOUND", "CANVAS_REVISION_NOT_FOUND"].includes(code) ? 404 :
    code === "CANVAS_SCENE_TOO_LARGE" ? 413 :
    [
      "CANVAS_COLLABORATOR_LIMIT",
      "CANVAS_VERSION_CONFLICT",
      "CANVAS_CREATION_LIMIT",
      "CANVAS_HISTORY_EMPTY",
      "CANVAS_MEMBER_INVALID"
    ].includes(code) ? 409 :
    ["COMPANY_NOT_CONFIGURED", "WORKSPACE_NOT_FOUND"].includes(code) ? 403 :
    code.endsWith("_INVALID") ? 400 :
    500;
  return jsonError(status === 500 ? fallback : code, status);
}
