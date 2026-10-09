import { Types } from "mongoose";
import { getMongo } from "@/lib/mongodb";
import { assertSameOrigin } from "@/lib/security";
import { jsonError, jsonOk } from "@/lib/http";
import { Task } from "@/models/task";
import { TaskAssignment } from "@/models/task-assignment";
import { TaskActivity } from "@/models/task-activity";
import { TaskNotification } from "@/models/task-notification";
import { TaskDailyUsage } from "@/models/task-daily-usage";
import { getTodayIso } from "@/lib/timezone";
import {
  releaseDailyTaskAssignment,
  reserveDailyTaskAssignment
} from "@/features/task-management/server/task-daily-limit";
import { TASK_PRIORITIES, TASK_STATUSES, type TaskPriority } from "@/features/task-management/shared/constants";
import { validateTaskCreateInput } from "@/features/task-management/shared/task-validation";
import { assertAssignableEmployees, assertTaskFeatureAccess, requireTaskScope } from "@/features/task-management/server/task-authorization";
import { decodeTaskCursor, encodeTaskCursor, parseTaskLimit } from "@/features/task-management/server/task-pagination";
import { taskErrorResponse } from "@/features/task-management/server/task-errors";
import { recordTaskEvent, type TaskNotificationDraft } from "@/features/task-management/server/task-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const scope = await requireTaskScope();
    const entitlements = await assertTaskFeatureAccess(scope);
    const dailyLimit: number | null = scope.isPlatformAdmin
      ? null
      : "taskManagementDailyLimit" in entitlements
        ? typeof entitlements.taskManagementDailyLimit === "number"
          ? entitlements.taskManagementDailyLimit
          : entitlements.taskManagementDailyLimit === null
            ? null
            : 10
        : 10;
    await getMongo();

    const url = new URL(request.url);
    const limit = parseTaskLimit(url.searchParams.get("limit"));
    const cursorValue = url.searchParams.get("cursor");
    const cursor = decodeTaskCursor(cursorValue);
    if (cursorValue && !cursor) return jsonError("INVALID_TASK_CURSOR", 400);

    const statusParam = url.searchParams.get("status");
    const priorityParam = url.searchParams.get("priority");
    if (statusParam && !TASK_STATUSES.includes(statusParam as (typeof TASK_STATUSES)[number])) {
      return jsonError("TASK_STATUS_INVALID", 400);
    }
    if (priorityParam && !TASK_PRIORITIES.includes(priorityParam as TaskPriority)) {
      return jsonError("TASK_PRIORITY_INVALID", 400);
    }

    const filters: Record<string, unknown>[] = [
      { companyId: new Types.ObjectId(scope.companyId), workspaceId: new Types.ObjectId(scope.workspaceId) }
    ];
    if (statusParam) filters.push({ status: statusParam });
    if (priorityParam) filters.push({ priority: priorityParam });
    if (!scope.isPlatformAdmin && !["COMPANY_OWNER", "COMPANY_ADMIN"].includes(scope.session.role)) {
      filters.push({
        $or: [
          { createdByUserId: new Types.ObjectId(scope.session.userId) },
          { assigneeUserIds: new Types.ObjectId(scope.session.userId) }
        ]
      });
    }
    if (cursor) {
      filters.push({
        $or: [
          { createdAt: { $lt: cursor.at } },
          { createdAt: cursor.at, _id: { $lt: cursor.id } }
        ]
      });
    }

    const rows = await Task.find({ $and: filters })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .select("_id companyId workspaceId createdByUserId assigneeUserIds title description priority status dueAt startedAt completedAt createdAt updatedAt")
      .lean();

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const taskIds = page.map((task) => task._id);
    const summaries = taskIds.length
      ? await TaskAssignment.aggregate<{ _id: Types.ObjectId; total: number; completed: number }>([
          { $match: { companyId: new Types.ObjectId(scope.companyId), workspaceId: new Types.ObjectId(scope.workspaceId), taskId: { $in: taskIds } } },
          { $group: { _id: "$taskId", total: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ["$status", "COMPLETED"] }, 1, 0] } } } }
        ])
      : [];
    const summaryByTask = new Map(summaries.map((item) => [String(item._id), { total: item.total, completed: item.completed }]));

    return jsonOk({
      items: page.map((task) => ({
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
        createdByUserId: String(task.createdByUserId),
        assigneeUserIds: task.assigneeUserIds.map(String),
        assignmentSummary: summaryByTask.get(String(task._id)) ?? { total: 0, completed: 0 }
      })),
      nextCursor: hasMore && page.length
        ? encodeTaskCursor(page[page.length - 1].createdAt, String(page[page.length - 1]._id))
        : null,
      usage: await (async () => {
        const dayKey = getTodayIso(scope.timezone);
        const usage = await TaskDailyUsage.findOne({
          companyId: new Types.ObjectId(scope.companyId),
          workspaceId: new Types.ObjectId(scope.workspaceId),
          dayKey
        }).select("count").lean();
        const usedToday = usage?.count ?? 0;
        return {
          enabled: true,
          usedToday,
          dailyLimit,
          remainingToday: dailyLimit === null ? null : Math.max(0, dailyLimit - usedToday)
        };
      })()
    });
  } catch (error) {
    return taskErrorResponse(error, "TASK_LIST_FAILED");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const scope = await requireTaskScope();
    const entitlements = await assertTaskFeatureAccess(scope);
    const dailyLimit =
      "taskManagementDailyLimit" in entitlements
        ? entitlements.taskManagementDailyLimit
        : null;

    const body = await request.json().catch(() => null);
    const input = validateTaskCreateInput(body);
    const assigneeIds = await assertAssignableEmployees(scope, input.assigneeUserIds);
    const createdAt = new Date();

    const task = await Task.create({
      companyId: new Types.ObjectId(scope.companyId),
      workspaceId: new Types.ObjectId(scope.workspaceId),
      createdByUserId: new Types.ObjectId(scope.session.userId),
      assigneeUserIds: assigneeIds,
      title: input.title,
      description: input.description,
      priority: input.priority,
      status: "TODO",
      dueAt: input.dueAt,
      createdAt
    });

    let dailyReservation: { dayKey: string } | null = null;
    try {
      dailyReservation = await reserveDailyTaskAssignment(scope, dailyLimit);
      await TaskAssignment.insertMany(assigneeIds.map((assigneeUserId) => ({
        companyId: new Types.ObjectId(scope.companyId),
        workspaceId: new Types.ObjectId(scope.workspaceId),
        taskId: task._id,
        assigneeUserId,
        assignedByUserId: new Types.ObjectId(scope.session.userId),
        status: "TODO",
        assignedAt: createdAt,
        statusChangedAt: createdAt
      })));
    } catch (error) {
      await TaskAssignment.deleteMany({ taskId: task._id, companyId: task.companyId, workspaceId: task.workspaceId });
      await Task.deleteOne({ _id: task._id, companyId: task.companyId, workspaceId: task.workspaceId });
      if (dailyReservation) await releaseDailyTaskAssignment(scope, dailyReservation);
      throw error;
    }

    const assigneeNotifications: TaskNotificationDraft[] = input.assigneeUserIds
      .filter((userId) => userId !== scope.session.userId)
      .map((userId) => ({
        recipientUserId: userId,
        type: "TASK_ASSIGNED" as const,
        title: "New task assigned",
        message: `${scope.session.name} assigned you “${input.title}”.`,
        eventKey: `assignment:${String(task._id)}:${userId}:${createdAt.getTime()}`
      }));
    assigneeNotifications.push({
      recipientUserId: scope.session.userId,
      type: "TASK_ASSIGNMENT_CONFIRMED" as const,
      title: "Task assignment confirmed",
      message: `Your task “${input.title}” was assigned to ${input.assigneeUserIds.length} employee(s).`,
      eventKey: `assignment-confirmed:${String(task._id)}:${scope.session.userId}:${createdAt.getTime()}`
    });

    await recordTaskEvent({
      scope,
      taskId: String(task._id),
      eventType: "TASK_CREATED",
      actorUserId: scope.session.userId,
      details: {
        title: input.title,
        priority: input.priority,
        assigneeCount: assigneeIds.length,
        dueAt: input.dueAt?.toISOString() ?? null
      },
      notifications: assigneeNotifications
    });

    return jsonOk({
      id: String(task._id),
      title: task.title,
      description: task.description,
      priority: task.priority,
      status: task.status,
      dueAt: task.dueAt ?? null,
      startedAt: null,
      completedAt: null,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      createdByUserId: scope.session.userId,
      assigneeUserIds: input.assigneeUserIds,
      assignmentSummary: { total: assigneeIds.length, completed: 0 }
    }, 201);
  } catch (error) {
    return taskErrorResponse(error, "TASK_CREATE_FAILED");
  }
}


