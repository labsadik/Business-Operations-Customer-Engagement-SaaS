import { Types } from "mongoose";
import { getMongo } from "@/lib/mongodb";
import { jsonError, jsonOk } from "@/lib/http";
import { Task } from "@/models/task";
import { TaskAssignment } from "@/models/task-assignment";
import { TaskActivity } from "@/models/task-activity";
import { User } from "@/models/user";
import { assertTaskFeatureAccess, requireTaskScope } from "@/features/task-management/server/task-authorization";
import { taskErrorResponse } from "@/features/task-management/server/task-errors";
import { parseTaskLimit } from "@/features/task-management/server/task-pagination";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const scope = await requireTaskScope();
    await assertTaskFeatureAccess(scope, { allowSuspendedRead: true });
    await getMongo();
    const { taskId } = await params;
    if (!Types.ObjectId.isValid(taskId)) return jsonError("INVALID_TASK_ID", 400);

    const task = await Task.findOne({
      _id: new Types.ObjectId(taskId),
      companyId: new Types.ObjectId(scope.companyId),
      workspaceId: new Types.ObjectId(scope.workspaceId)
    }).select("_id companyId workspaceId createdByUserId").lean();
    if (!task) return jsonError("TASK_NOT_FOUND", 404);
    if (!scope.isPlatformAdmin && !["COMPANY_ADMIN"].includes(scope.session.role) &&
      String(task.createdByUserId) !== scope.session.userId) {
      const assignment = await TaskAssignment.exists({
        taskId: task._id,
        companyId: task.companyId,
        workspaceId: task.workspaceId,
        assigneeUserId: new Types.ObjectId(scope.session.userId)
      });
      if (!assignment) return jsonError("TASK_NOT_FOUND", 404);
    }

    const limit = parseTaskLimit(new URL(request.url).searchParams.get("limit"));
    const items = await TaskActivity.find({
      taskId: task._id,
      companyId: new Types.ObjectId(scope.companyId),
      workspaceId: new Types.ObjectId(scope.workspaceId)
    }).sort({ occurredAt: -1, _id: -1 }).limit(limit)
      .select("_id actorUserId subjectUserId eventType fromStatus toStatus details occurredAt")
      .lean();

    const ids = [...new Set(items.flatMap((item) => [
      String(item.actorUserId),
      item.subjectUserId ? String(item.subjectUserId) : null
    ]).filter((id): id is string => Boolean(id)))];
    const users = await User.find({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) } }).select("name image").lean();
    const userMap = new Map(users.map((user) => [String(user._id), { id: String(user._id), name: user.name, image: user.image ?? null }]));

    return jsonOk({
      items: items.map((item) => ({
        id: String(item._id),
        actor: userMap.get(String(item.actorUserId)) ?? null,
        subject: item.subjectUserId ? userMap.get(String(item.subjectUserId)) ?? null : null,
        eventType: item.eventType,
        fromStatus: item.fromStatus,
        toStatus: item.toStatus,
        details: item.details ?? {},
        occurredAt: item.occurredAt
      }))
    });
  } catch (error) {
    return taskErrorResponse(error, "TASK_ACTIVITY_READ_FAILED");
  }
}
