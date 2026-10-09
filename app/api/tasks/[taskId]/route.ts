import { Types } from "mongoose";
import { getMongo } from "@/lib/mongodb";
import { assertSameOrigin } from "@/lib/security";
import { jsonError, jsonOk } from "@/lib/http";
import { Task } from "@/models/task";
import { TaskAssignment } from "@/models/task-assignment";
import { User } from "@/models/user";
import { validateTaskPatchInput } from "@/features/task-management/shared/task-validation";
import { assertTaskFeatureAccess, canManageTask, requireTaskScope } from "@/features/task-management/server/task-authorization";
import { taskErrorResponse } from "@/features/task-management/server/task-errors";
import { recordTaskEvent } from "@/features/task-management/server/task-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function visibleToUser(task: { createdByUserId: unknown; assigneeUserIds: unknown[] }, userId: string) {
  return String(task.createdByUserId) === userId || task.assigneeUserIds.some((id) => String(id) === userId);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
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
    if (!scope.isPlatformAdmin && !["COMPANY_OWNER", "COMPANY_ADMIN"].includes(scope.session.role) && !visibleToUser(task, scope.session.userId)) {
      return jsonError("TASK_NOT_FOUND", 404);
    }

    const assignments = await TaskAssignment.find({
      taskId: task._id,
      companyId: task.companyId,
      workspaceId: task.workspaceId
    }).sort({ assignedAt: 1, _id: 1 }).lean();
    const userIds = [...new Set([
      String(task.createdByUserId),
      ...assignments.map((assignment) => String(assignment.assigneeUserId))
    ])];
    const users = await User.find({ _id: { $in: userIds.map((id) => new Types.ObjectId(id)) } })
      .select("name email image")
      .lean();
    const userMap = new Map(users.map((user) => [String(user._id), {
      id: String(user._id),
      name: user.name,
      email: user.email,
      image: user.image ?? null
    }]));

    return jsonOk({
      id: String(task._id),
      title: task.title,
      description: task.description,
      priority: task.priority,
      status: task.status,
      dueAt: task.dueAt ?? null,
      startedAt: task.startedAt ?? null,
      completedAt: task.completedAt ?? null,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      createdBy: userMap.get(String(task.createdByUserId)) ?? null,
      assignments: assignments.map((assignment) => ({
        id: String(assignment._id),
        assignee: userMap.get(String(assignment.assigneeUserId)) ?? null,
        assignedByUserId: String(assignment.assignedByUserId),
        status: assignment.status,
        assignedAt: assignment.assignedAt,
        startedAt: assignment.startedAt ?? null,
        completedAt: assignment.completedAt ?? null,
        statusChangedAt: assignment.statusChangedAt
      }))
    });
  } catch (error) {
    return taskErrorResponse(error, "TASK_READ_FAILED");
  }
}

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

    const existing = await Task.findOne({
      _id: new Types.ObjectId(taskId),
      companyId: new Types.ObjectId(scope.companyId),
      workspaceId: new Types.ObjectId(scope.workspaceId)
    }).lean();
    if (!existing) return jsonError("TASK_NOT_FOUND", 404);
    if (!canManageTask(scope, existing)) return jsonError("FORBIDDEN", 403);

    const update = validateTaskPatchInput(await request.json().catch(() => null));
    const updated = await Task.findOneAndUpdate(
      { _id: existing._id, companyId: existing.companyId, workspaceId: existing.workspaceId },
      { $set: update },
      { new: true, runValidators: true }
    ).lean();
    if (!updated) return jsonError("TASK_NOT_FOUND", 404);

    const assigneeIds: string[] = (existing.assigneeUserIds as unknown[])
      .map((id: unknown) => String(id))
      .filter((id: string) => id !== scope.session.userId);
    await recordTaskEvent({
      scope,
      taskId,
      eventType: "TASK_UPDATED",
      actorUserId: scope.session.userId,
      details: { changedFields: Object.keys(update) },
      notifications: assigneeIds.map((userId: string) => ({
        recipientUserId: userId,
        type: "TASK_UPDATED" as const,
        title: "Task updated",
        message: `${scope.session.name} updated “${updated.title}”.`,
        eventKey: `task-update:${taskId}:${updated.updatedAt.getTime()}:${userId}`
      }))
    });

    return jsonOk({
      id: String(updated._id),
      title: updated.title,
      description: updated.description,
      priority: updated.priority,
      status: updated.status,
      dueAt: updated.dueAt ?? null,
      startedAt: updated.startedAt ?? null,
      completedAt: updated.completedAt ?? null,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt
    });
  } catch (error) {
    return taskErrorResponse(error, "TASK_UPDATE_FAILED");
  }
}
