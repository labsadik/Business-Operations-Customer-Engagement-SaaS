import { Types } from "mongoose";
import { assertSameOrigin } from "@/lib/security";
import { jsonError, jsonOk } from "@/lib/http";
import { Membership } from "@/models/membership";
import { User } from "@/models/user";
import { TaskCanvas } from "@/models/task-canvas";
import { getCompanyTaskCanvasCount, reserveTaskCanvasSlot, releaseTaskCanvasSlot, requireTaskCanvasScope, taskCanvasErrorResponse } from "@/lib/task-canvas-authorization";
import { validateTaskCanvasName } from "@/features/task-canvas/shared/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const scope = await requireTaskCanvasScope();
    const companyId = new Types.ObjectId(scope.companyId);
    const workspaceId = new Types.ObjectId(scope.workspaceId);
    const memberFilter = scope.isManager ? {} : { memberUserIds: new Types.ObjectId(scope.session.userId) };
    const [canvases, memberships, canvasesUsed] = await Promise.all([
      TaskCanvas.find({ companyId, workspaceId, ...memberFilter })
        .select("name version createdByUserId memberUserIds updatedAt")
        .sort({ updatedAt: -1, _id: -1 })
        .limit(100)
        .lean(),
      Membership.find({ companyId, workspaceId, active: true, employmentStatus: "ACTIVE" })
        .select("userId role")
        .sort({ createdAt: 1, _id: 1 })
        .limit(250)
        .lean(),
      getCompanyTaskCanvasCount(scope.companyId)
    ]);

    const ids = memberships.map((item) => item.userId);
    const users = ids.length
      ? await User.find({ _id: { $in: ids }, active: { $ne: false } })
          .select("name email image")
          .limit(250)
          .lean()
      : [];
    const userMap = new Map(users.map((user) => [String(user._id), user]));
    const people = memberships.flatMap((membership) => {
      const user = userMap.get(String(membership.userId));
      return user ? [{
        id: String(user._id),
        name: user.name,
        email: user.email,
        image: user.image ?? null,
        role: membership.role
      }] : [];
    });

    return jsonOk({
      items: canvases.map((canvas) => {
        const memberUserIds = [...new Set((canvas.memberUserIds ?? []).map(String))];
        return {
          id: String(canvas._id),
          name: canvas.name,
          version: canvas.version,
          createdByUserId: String(canvas.createdByUserId),
          memberUserIds,
          memberCount: memberUserIds.length,
          updatedAt: new Date(canvas.updatedAt).toISOString()
        };
      }),
      people,
      limits: {
        maxCollaborators: scope.maxCollaborators,
        canvasLimit: scope.canvasLimit,
        canvasesUsed
      }
    });
  } catch (error) {
    return taskCanvasErrorResponse(error, "TASK_CANVAS_LIST_FAILED");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const scope = await requireTaskCanvasScope();
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || Array.isArray(body)) return jsonError("INVALID_JSON", 400);
    const name = validateTaskCanvasName(body.name);
    const companyId = new Types.ObjectId(scope.companyId);
    const workspaceId = new Types.ObjectId(scope.workspaceId);
    const canvasesUsed = await reserveTaskCanvasSlot(scope.companyId, scope.canvasLimit);
    const userId = new Types.ObjectId(scope.session.userId);
    const canvas = await (async () => {
      try {
        return await TaskCanvas.create({
      companyId,
      workspaceId,
      name,
      createdByUserId: userId,
      memberUserIds: [userId],
      scene: { elements: [], appState: {}, files: {} },
      version: 1,
      lastEditorUserId: userId
        });
      } catch (error) {
        await releaseTaskCanvasSlot(scope.companyId);
        throw error;
      }
    })();

    return jsonOk({
      item: {
        id: String(canvas._id),
        name: canvas.name,
        version: canvas.version,
        createdByUserId: String(canvas.createdByUserId),
        memberUserIds: [String(userId)],
        memberCount: 1,
        updatedAt: canvas.updatedAt.toISOString()
      },
      limits: {
        maxCollaborators: scope.maxCollaborators,
        canvasLimit: scope.canvasLimit,
        canvasesUsed
      }
    }, 201);
  } catch (error) {
    return taskCanvasErrorResponse(error, "TASK_CANVAS_CREATE_FAILED");
  }
}
