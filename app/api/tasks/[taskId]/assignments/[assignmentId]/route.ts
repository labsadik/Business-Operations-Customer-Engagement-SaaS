import { Types } from "mongoose";
import { assertSameOrigin } from "@/lib/security";
import { getMongo } from "@/lib/mongodb";
import { jsonError, jsonOk } from "@/lib/http";
import { Task } from "@/models/task";
import { TaskAssignment } from "@/models/task-assignment";
import { assertTaskFeatureAccess, canManageTask, requireTaskScope } from "@/features/task-management/server/task-authorization";
import { taskErrorResponse } from "@/features/task-management/server/task-errors";
import { recomputeTaskAggregate } from "@/features/task-management/server/task-status-service";
import { recordTaskEvent } from "@/features/task-management/server/task-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ taskId: string; assignmentId: string }> }
) {
  try {
    assertSameOrigin(request);
    const scope = await requireTaskScope();
    await assertTaskFeatureAccess(scope);
    await getMongo();

    const { taskId, assignmentId } = await params;
    if (!Types.ObjectId.isValid(taskId)) return jsonError("INVALID_TASK_ID", 400);
    if (!Types.ObjectId.isValid(assignmentId)) return jsonError("INVALID_ASSIGNMENT_ID", 400);
    const task = await Task.findOne({
      _id: new Types.ObjectId(taskId),
      companyId: new Types.ObjectId(scope.companyId),
      workspaceId: new Types.ObjectId(scope.workspaceId)
    }).lean();
    if (!task) return jsonError("TASK_NOT_FOUND", 404);
    if (!canManageTask(scope, task)) return jsonError("FORBIDDEN", 403);

    const assignment = await TaskAssignment.findOne({
      _id: new Types.ObjectId(assignmentId),
      taskId: task._id,
      companyId: task.companyId,
      workspaceId: task.workspaceId
    }).lean();
    if (!assignment) return jsonError("ASSIGNMENT_NOT_FOUND", 404);
    if (assignment.status === "COMPLETED") return jsonError("ASSIGNMENT_ALREADY_COMPLETED", 409);

    await TaskAssignment.deleteOne({ _id: assignment._id, taskId: task._id, companyId: task.companyId, workspaceId: task.workspaceId });
    await recomputeTaskAggregate({ taskId, companyId: scope.companyId, workspaceId: scope.workspaceId });

    await recordTaskEvent({
      scope,
      taskId,
      eventType: "ASSIGNEE_REMOVED",
      actorUserId: scope.session.userId,
      subjectUserId: String(assignment.assigneeUserId),
      details: { assignmentId },
      notifications: String(assignment.assigneeUserId) === scope.session.userId ? [] : [{
        recipientUserId: String(assignment.assigneeUserId),
        type: "TASK_UNASSIGNED",
        title: "Task assignment removed",
        message: `You were removed from “${task.title}”.`,
        eventKey: `unassigned:${taskId}:${assignmentId}`
      }]
    });

    return jsonOk({ taskId, assignmentId, removed: true });
  } catch (error) {
    return taskErrorResponse(error, "TASK_ASSIGNMENT_REMOVE_FAILED");
  }
}