export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const scope = await requireTaskScope();
    await assertTaskFeatureAccess(scope);
    if (!scope.isPlatformAdmin && !["COMPANY_OWNER", "COMPANY_ADMIN"].includes(scope.session.role)) {
      return jsonError("FORBIDDEN", 403);
    }

    const body = await request.json().catch(() => null) as {
      period?: unknown;
      confirm?: unknown;
    } | null;
    if (body?.confirm !== "CLEAR_CLOSED_TASKS") {
      return jsonError("TASK_CLEAR_CONFIRMATION_REQUIRED", 400);
    }

    const periods = { WEEKLY: 7, MONTHLY: 30, YEARLY: 365 } as const;
    if (typeof body.period !== "string" || !Object.hasOwn(periods, body.period)) {
      return jsonError("TASK_CLEANUP_PERIOD_INVALID", 400);
    }
    const period = body.period as keyof typeof periods;
    const cutoff = new Date(Date.now() - periods[period] * 24 * 60 * 60 * 1000);
    const tenantScope = {
      companyId: new Types.ObjectId(scope.companyId),
      workspaceId: new Types.ObjectId(scope.workspaceId)
    };
    const closedTaskFilter = {
      ...tenantScope,
      status: { $in: ["COMPLETED", "CANCELLED"] },
      updatedAt: { $gte: cutoff }
    };

    const connection = await getMongo();
    const dbSession = await connection.startSession();
    let deletedCount = 0;
    try {
      await dbSession.withTransaction(async () => {
        deletedCount = 0;
        const candidates = await Task.find(closedTaskFilter)
          .select("_id")
          .session(dbSession)
          .lean();
        if (!candidates.length) return;

        const candidateIds = candidates.map((task) => task._id);
        const deleted = await Task.deleteMany({
          ...closedTaskFilter,
          _id: { $in: candidateIds }
        }, { session: dbSession });

        // Resolve ids inside the same transaction; concurrent task reopenings
        // must not cause their assignment or audit history to be deleted.
        const stillPresent = await Task.find({
          ...tenantScope,
          _id: { $in: candidateIds }
        }).select("_id").session(dbSession).lean();
        const stillPresentIds = new Set(stillPresent.map((task) => String(task._id)));
        const deletedIds = candidateIds.filter((id) => !stillPresentIds.has(String(id)));

        if (deletedIds.length) {
          const childFilter = { ...tenantScope, taskId: { $in: deletedIds } };
          await Promise.all([
            TaskAssignment.deleteMany(childFilter, { session: dbSession }),
            TaskActivity.deleteMany(childFilter, { session: dbSession }),
            TaskNotification.deleteMany(childFilter, { session: dbSession })
          ]);
        }
        deletedCount = deleted.deletedCount ?? deletedIds.length;
      });

      return jsonOk({ deletedCount, period, days: periods[period] });
    } finally {
      await dbSession.endSession();
    }
  } catch (error) {
    return taskErrorResponse(error, "TASK_CLEAR_FAILED");
  }
}
