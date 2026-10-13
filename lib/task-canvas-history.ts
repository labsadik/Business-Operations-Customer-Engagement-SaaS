import { Types } from "mongoose";
import { TaskCanvasRevision } from "@/models/task-canvas-revision";

/**
 * Keep only the newest plan-allowed revisions across the entire company.
 * Retain at most the configured number of IDs in application memory and use
 * the company/createdAt index to delete older records without scanning their
 * scene payloads or loading a company's complete revision history.
 */
export async function pruneCompanyTaskCanvasHistory(companyId: string | Types.ObjectId, limit: number) {
  const tenantId = new Types.ObjectId(String(companyId));
  const safeLimit = Number.isSafeInteger(limit) ? Math.min(100, Math.max(1, limit)) : 10;

  const keep = await TaskCanvasRevision.find({ companyId: tenantId })
    .sort({ createdAt: -1, _id: -1 })
    .limit(safeLimit)
    .select("_id createdAt")
    .lean();

  if (keep.length < safeLimit) return;

  const oldestKept = keep[keep.length - 1];
  const overflow = {
    companyId: tenantId,
    $or: [
      { createdAt: { $lt: oldestKept.createdAt } },
      { createdAt: oldestKept.createdAt, _id: { $lt: oldestKept._id } }
    ]
  };

  if (!(await TaskCanvasRevision.exists(overflow))) return;
  await TaskCanvasRevision.deleteMany(overflow);
}
