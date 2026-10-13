import { Types } from "mongoose";
import { assertSameOrigin } from "@/lib/security";
import { jsonError, jsonOk } from "@/lib/http";
import { TaskCanvas } from "@/models/task-canvas";
import { TaskCanvasRevision } from "@/models/task-canvas-revision";
import {
  canReadTaskCanvas,
  requireTaskCanvasScope,
  taskCanvasErrorResponse
} from "@/lib/task-canvas-authorization";
import { validateCanvasVersion } from "@/features/task-canvas/shared/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ canvasId: string }> };

function scopedFilter(scope: { companyId: string; workspaceId: string }, canvasId: string) {
  if (!Types.ObjectId.isValid(canvasId)) throw new Error("CANVAS_ID_INVALID");
  return {
    _id: new Types.ObjectId(canvasId),
    companyId: new Types.ObjectId(scope.companyId),
    workspaceId: new Types.ObjectId(scope.workspaceId)
  };
}

async function pruneHistory(filter: { canvasId: Types.ObjectId; companyId: Types.ObjectId; workspaceId: Types.ObjectId }, limit: number) {
  const excess = await TaskCanvasRevision.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .skip(limit)
    .select("_id")
    .lean();
  if (excess.length) {
    await TaskCanvasRevision.deleteMany({ ...filter, _id: { $in: excess.map((item) => item._id) } });
  }
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const scope = await requireTaskCanvasScope();
    const { canvasId } = await params;
    const filter = scopedFilter(scope, canvasId);
    const canvas = await TaskCanvas.findOne(filter).lean();
    if (!canvas || !canReadTaskCanvas(scope, canvas)) throw new Error("TASK_CANVAS_NOT_FOUND");

    const revisionFilter = {
      canvasId: canvas._id,
      companyId: filter.companyId,
      workspaceId: filter.workspaceId
    };
    const excess = await TaskCanvasRevision.find(revisionFilter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(scope.historyLimit)
      .select("_id")
      .lean();
    if (excess.length) {
      await TaskCanvasRevision.deleteMany({ ...revisionFilter, _id: { $in: excess.map((revision) => revision._id) } });
    }

    const items = await TaskCanvasRevision.find(revisionFilter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(scope.historyLimit)
      .select("version name createdAt createdByUserId")
      .lean();

    return jsonOk({
      items: items.map((revision) => ({
        id: String(revision._id),
        version: revision.version,
        name: revision.name,
        createdAt: new Date(revision.createdAt).toISOString(),
        createdByUserId: String(revision.createdByUserId)
      })),
      historyLimit: scope.historyLimit,
      currentVersion: canvas.version
    });
  } catch (error) {
    return taskCanvasErrorResponse(error, "CANVAS_HISTORY_READ_FAILED");
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    assertSameOrigin(request);
    const scope = await requireTaskCanvasScope();
    const { canvasId } = await params;
    const filter = scopedFilter(scope, canvasId);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body.revisionId !== "string" || !Types.ObjectId.isValid(body.revisionId)) {
      return jsonError("CANVAS_REVISION_ID_INVALID", 400);
    }
    const expectedVersion = validateCanvasVersion(body.expectedVersion);
    const canvas = await TaskCanvas.findOne(filter).lean();
    if (!canvas || !canReadTaskCanvas(scope, canvas)) throw new Error("TASK_CANVAS_NOT_FOUND");
    if (expectedVersion !== canvas.version) {
      return jsonError("CANVAS_VERSION_CONFLICT", 409, { currentVersion: canvas.version });
    }

    const revision = await TaskCanvasRevision.findOne({
      _id: new Types.ObjectId(body.revisionId),
      canvasId: canvas._id,
      companyId: filter.companyId,
      workspaceId: filter.workspaceId
    }).select("+scene").lean();
    if (!revision) throw new Error("CANVAS_REVISION_NOT_FOUND");

    const now = new Date();
    const updated = await TaskCanvas.findOneAndUpdate(
      { ...filter, version: expectedVersion },
      {
        $set: {
          scene: revision.scene,
          version: expectedVersion + 1,
          lastEditorUserId: new Types.ObjectId(scope.session.userId),
          lastHistoryAt: now
        }
      },
      { new: true, runValidators: true }
    ).lean();
    if (!updated) {
      const latest = await TaskCanvas.findOne(filter).select("version").lean();
      return jsonError("CANVAS_VERSION_CONFLICT", 409, { currentVersion: latest?.version ?? null });
    }

    await TaskCanvasRevision.create({
      canvasId: canvas._id,
      companyId: filter.companyId,
      workspaceId: filter.workspaceId,
      version: canvas.version,
      name: canvas.name,
      scene: canvas.scene,
      createdByUserId: new Types.ObjectId(scope.session.userId)
    });
    await pruneHistory({
      canvasId: canvas._id,
      companyId: filter.companyId,
      workspaceId: filter.workspaceId
    }, scope.historyLimit);

    return jsonOk({
      version: updated.version,
      scene: updated.scene,
      updatedAt: new Date(updated.updatedAt).toISOString()
    });
  } catch (error) {
    return taskCanvasErrorResponse(error, "CANVAS_HISTORY_RESTORE_FAILED");
  }
}
