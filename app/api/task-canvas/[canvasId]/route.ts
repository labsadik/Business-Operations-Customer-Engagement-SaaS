import { Types } from "mongoose";
import { Buffer } from "node:buffer";
import { gunzipSync, gzipSync } from "node:zlib";
import { assertSameOrigin } from "@/lib/security";
import { jsonError, jsonOk } from "@/lib/http";
import { TaskCanvas } from "@/models/task-canvas";

import { Membership } from "@/models/membership";
import { User } from "@/models/user";
import {
  canManageTaskCanvas,
  canReadTaskCanvas,
  requireTaskCanvasScope,
  taskCanvasErrorResponse,
  getCompanyTaskCanvasCount,
  releaseTaskCanvasSlot
} from "@/lib/task-canvas-authorization";
import {
  TASK_CANVAS_SCENE_MAX_BYTES,
  validateCanvasMembers,
  validateCanvasVersion,
  validateTaskCanvasName,
  validateTaskCanvasScene
} from "@/features/task-canvas/shared/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ canvasId: string }> };

const MAX_SCENE_TRANSPORT_BYTES = 3_000_000;
const MAX_STORED_SCENE_BYTES = 12_000_000;
const EMPTY_SCENE = { elements: [], appState: {}, files: {} };

type DecodedScenePayload = { value: unknown; serialized?: string; compressed?: Buffer };

function decodeScenePayload(body: Record<string, unknown>): DecodedScenePayload {
  const payload = body.scenePayload;
  if (!payload) {
    // Compatibility for existing clients. New clients gzip the JSON before
    // sending it so large vector diagrams stay under serverless body limits.
    return { value: body.scene };
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("CANVAS_SCENE_INVALID");
  }
  const encoded = payload as Record<string, unknown>;
  if (encoded.encoding !== "gzip-base64" || typeof encoded.data !== "string") {
    throw new Error("CANVAS_SCENE_INVALID");
  }
  if (
    encoded.data.length > Math.ceil(MAX_SCENE_TRANSPORT_BYTES * 4 / 3) + 8 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded.data)
  ) {
    throw new Error("CANVAS_SCENE_TOO_LARGE");
  }

  const compressed = Buffer.from(encoded.data, "base64");
  if (compressed.byteLength > MAX_SCENE_TRANSPORT_BYTES) {
    throw new Error("CANVAS_SCENE_TOO_LARGE");
  }
  let serialized: string;
  try {
    serialized = gunzipSync(compressed, { maxOutputLength: TASK_CANVAS_SCENE_MAX_BYTES }).toString("utf8");
  } catch {
    throw new Error("CANVAS_SCENE_INVALID");
  }
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new Error("CANVAS_SCENE_INVALID");
  }
  return { value, serialized, compressed };
}

function compressSceneForStorage(scene: unknown, serialized?: string, compressedPayload?: Buffer) {
  // Reuse the already-compressed browser payload instead of spending CPU
  // compressing the same vector JSON twice on every autosave.
  if (compressedPayload) {
    if (compressedPayload.byteLength > MAX_STORED_SCENE_BYTES) throw new Error("CANVAS_SCENE_TOO_LARGE");
    return compressedPayload;
  }
  let source: string;
  try {
    source = serialized ?? JSON.stringify(scene);
  } catch {
    throw new Error("CANVAS_SCENE_INVALID");
  }
  const raw = Buffer.from(source, "utf8");
  if (raw.byteLength > TASK_CANVAS_SCENE_MAX_BYTES) throw new Error("CANVAS_SCENE_TOO_LARGE");
  const compressed = gzipSync(raw, { level: 6 });
  // MongoDB documents have a 16 MiB BSON ceiling; leave ample space for
  // tenant metadata and future fields instead of approaching the hard limit.
  if (compressed.byteLength > MAX_STORED_SCENE_BYTES) throw new Error("CANVAS_SCENE_TOO_LARGE");
  return compressed;
}

function readCanvasScene(canvas: { scene?: unknown; sceneGzip?: unknown }) {
  if (canvas.sceneGzip) {
    try {
      const compressed = Buffer.isBuffer(canvas.sceneGzip)
        ? canvas.sceneGzip
        : Buffer.from(canvas.sceneGzip as Uint8Array);
      const serialized = gunzipSync(compressed, { maxOutputLength: TASK_CANVAS_SCENE_MAX_BYTES }).toString("utf8");
      return JSON.parse(serialized) as unknown;
    } catch {
      throw new Error("CANVAS_SCENE_STORED_INVALID");
    }
  }
  return canvas.scene ?? EMPTY_SCENE;
}

function idsFor(scope: { companyId: string; workspaceId: string }, canvasId: string) {
  if (!Types.ObjectId.isValid(canvasId)) throw new Error("CANVAS_ID_INVALID");
  return {
    _id: new Types.ObjectId(canvasId),
    companyId: new Types.ObjectId(scope.companyId),
    workspaceId: new Types.ObjectId(scope.workspaceId)
  };
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
    const canvasesUsed = await getCompanyTaskCanvasCount(scope.companyId);
    return jsonOk({
      item,
      scene: readCanvasScene(canvas),
      limits: {
        maxCollaborators: scope.maxCollaborators,
        canvasLimit: scope.canvasLimit,
        canvasesUsed
      }
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

    const canvas = await TaskCanvas.findOne(filter).select("version createdByUserId memberUserIds").lean();
    if (!canvas || !canReadTaskCanvas(scope, canvas)) throw new Error("TASK_CANVAS_NOT_FOUND");
    const actorId = new Types.ObjectId(scope.session.userId);

    if (body.action === "save") {
      const expectedVersion = validateCanvasVersion(body.expectedVersion);
      const decodedScene = decodeScenePayload(body);
      const scene = validateTaskCanvasScene(decodedScene.value, decodedScene.serialized);
      const compressedScene = compressSceneForStorage(scene, decodedScene.serialized, decodedScene.compressed);
      if (expectedVersion !== canvas.version) {
        return jsonError("CANVAS_VERSION_CONFLICT", 409, { currentVersion: canvas.version });
      }

      const updated = await TaskCanvas.findOneAndUpdate(
        { ...filter, version: expectedVersion },
        {
          $set: {
            sceneGzip: compressedScene,
            version: expectedVersion + 1,
            lastEditorUserId: actorId
          },
          $unset: { scene: "" }
        },
        { returnDocument: "after", runValidators: true }
      ).lean();
      if (!updated) {
        const latest = await TaskCanvas.findOne(filter).select("version").lean();
        return jsonError("CANVAS_VERSION_CONFLICT", 409, { currentVersion: latest?.version ?? null });
      }

      return jsonOk({ version: updated.version, updatedAt: new Date(updated.updatedAt).toISOString() });
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

    const result = await TaskCanvas.deleteOne(filter);
    if (result.deletedCount) await releaseTaskCanvasSlot(scope.companyId);
    const canvasesUsed = await getCompanyTaskCanvasCount(scope.companyId);
    return jsonOk({
      deleted: Boolean(result.deletedCount),
      limits: { maxCollaborators: scope.maxCollaborators, canvasLimit: scope.canvasLimit, canvasesUsed }
    });
  } catch (error) {
    return taskCanvasErrorResponse(error, "TASK_CANVAS_DELETE_FAILED");
  }
}
