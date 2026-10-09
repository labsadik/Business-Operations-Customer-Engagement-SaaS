import { Types } from "mongoose";
import { getMongo } from "@/lib/mongodb";
import { jsonOk } from "@/lib/http";
import { TaskNotification } from "@/models/task-notification";
import { Task } from "@/models/task";
import { assertTaskFeatureAccess, requireTaskScope } from "@/features/task-management/server/task-authorization";
import { taskErrorResponse } from "@/features/task-management/server/task-errors";
import { parseTaskLimit } from "@/features/task-management/server/task-pagination";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const scope = await requireTaskScope();
    await assertTaskFeatureAccess(scope);
    await getMongo();
    const limit = parseTaskLimit(new URL(request.url).searchParams.get("limit"));

    // Recipient identity is always taken from the authenticated session. It is
    // never accepted from query parameters or the request body.
    const recipientFilter = {
      companyId: new Types.ObjectId(scope.companyId),
      workspaceId: new Types.ObjectId(scope.workspaceId),
      recipientUserId: new Types.ObjectId(scope.session.userId)
    };
    const [items, unreadCount] = await Promise.all([
      TaskNotification.find(recipientFilter)
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit)
        .select("_id taskId actorUserId type title message readAt createdAt")
        .lean(),
      TaskNotification.countDocuments({ ...recipientFilter, readAt: null })
    ]);

    const taskIds = [...new Set(items.map((item) => String(item.taskId)))];
    const tasks = taskIds.length
      ? await Task.find({
          _id: { $in: taskIds.map((id) => new Types.ObjectId(id)) },
          companyId: new Types.ObjectId(scope.companyId),
          workspaceId: new Types.ObjectId(scope.workspaceId)
        }).select("_id title").lean()
      : [];
    const taskMap = new Map(tasks.map((task) => [String(task._id), { id: String(task._id), title: task.title }]));

    return jsonOk({
      items: items.map((item) => ({
        id: String(item._id),
        task: taskMap.get(String(item.taskId)) ?? null,
        actorUserId: String(item.actorUserId),
        type: item.type,
        title: item.title,
        message: item.message,
        readAt: item.readAt ?? null,
        createdAt: item.createdAt
      })),
      unreadCount
    });
  } catch (error) {
    return taskErrorResponse(error, "TASK_NOTIFICATION_LIST_FAILED");
  }
}
