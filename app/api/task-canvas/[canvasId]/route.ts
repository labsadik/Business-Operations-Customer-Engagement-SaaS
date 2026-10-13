import { Types } from "mongoose";
import { assertSameOrigin } from "@/lib/security";
import { jsonError, jsonOk } from "@/lib/http";
import { TaskCanvas } from "@/models/task-canvas";
import { TaskCanvasRevision } from "@/models/task-canvas-revision";
import { pruneCompanyTaskCanvasHistory } from "@/lib/task-canvas-history";
import { Membership } from "@/models/membership";
import { User } from "@/models/user";
import {
  canManageTaskCanvas,
  canReadTaskCanvas,
  requireTaskCanvasScope,
  taskCanvasErrorResponse
} from "@/lib/task-canvas-authorization";
import {
  validateCanvasMembers,
  validateCanvasVersion,
  validateTaskCanvasName,
  validateTaskCanvasScene
} from "@/features/task-canvas/shared/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ canvasId: string }> };

function idsFor(scope: { companyId: string; workspaceId: string }, canvasId: string) {
  if (!Types.ObjectId.isValid(canvasId)) throw new Error("CANVAS_ID_INVALID");
  return {
    _id: new Types.ObjectId(canvasId),
    companyId: new Types.ObjectId(scope.companyId),
    workspaceId: new Types.ObjectId(scope.workspaceId)
  };
}

