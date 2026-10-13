import { Types } from "mongoose";
import { assertSameOrigin } from "@/lib/security";
import { jsonError, jsonOk } from "@/lib/http";
import { TaskBoard } from "@/models/task-board";
import { requireTaskScope, assertTaskFeatureAccess } from "@/features/task-management/server/task-authorization";
import { taskErrorResponse } from "@/features/task-management/server/task-errors";
import { validateSprintPatch, type TaskSprintPatch } from "@/features/task-management/shared/sprint-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function filterFor(scope: { companyId: string; workspaceId: string }) {
  return { companyId: new Types.ObjectId(scope.companyId), workspaceId: new Types.ObjectId(scope.workspaceId) };
}
async function ensureBoard(scope: { companyId: string; workspaceId: string; session: { userId: string } }) {
  const filter = filterFor(scope);
  try {
    const board = await TaskBoard.findOneAndUpdate(
      filter,
      { $setOnInsert: {
        ...filter,
        sprintName: "Sprint 1",
        sprintGoal: "",
        sprintStartsAt: null,
        sprintEndsAt: null,
        sprintStatus: "PLANNING",
        updatedByUserId: new Types.ObjectId(scope.session.userId)
      } },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    ).lean();
    if (!board) throw new Error("TASK_BOARD_UPSERT_FAILED");
    return board;
  } catch (error) {
    // Simultaneous first reads can race the unique company/workspace index.
    const existing = await TaskBoard.findOne(filter).lean();
    if (existing) return existing;
    throw error;
  }
}
function serializeSprint(board: NonNullable<Awaited<ReturnType<typeof ensureBoard>>>) {
  const toIso = (value: Date | null | undefined) => value ? new Date(value).toISOString() : null;
  return {
    id: String(board._id),
    name: board.sprintName,
    goal: board.sprintGoal ?? "",
    startsAt: toIso(board.sprintStartsAt),
    endsAt: toIso(board.sprintEndsAt),
    status: board.sprintStatus,
    updatedAt: toIso(board.updatedAt)
  };
}

export async function GET() {
  try {
    const scope = await requireTaskScope();
    await assertTaskFeatureAccess(scope, { allowSuspendedRead: true });
    const board = await ensureBoard(scope);
    return jsonOk({ sprint: serializeSprint(board) });
  } catch (error) {
    return taskErrorResponse(error, "TASK_BOARD_READ_FAILED");
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const scope = await requireTaskScope();
    await assertTaskFeatureAccess(scope);
    if (!scope.isPlatformAdmin && scope.session.role !== "COMPANY_ADMIN") {
      return jsonError("FORBIDDEN", 403);
    }

    let patch: TaskSprintPatch;
    try {
      patch = validateSprintPatch(await request.json().catch(() => null));
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : "SPRINT_INPUT_INVALID", 400);
    }

    const current = await ensureBoard(scope);
    const update: Record<string, unknown> = {};
    if (patch.name !== undefined) update.sprintName = patch.name;
    if (patch.goal !== undefined) update.sprintGoal = patch.goal;
    if (patch.startsAt !== undefined) update.sprintStartsAt = patch.startsAt;
    if (patch.endsAt !== undefined) update.sprintEndsAt = patch.endsAt;
    if (patch.status !== undefined) update.sprintStatus = patch.status;

    if (patch.status === "ACTIVE" && patch.startsAt === undefined && !current.sprintStartsAt) {
      update.sprintStartsAt = new Date();
    }
    if (patch.status === "COMPLETED" && patch.endsAt === undefined && !current.sprintEndsAt) {
      update.sprintEndsAt = new Date();
    }

    const nextStart = update.sprintStartsAt !== undefined ? update.sprintStartsAt as Date | null : current.sprintStartsAt;
    const nextEnd = update.sprintEndsAt !== undefined ? update.sprintEndsAt as Date | null : current.sprintEndsAt;
    if (nextStart && nextEnd && new Date(nextStart).getTime() >= new Date(nextEnd).getTime()) {
      return jsonError("SPRINT_DATE_RANGE_INVALID", 400);
    }

    update.updatedByUserId = new Types.ObjectId(scope.session.userId);
    const updated = await TaskBoard.findOneAndUpdate(
      filterFor(scope),
      { $set: update },
      { returnDocument: "after", runValidators: true }
    ).lean();
    if (!updated) return jsonError("TASK_BOARD_NOT_FOUND", 404);

    return jsonOk({ sprint: serializeSprint(updated) });
  } catch (error) {
    return taskErrorResponse(error, "TASK_BOARD_UPDATE_FAILED");
  }
}
