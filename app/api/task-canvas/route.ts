import { Types } from "mongoose";
import { assertSameOrigin } from "@/lib/security";
import { jsonError, jsonOk } from "@/lib/http";
import { Membership } from "@/models/membership";
import { User } from "@/models/user";
import { TaskCanvas } from "@/models/task-canvas";
import { getCompanyTaskCanvasCount, reserveTaskCanvasSlot, releaseTaskCanvasSlot, requireTaskCanvasScope, taskCanvasErrorResponse } from "@/lib/task-canvas-authorization";
import { validateTaskCanvasName } from "@/features/task-canvas/shared/validation";
import { decodeListCursor, encodeListCursor, parseListLimit } from "@/lib/list-pagination";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const scope = await requireTaskCanvasScope();
    const url = new URL(request.url);
    const list = url.searchParams.get("list");
    if (list && list !== "canvases" && list !== "people") return jsonError("TASK_CANVAS_LIST_INVALID", 400);
    const includeCanvases = list !== "people";
    const includePeople = list !== "canvases";
    const limit = parseListLimit(url.searchParams.get("limit"));
    const canvasCursorValue = includeCanvases ? url.searchParams.get("cursor") : null;
    const peopleCursorValue = includePeople ? url.searchParams.get("peopleCursor") : null;
    const canvasCursor = decodeListCursor(canvasCursorValue);
    const peopleCursor = decodeListCursor(peopleCursorValue);
    if (canvasCursorValue && !canvasCursor) return jsonError("INVALID_CANVAS_CURSOR", 400);
    if (peopleCursorValue && !peopleCursor) return jsonError("INVALID_CANVAS_PEOPLE_CURSOR", 400);
    const canvasCursorDate = canvasCursor ? new Date(canvasCursor.key) : null;
    const peopleCursorDate = peopleCursor ? new Date(peopleCursor.key) : null;
    if (canvasCursorDate && !Number.isFinite(canvasCursorDate.getTime())) return jsonError("INVALID_CANVAS_CURSOR", 400);
    if (peopleCursorDate && !Number.isFinite(peopleCursorDate.getTime())) return jsonError("INVALID_CANVAS_PEOPLE_CURSOR", 400);

    const companyId = new Types.ObjectId(scope.companyId);
    const workspaceId = new Types.ObjectId(scope.workspaceId);
    const memberFilter = scope.isManager ? {} : { memberUserIds: new Types.ObjectId(scope.session.userId) };
    const canvasFilter = {
      companyId,
      workspaceId,
      ...memberFilter,
      ...(canvasCursor && canvasCursorDate ? {
        $or: [
          { updatedAt: { $lt: canvasCursorDate } },
          { updatedAt: canvasCursorDate, _id: { $lt: canvasCursor.id } }
        ]
      } : {})
    };
    const peopleFilter = {
      companyId,
      workspaceId,
      active: true,
      employmentStatus: "ACTIVE",
      ...(peopleCursor && peopleCursorDate ? {
        $or: [
          { createdAt: { $gt: peopleCursorDate } },
          { createdAt: peopleCursorDate, _id: { $gt: peopleCursor.id } }
        ]
      } : {})
    };
    const [canvasRows, membershipRows, canvasesUsed] = await Promise.all([
      includeCanvases
        ? TaskCanvas.find(canvasFilter)
            .select("name version createdByUserId memberUserIds updatedAt")
            .sort({ updatedAt: -1, _id: -1 })
            .limit(limit + 1)
            .lean()
        : Promise.resolve([]),
      includePeople
        ? Membership.find(peopleFilter)
            .select("_id userId role createdAt")
            .sort({ createdAt: 1, _id: 1 })
            .limit(limit + 1)
            .lean()
        : Promise.resolve([]),
      getCompanyTaskCanvasCount(scope.companyId)
    ]);

    const hasMoreCanvases = canvasRows.length > limit;
    const canvasPage = hasMoreCanvases ? canvasRows.slice(0, limit) : canvasRows;
    const hasMorePeople = membershipRows.length > limit;
    const membershipPage = hasMorePeople ? membershipRows.slice(0, limit) : membershipRows;
    const ids = membershipPage.map((item) => item.userId);
    const users = ids.length
      ? await User.find({ _id: { $in: ids }, active: { $ne: false } })
          .select("name email image")
          .limit(limit)
          .lean()
      : [];
    const userMap = new Map(users.map((user) => [String(user._id), user]));
    const people = membershipPage.flatMap((membership) => {
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
      items: canvasPage.map((canvas) => {
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
      nextCursor: hasMoreCanvases && canvasPage.length
        ? encodeListCursor(canvasPage[canvasPage.length - 1].updatedAt, canvasPage[canvasPage.length - 1]._id)
        : null,
      peopleNextCursor: hasMorePeople && membershipPage.length
        ? encodeListCursor(membershipPage[membershipPage.length - 1].createdAt, membershipPage[membershipPage.length - 1]._id)
        : null,
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
