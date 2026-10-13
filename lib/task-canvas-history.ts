import { Types } from "mongoose";
import { TaskCanvasRevision } from "@/models/task-canvas-revision";

/**
 * Keep only the newest plan-allowed revisions across the entire company.
 * Fetch at most the small retention window and let MongoDB delete the overflow,
 * avoiding unbounded application memory and repeated scans of older history.
 */
export async function pruneCompanyTaskCanvasHistory(companyId: string | Types.ObjectId, limit: number) {
  const tenantId = new Types.ObjectId(String(companyId));
  const safeLimit = Number.isSafeInteger(limit) ? Math.min(100, Math.max(1, limit)) : 10;

  const keep = await TaskCanvasRevision.find({ companyId: tenantId })
    .sort({ createdAt: -1, _id: -1 })
    .limit(safeLimit)
    .select("_id")
    .lean();

  const hasExcess = await TaskCanvasRevision.exists({
    companyId: tenantId,
    _id: { $nin: keep.map((revision) => revision._id) }
  });
  if (!hasExcess) return;

  await TaskCanvasRevision.deleteMany({
    companyId: tenantId,
    _id: { $nin: keep.map((revision) => revision._id) }
  });
}
