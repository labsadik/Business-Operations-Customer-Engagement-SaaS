import { Types } from "mongoose";
import { getTodayIso } from "@/lib/timezone";
import { TaskDailyUsage } from "@/models/task-daily-usage";
import type { TaskScope } from "@/features/task-management/server/task-authorization";

const USAGE_RETENTION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

export type DailyTaskReservation = {
  dayKey: string;
};

/**
 * Reserve one task-assignment action atomically for the active company and
 * workspace. This counts a task create/assignment action once, not once per
 * assignee. The plan limit comes only from server-loaded entitlement data.
 */
export async function reserveDailyTaskAssignment(
  scope: TaskScope,
  configuredLimit: number | null | undefined
): Promise<DailyTaskReservation | null> {
  if (scope.isPlatformAdmin || configuredLimit === null) return null;

  const effectiveLimit = configuredLimit === undefined ? 10 : configuredLimit;
  if (
    !Number.isSafeInteger(effectiveLimit) ||
    effectiveLimit < 1 ||
    effectiveLimit > 1000000
  ) {
    throw new Error("TASK_LIMIT_CONFIGURATION_INVALID");
  }

  const companyId = new Types.ObjectId(scope.companyId);
  const workspaceId = new Types.ObjectId(scope.workspaceId);
  const dayKey = getTodayIso(scope.timezone);
  const filter = { companyId, workspaceId, dayKey };

  // Ensure the counter exists first. Concurrent upserts may collide on the
  // unique key; the winning document is still safe to use for atomic increments.
  try {
    await TaskDailyUsage.updateOne(
      filter,
      {
        $setOnInsert: {
          ...filter,
          count: 0,
          expiresAt: new Date(Date.now() + USAGE_RETENTION_DAYS * DAY_MS)
        }
      },
      { upsert: true, runValidators: true }
    );
  } catch (error) {
    if (
      !(typeof error === "object" && error && "code" in error &&
        (error as { code?: unknown }).code === 11000)
    ) {
      throw error;
    }
  }

  const usage = await TaskDailyUsage.findOneAndUpdate(
    { ...filter, count: { $lt: effectiveLimit } },
    { $inc: { count: 1 } },
    { new: true, runValidators: true }
  )
    .select("_id count")
    .lean();

  if (!usage) throw new Error("TASK_DAILY_LIMIT_REACHED");
  return { dayKey };
}

/** Undo a reservation only when the associated task write is rolled back. */
export async function releaseDailyTaskAssignment(
  scope: TaskScope,
  reservation: DailyTaskReservation
) {
  await TaskDailyUsage.updateOne(
    {
      companyId: new Types.ObjectId(scope.companyId),
      workspaceId: new Types.ObjectId(scope.workspaceId),
      dayKey: reservation.dayKey,
      count: { $gt: 0 }
    },
    { $inc: { count: -1 } }
  );
}
