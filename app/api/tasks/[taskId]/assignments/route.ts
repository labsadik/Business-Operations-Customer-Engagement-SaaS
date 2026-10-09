import { Types } from "mongoose";
import { assertSameOrigin } from "@/lib/security";
import { getMongo } from "@/lib/mongodb";
import { jsonError, jsonOk } from "@/lib/http";
import { Task } from "@/models/task";
import { TaskAssignment } from "@/models/task-assignment";
import { assertAssignableEmployees, assertTaskFeatureAccess, canManageTask, requireTaskScope } from "@/features/task-management/server/task-authorization";
import { taskErrorResponse } from "@/features/task-management/server/task-errors";
import { validateAssigneeUserIds } from "@/features/task-management/shared/task-validation";
import { recordTaskEvent, type TaskNotificationDraft } from "@/features/task-management/server/task-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    assertSameOrigin(request);
    const scope = await requireTaskScope();
    await assertTaskFeatureAccess(scope);
    await getMongo();

    const { taskId } = await params;
    if (!Types.ObjectId.isValid(taskId)) return jsonError("INVALID_TASK_ID", 400);
    const task = await Task.findOne({
      _id: new Types.ObjectId(taskId),
      companyId: new Types.ObjectId(scope.companyId),
      workspaceId: new Types.ObjectId(scope.workspaceId)
    }).lean();
    if (!task) return jsonError("TASK_NOT_FOUND", 404);
    if (!canManageTask(scope, task)) return jsonError("FORBIDDEN", 403);
    if (["COMPLETED", "CANCELLED"].includes(task.status)) return jsonError("TASK_ALREADY_COMPLETED", 409);

    const body = await request.json().catch(() => null) as { assigneeUserIds?: unknown } | null;
    const userIds = validateAssigneeUserIds(body?.assigneeUserIds);
    const currentIds = new Set(task.assigneeUserIds.map(String));
    if (userIds.some((id) => currentIds.has(id))) return jsonError("ASSIGNEE_ALREADY_ASSIGNED", 409);
    const targetIds = await assertAssignableEmployees(scope, userIds);
    const now = new Date();

    await TaskAssignment.insertMany(targetIds.map((assigneeUserId) => ({
      companyId: new Types.ObjectId(scope.companyId),
      workspaceId: new Types.ObjectId(scope.workspaceId),
      taskId: task._id,
      assigneeUserId,
      assignedByUserId: new Types.ObjectId(scope.session.userId),
      status: "TODO",
      assignedAt: now,
      statusChangedAt: now
    })));

    await Task.updateOne(
      { _id: task._id, companyId: task.companyId, workspaceId: task.workspaceId },
      { $addToSet: { assigneeUserIds: { $each: targetIds } } }
    );

    const notifications: TaskNotificationDraft[] = userIds
      .filter((userId) => userId !== scope.session.userId)
      .map((userId) => ({
        recipientUserId: userId,
        type: "TASK_ASSIGNED",
        title: "New task assigned",
        message: `${scope.session.name} assigned you “${task.title}”.`,
        eventKey: `assignment:${taskId}:${userId}:${now.getTime()}`
      }));
    notifications.push({
      recipientUserId: scope.session.userId,
      type: "TASK_ASSIGNMENT_CONFIRMED",
      title: "Task assignment confirmed",
      message: `You added ${userIds.length} assignee(s) to “${task.title}”.`,
      eventKey: `assignment-confirmed:${taskId}:${scope.session.userId}:${now.getTime()}`
    });

    await recordTaskEvent({
      scope,
      taskId,
      eventType: "ASSIGNEES_ADDED",
      actorUserId: scope.session.userId,
      details: { assigneeUserIds: userIds },
      notifications
    });

    return jsonOk({
      taskId,
      addedAssigneeUserIds: userIds,
      assignedAt: now
    }, 201);
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && (error as { code?: unknown }).code === 11000) {
      return jsonError("ASSIGNEE_ALREADY_ASSIGNED", 409);
    }
    return taskErrorResponse(error, "TASK_ASSIGNMENT_FAILED");
  }
}
