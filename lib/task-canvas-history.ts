import { Types } from "mongoose";
import { TaskCanvasRevision } from "@/models/task-canvas-revision";

const HISTORY_PRUNE_BATCH_SIZE = 250;

/**
 * Keep only the newest plan-allowed revisions across the entire company,
 * not a separate allowance for every canvas or employee.
 *
 * The indexed cursor and batched deletes bound application memory even when
 * cleaning up legacy data left behind by the old per-canvas retention rule.
 */
export async function pruneCompanyTaskCanvasHistory(companyId: string | Types.ObjectId, limit: number) {
  const tenantId = new Types.ObjectId(String(companyId));
  const safeLimit = Number.isSafeInteger(limit) ? Math.min(100, Math.max(1, limit)) : 10;
  const cursor = TaskCanvasRevision.find({ companyId: tenantId })
    .sort({ createdAt: -1, _id: -1 })
    .skip(safeLimit)
    .select("_id")
    .lean()
    .cursor({ batchSize: HISTORY_PRUNE_BATCH_SIZE });

  let batch: Types.ObjectId[] = [];
  try {
    for await (const revision of cursor) {
      batch.push(revision._id as Types.ObjectId);
      if (batch.length >= HISTORY_PRUNE_BATCH_SIZE) {
        await TaskCanvasRevision.deleteMany({ companyId: tenantId, _id: { $in: batch } });
        batch = [];
      }
    }
    if (batch.length) {
      await TaskCanvasRevision.deleteMany({ companyId: tenantId, _id: { $in: batch } });
    }
  } finally {
    await cursor.close().catch(() => undefined);
  }
}
