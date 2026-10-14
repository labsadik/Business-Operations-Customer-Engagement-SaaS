import { Types } from "mongoose";
import { getMongo } from "@/lib/mongodb";
import { requireCompanyMember } from "@/lib/authz";
import { getCompanyEntitlements } from "@/lib/plans-server";
import type { AuthSession } from "@/lib/session";
import { jsonError } from "@/lib/http";
import { Company } from "@/models/company";
import { TaskCanvas } from "@/models/task-canvas";

export type TaskCanvasScope = {
  session: AuthSession;
  companyId: string;
  workspaceId: string;
  isPlatformAdmin: boolean;
  isManager: boolean;
  maxCollaborators: number;
  canvasLimit: number;
};

async function ensureCompanyCanvasCount(companyId: Types.ObjectId) {
  const company = await Company.collection.findOne(
    { _id: companyId },
    { projection: { taskCanvasCount: 1 } }
  );
  if (!company) throw new Error("COMPANY_NOT_CONFIGURED");
  if (typeof company.taskCanvasCount === "number" && Number.isFinite(company.taskCanvasCount)) return;

  // Existing companies predate this counter, so initialize it from all canvases
  // in the company once. The conditional update makes simultaneous initializers safe.
  const actualCount = await TaskCanvas.countDocuments({ companyId });
  await Company.collection.updateOne(
    { _id: companyId, taskCanvasCount: { $exists: false } },
    { $set: { taskCanvasCount: actualCount } }
  );
}

export async function getCompanyTaskCanvasCount(companyId: string) {
  await getMongo();
  const id = new Types.ObjectId(companyId);
  await ensureCompanyCanvasCount(id);
  const company = await Company.collection.findOne(
    { _id: id },
    { projection: { taskCanvasCount: 1 } }
  );
  return typeof company?.taskCanvasCount === "number" ? Math.max(0, company.taskCanvasCount) : 0;
}

export async function reserveTaskCanvasSlot(companyId: string, limit: number) {
  await getMongo();
  const id = new Types.ObjectId(companyId);
  await ensureCompanyCanvasCount(id);
  const reservation = await Company.collection.updateOne(
    { _id: id, taskCanvasCount: { $lt: limit } },
    { $inc: { taskCanvasCount: 1 } }
  );
  if (reservation.modifiedCount !== 1) throw new Error("CANVAS_CREATION_LIMIT");
  return getCompanyTaskCanvasCount(companyId);
}

export async function releaseTaskCanvasSlot(companyId: string) {
  await getMongo();
  const id = new Types.ObjectId(companyId);
  await ensureCompanyCanvasCount(id);
  await Company.collection.updateOne(
    { _id: id, taskCanvasCount: { $gt: 0 } },
    { $inc: { taskCanvasCount: -1 } }
  );
}

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

  // Even platform admins working inside a company's workspace must use that
  // company's current plan limits. Only management permissions are elevated.
  const plan = await getCompanyEntitlements(companyId);
  if (!plan.taskCanvasEnabled) throw new Error("FEATURE_NOT_IN_PLAN");
  return {
    session,
    companyId,
    workspaceId,
    isPlatformAdmin,
    isManager,
    maxCollaborators: Math.min(200, Math.max(2, plan.taskCanvasMaxCollaborators ?? 2)),
    // Keep the stored plan key for backward compatibility; it now caps canvases, not revisions.
    canvasLimit: Math.min(100, Math.max(1, plan.taskCanvasHistoryLimit ?? 10))
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
    code === "CANVAS_SCENE_STORED_INVALID" ? 500 :
    code === "UNAUTHENTICATED" ? 401 :
    ["FORBIDDEN", "CSRF_ORIGIN_INVALID", "FEATURE_NOT_IN_PLAN"].includes(code) ? 403 :
    code === "TASK_CANVAS_NOT_FOUND" ? 404 :
    code === "CANVAS_SCENE_TOO_LARGE" ? 413 :
    [
      "CANVAS_COLLABORATOR_LIMIT",
      "CANVAS_VERSION_CONFLICT",
      "CANVAS_CREATION_LIMIT",
      "CANVAS_MEMBER_INVALID"
    ].includes(code) ? 409 :
    ["COMPANY_NOT_CONFIGURED", "WORKSPACE_NOT_FOUND"].includes(code) ? 403 :
    code.endsWith("_INVALID") ? 400 :
    500;
  return jsonError(status === 500 ? fallback : code, status);
}
