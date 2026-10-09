import { Types } from "mongoose";
import { assertSameOrigin } from "@/lib/security";
import { getMongo } from "@/lib/mongodb";
import { jsonError, jsonOk } from "@/lib/http";
import { Task } from "@/models/task";
import { TaskAssignment } from "@/models/task-assignment";
import { validateAssignmentStatus } from "@/features/task-management/shared/task-validation";
import { assertTaskFeatureAccess, canManageTask, requireTaskScope } from "@/features/task-management/server/task-authorization";
import { taskErrorResponse } from "@/features/task-management/server/task-errors";
import { recomputeTaskAggregate } from "@/features/task-management/server/task-status-service";
import { recordTaskEvent } from "@/features/task-management/server/task-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
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

    const body = await request.json().catch(() => null) as { status?: unknown; assignmentId?: unknown } | null;
    const status = validateAssignmentStatus(body?.status);
    const manager = canManageTask(scope, task);
    if (status === "CANCELLED" && !manager) return jsonError("FORBIDDEN", 403);

    if (manager && body?.assignmentId !== undefined &&
      (typeof body.assignmentId !== "string" || !Types.ObjectId.isValid(body.assignmentId))) {
      return jsonError("INVALID_ASSIGNMENT_ID", 400);
    }

    const assignment = manager && typeof body?.assignmentId === "string"
      ? await TaskAssignment.findOne({
          _id: new Types.ObjectId(body.assignmentId),
          taskId: task._id,
          companyId: task.companyId,
          workspaceId: task.workspaceId
        }).lean()
      : await TaskAssignment.findOne({
          taskId: task._id,
          companyId: task.companyId,
          workspaceId: task.workspaceId,
          assigneeUserId: new Types.ObjectId(scope.session.userId)
        }).lean();
    if (!assignment) return jsonError("ASSIGNMENT_NOT_FOUND", 404);
    if (!manager && String(assignment.assigneeUserId) !== scope.session.userId) return jsonError("FORBIDDEN", 403);
    if (assignment.status === status) {
      return jsonOk({ taskId, assignmentId: String(assignment._id), status, unchanged: true });
    }
    if (assignment.status === "CANCELLED" || task.status === "CANCELLED") return jsonError("TASK_ALREADY_CANCELLED", 409);

    const now = new Date();
    const update: Record<string, unknown> = {
      status,
      statusChangedAt: now,
      completedAt: status === "COMPLETED" ? now : null
    };
    if (["IN_PROGRESS", "COMPLETED"].includes(status) && !assignment.startedAt) update.startedAt = now;
    const updatedAssignment = await TaskAssignment.findOneAndUpdate(
      {
        _id: assignment._id,
        taskId: task._id,
        companyId: task.companyId,
        workspaceId: task.workspaceId,
        status: assignment.status
      },
      { $set: update },
      { returnDocument: "after", runValidators: true }
    ).lean();
    if (!updatedAssignment) return jsonError("TASK_STATUS_CONFLICT", 409);

    const aggregate = await recomputeTaskAggregate({
      taskId,
      companyId: scope.companyId,
      workspaceId: scope.workspaceId
    });

    const actorIsCreator = String(task.createdByUserId) === scope.session.userId;
    const notifyUserId = actorIsCreator
      ? String(assignment.assigneeUserId)
      : String(task.createdByUserId);
    const shouldNotify = notifyUserId !== scope.session.userId;
    const isTaskCompleted = aggregate.status === "COMPLETED" && status === "COMPLETED";
    const notificationType = isTaskCompleted ? "TASK_COMPLETED" as const : "TASK_STATUS_CHANGED" as const;

    await recordTaskEvent({
      scope,
      taskId,
      eventType: "ASSIGNEE_STATUS_CHANGED",
      actorUserId: scope.session.userId,
      subjectUserId: String(assignment.assigneeUserId),
      fromStatus: assignment.status,
      toStatus: status,
      details: { assignmentId: String(assignment._id), aggregateTaskStatus: aggregate.status },
      notifications: shouldNotify ? [{
        recipientUserId: notifyUserId,
        type: notificationType,
        title: isTaskCompleted ? "Task completed" : "Task status updated",
        message: isTaskCompleted
          ? `“${task.title}” has been completed.`
          : `${scope.session.name} changed “${task.title}” to ${status.replaceAll("_", " ").toLowerCase()}.`,
        eventKey: `status:${assignment._id}:${status}:${now.getTime()}`
      }] : []
    });

    return jsonOk({
      taskId,
      assignmentId: String(updatedAssignment._id),
      assignmentStatus: updatedAssignment.status,
      statusChangedAt: updatedAssignment.statusChangedAt,
      startedAt: updatedAssignment.startedAt ?? null,
      completedAt: updatedAssignment.completedAt ?? null,
      taskStatus: aggregate.status,
      taskStartedAt: aggregate.startedAt,
      taskCompletedAt: aggregate.completedAt
    });
  } catch (error) {
    return taskErrorResponse(error, "TASK_STATUS_UPDATE_FAILED");
  }
}
