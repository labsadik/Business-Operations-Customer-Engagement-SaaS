import { Types } from "mongoose";
import { getMongo } from "@/lib/mongodb";
import { requirePlatformAdmin } from "@/lib/admin";
import { jsonError, jsonOk } from "@/lib/http";
import { Task } from "@/models/task";
import { TaskAssignment } from "@/models/task-assignment";
import { Company } from "@/models/company";
import { User } from "@/models/user";
import { TASK_PRIORITIES, TASK_STATUSES, type TaskPriority } from "@/features/task-management/shared/constants";
import { decodeTaskCursor, encodeTaskCursor, parseTaskLimit } from "@/features/task-management/server/task-pagination";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin();
    await getMongo();
    const params = new URL(request.url).searchParams;
    const limit = parseTaskLimit(params.get("limit"));
    const cursorValue = params.get("cursor");
    const cursor = decodeTaskCursor(cursorValue);
    if (cursorValue && !cursor) return jsonError("INVALID_TASK_CURSOR", 400);

    const filters: Record<string, unknown>[] = [];
    const companyId = params.get("companyId");
    const status = params.get("status");
    const priority = params.get("priority");
    if (companyId) {
      if (!Types.ObjectId.isValid(companyId)) return jsonError("INVALID_COMPANY_ID", 400);
      filters.push({ companyId: new Types.ObjectId(companyId) });
    }
    if (status) {
      if (!TASK_STATUSES.includes(status as (typeof TASK_STATUSES)[number])) return jsonError("TASK_STATUS_INVALID", 400);
      filters.push({ status });
    }
    if (priority) {
      if (!TASK_PRIORITIES.includes(priority as TaskPriority)) return jsonError("TASK_PRIORITY_INVALID", 400);
      filters.push({ priority });
    }
    if (cursor) {
      filters.push({ $or: [{ createdAt: { $lt: cursor.at } }, { createdAt: cursor.at, _id: { $lt: cursor.id } }] });
    }

    const rows = await Task.find(filters.length ? { $and: filters } : {})
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .select("_id companyId workspaceId createdByUserId assigneeUserIds title description priority status dueAt startedAt completedAt createdAt updatedAt")
      .lean();
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const companyIds = [...new Set(page.map((task) => String(task.companyId)))];
    const actorIds = [...new Set(page.map((task) => String(task.createdByUserId)))];
    const taskIds = page.map((task) => task._id);

    const [companies, users, summaries] = await Promise.all([
      companyIds.length ? Company.find({ _id: { $in: companyIds.map((id) => new Types.ObjectId(id)) } }).select("name slug").lean() : [],
      actorIds.length ? User.find({ _id: { $in: actorIds.map((id) => new Types.ObjectId(id)) } }).select("name email").lean() : [],
      taskIds.length ? TaskAssignment.aggregate<{ _id: Types.ObjectId; total: number; completed: number }>([
        { $match: { taskId: { $in: taskIds } } },
        { $group: { _id: "$taskId", total: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ["$status", "COMPLETED"] }, 1, 0] } } } }
      ]) : []
    ]);
    const companyMap = new Map(companies.map((item) => [String(item._id), { id: String(item._id), name: item.name, slug: item.slug }]));
    const userMap = new Map(users.map((item) => [String(item._id), { id: String(item._id), name: item.name, email: item.email }]));
    const summaryMap = new Map(summaries.map((item) => [String(item._id), { total: item.total, completed: item.completed }]));

    return jsonOk({
      items: page.map((task) => ({
        id: String(task._id),
        company: companyMap.get(String(task.companyId)) ?? null,
        workspaceId: String(task.workspaceId),
        createdBy: userMap.get(String(task.createdByUserId)) ?? null,
        title: task.title,
        description: task.description,
        priority: task.priority,
        status: task.status,
        dueAt: task.dueAt ?? null,
        startedAt: task.startedAt ?? null,
        completedAt: task.completedAt ?? null,
        assigneeUserIds: task.assigneeUserIds.map(String),
        assignmentSummary: summaryMap.get(String(task._id)) ?? { total: 0, completed: 0 },
        createdAt: task.createdAt,
        updatedAt: task.updatedAt
      })),
      nextCursor: hasMore && page.length
        ? encodeTaskCursor(page[page.length - 1].createdAt, String(page[page.length - 1]._id))
        : null
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "ADMIN_TASK_LIST_FAILED";
    const status = code === "UNAUTHENTICATED" ? 401 : code === "FORBIDDEN" ? 403 : 500;
    return jsonError(code, status);
  }
}
