import { Types } from "mongoose";
import { TaskCanvasRevision } from "@/models/task-canvas-revision";

const HISTORY_PRUNE_BATCH_SIZE = 250;

/**
 * Keep only the newest plan-allowed revisions across the entire company,
 * not a separate allowance for every canvas or employee.
 *
 * Read/delete in bounded batches instead of materializing revision documents.
 * Each query uses the company retention index and re-evaluates the newest
 * allowed window, which also avoids mutating a collection while streaming it.
 */
export async function pruneCompanyTaskCanvasHistory(companyId: string | Types.ObjectId, limit: number) {
  const tenantId = new Types.ObjectId(String(companyId));
  const safeLimit = Number.isSafeInteger(limit) ? Math.min(100, Math.max(1, limit)) : 10;

  for (;;) {
    const excess = await TaskCanvasRevision.find({ companyId: tenantId })
      .sort({ createdAt: -1, _id: -1 })
      .skip(safeLimit)
      .select("_id")
      .limit(HISTORY_PRUNE_BATCH_SIZE)
      .lean();

    if (excess.length === 0) return;

    await TaskCanvasRevision.deleteMany({
      companyId: tenantId,
      _id: { $in: excess.map((revision) => revision._id) }
    });
  }
}