function meaningfulScene(scene: unknown) {
  if (!scene || typeof scene !== "object") return false;
  const elements = (scene as { elements?: unknown }).elements;
  return Array.isArray(elements) && elements.length > 0;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const scope = await requireTaskCanvasScope();
    const { canvasId } = await params;
    const filter = idsFor(scope, canvasId);
    const canvas = await TaskCanvas.findOne(filter).lean();
    if (!canvas || !canReadTaskCanvas(scope, canvas)) throw new Error("TASK_CANVAS_NOT_FOUND");

    const memberUserIds = [...new Set((canvas.memberUserIds ?? []).map(String))];
    const item = {
      id: String(canvas._id),
      name: canvas.name,
      version: canvas.version,
      createdByUserId: String(canvas.createdByUserId),
      memberUserIds,
      memberCount: memberUserIds.length,
      updatedAt: new Date(canvas.updatedAt).toISOString(),
      lastEditorUserId: canvas.lastEditorUserId ? String(canvas.lastEditorUserId) : null
    };
    if (new URL(request.url).searchParams.get("meta") === "1") return jsonOk({ item });
    return jsonOk({
      item,
      scene: canvas.scene ?? { elements: [], appState: {}, files: {} },
      limits: { maxCollaborators: scope.maxCollaborators, historyLimit: scope.historyLimit }
    });
  } catch (error) {
    return taskCanvasErrorResponse(error, "TASK_CANVAS_READ_FAILED");
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    assertSameOrigin(request);
    const scope = await requireTaskCanvasScope();
    const { canvasId } = await params;
    const filter = idsFor(scope, canvasId);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || Array.isArray(body) || typeof body.action !== "string") {
      return jsonError("CANVAS_ACTION_INVALID", 400);
    }

    const canvas = await TaskCanvas.findOne(filter).lean();
    if (!canvas || !canReadTaskCanvas(scope, canvas)) throw new Error("TASK_CANVAS_NOT_FOUND");
    const actorId = new Types.ObjectId(scope.session.userId);

    if (body.action === "save") {
      const expectedVersion = validateCanvasVersion(body.expectedVersion);
      const scene = validateTaskCanvasScene(body.scene);
      if (expectedVersion !== canvas.version) {
        return jsonError("CANVAS_VERSION_CONFLICT", 409, { currentVersion: canvas.version });
      }
      const now = new Date();
      const lastHistoryAt = canvas.lastHistoryAt ? new Date(canvas.lastHistoryAt).getTime() : 0;
      const shouldSnapshot = meaningfulScene(canvas.scene) && (!lastHistoryAt || now.getTime() - lastHistoryAt >= 120_000);
      const updated = await TaskCanvas.findOneAndUpdate(
        { ...filter, version: expectedVersion },
        {
          $set: {
            scene,
            version: expectedVersion + 1,
            lastEditorUserId: actorId,
            ...(shouldSnapshot ? { lastHistoryAt: now } : {})
          }
        },
        { returnDocument: "after", runValidators: true }
      ).lean();
      if (!updated) {
        const latest = await TaskCanvas.findOne(filter).select("version").lean();
        return jsonError("CANVAS_VERSION_CONFLICT", 409, { currentVersion: latest?.version ?? null });
      }
      if (shouldSnapshot) {
        await TaskCanvasRevision.create({
          companyId: filter.companyId,
          workspaceId: filter.workspaceId,
          canvasId: canvas._id,
          version: canvas.version,
          name: canvas.name,
          scene: canvas.scene,
          createdByUserId: actorId
        });
        await pruneCompanyTaskCanvasHistory(filter.companyId, scope.historyLimit);
      }
      return jsonOk({ version: updated.version, updatedAt: new Date(updated.updatedAt).toISOString() });
    }

    if (body.action === "checkpoint") {
      const expectedVersion = validateCanvasVersion(body.expectedVersion);
      if (expectedVersion !== canvas.version) {
        return jsonError("CANVAS_VERSION_CONFLICT", 409, { currentVersion: canvas.version });
      }
      const revision = await TaskCanvasRevision.create({
        companyId: filter.companyId,
        workspaceId: filter.workspaceId,
        canvasId: canvas._id,
        version: canvas.version,
        name: canvas.name,
        scene: canvas.scene,
        createdByUserId: actorId
      });
      await pruneCompanyTaskCanvasHistory(filter.companyId, scope.historyLimit);
      return jsonOk({
        revision: {
          id: String(revision._id),
          version: revision.version,
          name: revision.name,
          createdAt: revision.createdAt.toISOString(),
          createdByUserId: String(revision.createdByUserId)
        }
      }, 201);
    }

    if (body.action === "rename") {
      if (!canManageTaskCanvas(scope, canvas)) throw new Error("FORBIDDEN");
      const name = validateTaskCanvasName(body.name);
      const updated = await TaskCanvas.findOneAndUpdate(
        filter,
        { $set: { name, lastEditorUserId: actorId } },
        { returnDocument: "after", runValidators: true }
      ).lean();
      if (!updated) throw new Error("TASK_CANVAS_NOT_FOUND");
      return jsonOk({ item: { id: String(updated._id), name: updated.name, version: updated.version } });
    }

    if (body.action === "members") {
      if (!canManageTaskCanvas(scope, canvas)) throw new Error("FORBIDDEN");
      const requested = validateCanvasMembers(body.memberUserIds);
      const ownerId = String(canvas.createdByUserId);
      const uniqueIds = [...new Set([ownerId, ...requested])];
      if (uniqueIds.length > scope.maxCollaborators) throw new Error("CANVAS_COLLABORATOR_LIMIT");
      const parsedIds = uniqueIds.map((id) => {
        if (!Types.ObjectId.isValid(id)) throw new Error("CANVAS_MEMBER_INVALID");
        return new Types.ObjectId(id);
      });
      const inviteIds = parsedIds.filter((id) => String(id) !== ownerId);
      if (inviteIds.length) {
        const [memberships, users] = await Promise.all([
          Membership.countDocuments({
            companyId: filter.companyId,
            workspaceId: filter.workspaceId,
            userId: { $in: inviteIds },
            active: true,
            employmentStatus: "ACTIVE",
            role: { $in: ["COMPANY_ADMIN", "EMPLOYEE"] }
          }),
          User.countDocuments({ _id: { $in: inviteIds }, active: { $ne: false } })
        ]);
        if (memberships !== inviteIds.length || users !== inviteIds.length) throw new Error("CANVAS_MEMBER_INVALID");
      }
      const updated = await TaskCanvas.findOneAndUpdate(
        filter,
        { $set: { memberUserIds: parsedIds, lastEditorUserId: actorId } },
        { returnDocument: "after", runValidators: true }
      ).lean();
      if (!updated) throw new Error("TASK_CANVAS_NOT_FOUND");
      return jsonOk({
        memberUserIds: updated.memberUserIds.map(String),
        memberCount: updated.memberUserIds.length,
        maxCollaborators: scope.maxCollaborators
      });
    }

    return jsonError("CANVAS_ACTION_INVALID", 400);
  } catch (error) {
    return taskCanvasErrorResponse(error, "TASK_CANVAS_UPDATE_FAILED");
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    assertSameOrigin(request);
    const scope = await requireTaskCanvasScope();
    const { canvasId } = await params;
    const filter = idsFor(scope, canvasId);
    const canvas = await TaskCanvas.findOne(filter).lean();
    if (!canvas || !canReadTaskCanvas(scope, canvas)) throw new Error("TASK_CANVAS_NOT_FOUND");
    if (!canManageTaskCanvas(scope, canvas)) throw new Error("FORBIDDEN");

    await Promise.all([
      TaskCanvas.deleteOne(filter),
      TaskCanvasRevision.deleteMany({
        canvasId: canvas._id,
        companyId: filter.companyId,
        workspaceId: filter.workspaceId
      })
    ]);
    return jsonOk({ deleted: true });
  } catch (error) {
    return taskCanvasErrorResponse(error, "TASK_CANVAS_DELETE_FAILED");
  }
}
