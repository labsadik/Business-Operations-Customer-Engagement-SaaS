import { Types } from "mongoose";
import { getMongo } from "@/lib/mongodb";
import { requirePlatformAdmin } from "@/lib/admin";
import { jsonError, jsonOk } from "@/lib/http";
import { Task } from "@/models/task";
import { TaskAssignment } from "@/models/task-assignment";
import { TaskActivity } from "@/models/task-activity";
import { Company } from "@/models/company";
import { Workspace } from "@/models/workspace";
import { User } from "@/models/user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    await requirePlatformAdmin();
    await getMongo();
    const { taskId } = await params;
    if (!Types.ObjectId.isValid(taskId)) return jsonError("INVALID_TASK_ID", 400);

    const task = await Task.findById(new Types.ObjectId(taskId)).lean();
    if (!task) return jsonError("TASK_NOT_FOUND", 404);

    const [company, workspace, assignments, activity] = await Promise.all([
      Company.findById(task.companyId).select("name slug email").lean(),
      Workspace.findOne({ _id: task.workspaceId, companyId: task.companyId }).select("name").lean(),
      TaskAssignment.find({ taskId: task._id, companyId: task.companyId, workspaceId: task.workspaceId }).sort({ assignedAt: 1 }).lean(),
      TaskActivity.find({ taskId: task._id, companyId: task.companyId, workspaceId: task.workspaceId }).sort({ occurredAt: -1, _id: -1 }).limit(100).lean()
    ]);

    const userIds = [...new Set([
      String(task.createdByUserId),
      ...assignments.flatMap((item) => [String(item.assigneeUserId), String(item.assignedByUserId)]),
      ...activity.flatMap((item) => [String(item.actorUserId), item.subjectUserId ? String(item.subjectUserId) : null]).filter((id): id is string => Boolean(id))
    ])];
    const users = await User.find({ _id: { $in: userIds.map((id) => new Types.ObjectId(id)) } }).select("name email image role").lean();
    const userMap = new Map(users.map((item) => [String(item._id), {
      id: String(item._id),
      name: item.name,
      email: item.email,
      image: item.image ?? null,
      role: item.role
    }]));

    return jsonOk({
      id: String(task._id),
      company: company ? { id: String(task.companyId), name: company.name, slug: company.slug, email: company.email ?? "" } : null,
      workspace: workspace ? { id: String(task.workspaceId), name: workspace.name } : null,
      createdBy: userMap.get(String(task.createdByUserId)) ?? null,
      title: task.title,
      description: task.description,
      priority: task.priority,
      status: task.status,
      dueAt: task.dueAt ?? null,
      startedAt: task.startedAt ?? null,
      completedAt: task.completedAt ?? null,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      assignments: assignments.map((item) => ({
        id: String(item._id),
        assignee: userMap.get(String(item.assigneeUserId)) ?? null,
        assignedBy: userMap.get(String(item.assignedByUserId)) ?? null,
        status: item.status,
        assignedAt: item.assignedAt,
        startedAt: item.startedAt ?? null,
        completedAt: item.completedAt ?? null,
        statusChangedAt: item.statusChangedAt
      })),
      activity: activity.map((item) => ({
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
    const code = error instanceof Error ? error.message : "ADMIN_TASK_READ_FAILED";
    const status = code === "UNAUTHENTICATED" ? 401 : code === "FORBIDDEN" ? 403 : 500;
    return jsonError(code, status);
  }
}
