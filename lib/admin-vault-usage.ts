import { Types } from "mongoose";
import { getMongo } from "@/lib/mongodb";
import { Company } from "@/models/company";
import { Subscription } from "@/models/subscription";
import { VaultFile } from "@/models/vault-file";
import { VaultUpload } from "@/models/vault-upload";
import { Plan } from "@/models/plan";
import { ensurePlanCatalog } from "@/lib/plan-catalog";
import { decodeListCursor, encodeListCursor } from "@/lib/list-pagination";
import { buildCompanyVaultRoot } from "@/features/company-vault/server/vault-storage";

export type AdminVaultUsageItem = {
  companyId: string;
  companyName: string;
  companySlug: string;
  storagePrefix: string;
  planId: string;
  planName: string;
  subscriptionStatus: "ACTIVE" | "PAST_DUE" | "CANCELLED" | "EXPIRED" | "NONE";
  vaultEnabled: boolean;
  usedBytes: number;
  quotaBytes: number;
  availableBytes: number;
  usedItems: number;
  maxItems: number;
  maxFileBytes: number;
  fileCount: number;
  pendingUploadCount: number;
  pendingUploadBytes: number;
  quotaExceeded: boolean;
};

export type AdminVaultUsageTotals = {
  companies: number;
  enabledCompanies: number;
  disabledCompanies: number;
  usedBytes: number;
  quotaBytes: number;
  availableBytes: number;
  usedItems: number;
  maxItems: number;
  fileCount: number;
  pendingUploadCount: number;
  pendingUploadBytes: number;
  overQuotaCompanies: number;
};

export type AdminVaultUsageSnapshot = {
  items: AdminVaultUsageItem[];
  totals: AdminVaultUsageTotals;
};

export type AdminVaultUsagePage = {
  items: AdminVaultUsageItem[];
  nextCursor: string | null;
};

type AdminUsageCompany = {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  vaultStorageRoot?: string | null;
};

function emptyTotals(): AdminVaultUsageTotals {
  return {
    companies: 0,
    enabledCompanies: 0,
    disabledCompanies: 0,
    usedBytes: 0,
    quotaBytes: 0,
    availableBytes: 0,
    usedItems: 0,
    maxItems: 0,
    fileCount: 0,
    pendingUploadCount: 0,
    pendingUploadBytes: 0,
    overQuotaCompanies: 0
  };
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build usage rows only for the supplied companies. List pages call this with a
 * small cursor page, keeping aggregation work bounded by the visible page size.
 */
async function buildUsageItems(companies: AdminUsageCompany[]): Promise<AdminVaultUsageItem[]> {
  if (!companies.length) return [];

  const ids = companies.map((company) => company._id);
  const [subscriptions, fileStatsRows, pendingRows] = await Promise.all([
    Subscription.find({ companyId: { $in: ids } })
      .select("companyId planId status currentPeriodEnd")
      .lean(),
    VaultFile.aggregate<{ _id: unknown; count: number; sizeBytes: number }>([
      { $match: { companyId: { $in: ids } } },
      {
        $group: {
          _id: "$companyId",
          count: { $sum: 1 },
          sizeBytes: { $sum: { $ifNull: ["$storageSizeBytes", "$sizeBytes"] } }
        }
      }
    ]),
    VaultUpload.aggregate<{ _id: unknown; count: number; sizeBytes: number }>([
      {
        $match: {
          companyId: { $in: ids },
          status: { $in: ["OPEN", "COMPLETING"] },
          expiresAt: { $gt: new Date() }
        }
      },
      {
        $lookup: {
          from: VaultFile.collection.name,
          localField: "_id",
          foreignField: "uploadId",
          as: "committedFiles"
        }
      },
      { $match: { $expr: { $eq: [{ $size: "$committedFiles" }, 0] } } },
      {
        $group: {
          _id: "$companyId",
          count: { $sum: 1 },
          sizeBytes: { $sum: "$sizeBytes" }
        }
      }
    ])
  ]);

  await ensurePlanCatalog();
  const planIds = [...new Set(["free", ...subscriptions.map((row) => String(row.planId))])];
  // Read only the plan fields needed by vault rendering; payment and invoice
  // aggregates are unrelated work on this request path.
  const planRows = await Plan.find({ identifier: { $in: planIds } })
    .select("identifier name vaultEnabled vaultQuotaBytes vaultMaxFileBytes vaultMaxItems")
    .limit(200)
    .lean();

  const now = Date.now();
  const plansById = new Map(planRows.map((plan) => [String(plan.identifier), plan]));
  const subscriptionsByCompany = new Map(subscriptions.map((row) => [String(row.companyId), row]));
  const filesByCompany = new Map(fileStatsRows.map((row) => [String(row._id), row]));
  const pendingByCompany = new Map(pendingRows.map((row) => [String(row._id), row]));

  return companies.map((company) => {
    const companyId = String(company._id);
    const subscription = subscriptionsByCompany.get(companyId);
    const subscriptionEnd = subscription?.currentPeriodEnd?.getTime() ?? 0;
    // The current subscription period governs existing entitlements, including
    // cancellation/past-due states until the period actually ends.
    const subscriptionActive = Boolean(subscription && subscriptionEnd > now);
    const status: AdminVaultUsageItem["subscriptionStatus"] = !subscription
      ? "NONE"
      : !subscriptionActive
        ? "EXPIRED"
        : subscription.status;
    const activePlanId = subscriptionActive ? subscription?.planId ?? "free" : "free";
    const plan = plansById.get(activePlanId) ?? plansById.get("free") ?? null;
    const fileStats = filesByCompany.get(companyId);
    const pendingStats = pendingByCompany.get(companyId);
    const fileCount = fileStats?.count ?? 0;
    const pendingUploadCount = pendingStats?.count ?? 0;
    const pendingUploadBytes = pendingStats?.sizeBytes ?? 0;
    const usedBytes = (fileStats?.sizeBytes ?? 0) + pendingUploadBytes;
    const usedItems = fileCount + pendingUploadCount;
    const vaultEnabled = Boolean(plan?.vaultEnabled);
    const quotaBytes = vaultEnabled ? Number(plan?.vaultQuotaBytes ?? 0) : 0;
    const maxFileBytes = vaultEnabled ? Number(plan?.vaultMaxFileBytes ?? 0) : 0;
    const maxItems = vaultEnabled ? Number(plan?.vaultMaxItems ?? 0) : 0;

    return {
      companyId,
      companyName: company.name,
      companySlug: company.slug,
      storagePrefix: company.vaultStorageRoot ?? buildCompanyVaultRoot(company.name, companyId),
      planId: plan?.identifier ?? activePlanId,
      planName: plan?.name ?? "Unknown plan",
      subscriptionStatus: status,
      vaultEnabled,
      usedBytes,
      quotaBytes,
      availableBytes: Math.max(0, quotaBytes - usedBytes),
      usedItems,
      maxItems,
      maxFileBytes,
      fileCount,
      pendingUploadCount,
      pendingUploadBytes,
      quotaExceeded: usedBytes > quotaBytes
    };
  });
}

function summarizeUsage(items: AdminVaultUsageItem[]): AdminVaultUsageTotals {
  return items.reduce<AdminVaultUsageTotals>((sum, item) => {
    sum.companies += 1;
    sum.enabledCompanies += item.vaultEnabled ? 1 : 0;
    sum.disabledCompanies += item.vaultEnabled ? 0 : 1;
    sum.usedBytes += item.usedBytes;
    sum.quotaBytes += item.quotaBytes;
    sum.availableBytes += item.availableBytes;
    sum.usedItems += item.usedItems;
    sum.maxItems += item.maxItems;
    sum.fileCount += item.fileCount;
    sum.pendingUploadCount += item.pendingUploadCount;
    sum.pendingUploadBytes += item.pendingUploadBytes;
    sum.overQuotaCompanies += item.quotaExceeded ? 1 : 0;
    return sum;
  }, emptyTotals());
}

/**
 * Page the company breakdown using a stable name/_id cursor. Only the requested
 * page's subscriptions, file metadata, and upload reservations are aggregated.
 */
export async function getAdminVaultUsagePage({
  search = "",
  cursor = null,
  limit = 10
}: {
  search?: string;
  cursor?: string | null;
  limit?: number;
} = {}): Promise<AdminVaultUsagePage> {
  await getMongo();

  const safeLimit = Math.min(50, Math.max(1, Math.floor(limit) || 10));
  const cleaned = search.trim().slice(0, 80);
  const clauses: Record<string, unknown>[] = [];

  if (cleaned) {
    const pattern = escapeRegex(cleaned);
    const alternatives: Record<string, unknown>[] = [
      { name: { $regex: pattern, $options: "i" } },
      { slug: { $regex: pattern, $options: "i" } }
    ];
    if (Types.ObjectId.isValid(cleaned)) {
      alternatives.push({ _id: new Types.ObjectId(cleaned) });
    }
    clauses.push({ $or: alternatives });
  }

  const decoded = decodeListCursor(cursor);
  if (cursor && !decoded) throw new Error("INVALID_LIST_CURSOR");
  if (decoded) {
    clauses.push({
      $or: [
        { name: { $gt: decoded.key } },
        { name: decoded.key, _id: { $gt: decoded.id } }
      ]
    });
  }

  const filter = clauses.length > 1 ? { $and: clauses } : clauses[0] ?? {};
  const rows = await Company.find(filter)
    .select("_id name slug vaultStorageRoot")
    .sort({ name: 1, _id: 1 })
    .limit(safeLimit + 1)
    .lean();

  const hasMore = rows.length > safeLimit;
  const companies = rows.slice(0, safeLimit) as AdminUsageCompany[];
  const items = await buildUsageItems(companies);
  const last = companies[companies.length - 1];

  return {
    items,
    nextCursor: hasMore && last ? encodeListCursor(last.name, last._id) : null
  };
}

/**
 * Platform-wide snapshot, retained for the admin overview and company details.
 * The vault usage route uses getAdminVaultUsagePage so its primary table can
 * render immediately without fetching and serializing every company at once.
 */
export async function getAdminVaultUsage(companyIds?: string[]): Promise<AdminVaultUsageSnapshot> {
  await getMongo();

  const objectIds = companyIds === undefined
    ? undefined
    : companyIds.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));

  if (objectIds && objectIds.length === 0) {
    return { items: [], totals: emptyTotals() };
  }

  const companyQuery = objectIds ? { _id: { $in: objectIds } } : {};
  const companies = await Company.find(companyQuery)
    .select("_id name slug vaultStorageRoot")
    .sort({ name: 1, _id: 1 })
    .lean() as AdminUsageCompany[];

  if (!companies.length) return { items: [], totals: emptyTotals() };

  const items = await buildUsageItems(companies);
  return { items, totals: summarizeUsage(items) };
}

/**
 * Compute platform-wide totals without hydrating company names, storage paths,
 * or a full array of per-company response objects. The details table uses the
 * page API; this summary path only keeps grouped aggregate rows in memory.
 */
export async function getAdminVaultUsageTotals(): Promise<AdminVaultUsageTotals> {
  await getMongo();

  const [companyCount, subscriptions, fileStatsRows, pendingRows] = await Promise.all([
    Company.countDocuments(),
    Subscription.find({})
      .select("companyId planId status currentPeriodEnd")
      .lean(),
    VaultFile.aggregate<{ _id: unknown; count: number; sizeBytes: number }>([
      {
        $group: {
          _id: "$companyId",
          count: { $sum: 1 },
          sizeBytes: { $sum: { $ifNull: ["$storageSizeBytes", "$sizeBytes"] } }
        }
      }
    ]),
    VaultUpload.aggregate<{ _id: unknown; count: number; sizeBytes: number }>([
      {
        $match: {
          status: { $in: ["OPEN", "COMPLETING"] },
          expiresAt: { $gt: new Date() }
        }
      },
      {
        $lookup: {
          from: VaultFile.collection.name,
          localField: "_id",
          foreignField: "uploadId",
          as: "committedFiles"
        }
      },
      { $match: { $expr: { $eq: [{ $size: "$committedFiles" }, 0] } } },
      {
        $group: {
          _id: "$companyId",
          count: { $sum: 1 },
          sizeBytes: { $sum: "$sizeBytes" }
        }
      }
    ])
  ]);

  await ensurePlanCatalog();
  const planIds = [...new Set(["free", ...subscriptions.map((row) => String(row.planId))])];
  const planRows = await Plan.find({ identifier: { $in: planIds } })
    .select("identifier name vaultEnabled vaultQuotaBytes vaultMaxFileBytes vaultMaxItems")
    .limit(200)
    .lean();

  const now = Date.now();
  const plansById = new Map(planRows.map((plan) => [String(plan.identifier), plan]));
  const subscriptionsByCompany = new Map(subscriptions.map((row) => [String(row.companyId), row]));
  const filesByCompany = new Map(fileStatsRows.map((row) => [String(row._id), row]));
  const pendingByCompany = new Map(pendingRows.map((row) => [String(row._id), row]));
  const companyIds = new Set([
    ...subscriptionsByCompany.keys(),
    ...filesByCompany.keys(),
    ...pendingByCompany.keys()
  ]);
  const totals = emptyTotals();
  totals.companies = companyCount;

  for (const companyId of companyIds) {
    const subscription = subscriptionsByCompany.get(companyId);
    const subscriptionEnd = subscription?.currentPeriodEnd?.getTime() ?? 0;
    const subscriptionActive = Boolean(subscription && subscriptionEnd > now);
    const activePlanId = subscriptionActive ? subscription?.planId ?? "free" : "free";
    const plan = plansById.get(activePlanId) ?? plansById.get("free") ?? null;
    const vaultEnabled = Boolean(plan?.vaultEnabled);
    const quotaBytes = vaultEnabled ? Number(plan?.vaultQuotaBytes ?? 0) : 0;
    const maxItems = vaultEnabled ? Number(plan?.vaultMaxItems ?? 0) : 0;
    const fileStats = filesByCompany.get(companyId);
    const pendingStats = pendingByCompany.get(companyId);
    const fileCount = fileStats?.count ?? 0;
    const pendingUploadCount = pendingStats?.count ?? 0;
    const pendingUploadBytes = pendingStats?.sizeBytes ?? 0;
    const usedBytes = (fileStats?.sizeBytes ?? 0) + pendingUploadBytes;
    const usedItems = fileCount + pendingUploadCount;

    if (vaultEnabled) totals.enabledCompanies += 1;
    totals.usedBytes += usedBytes;
    totals.quotaBytes += quotaBytes;
    totals.availableBytes += Math.max(0, quotaBytes - usedBytes);
    totals.usedItems += usedItems;
    totals.maxItems += maxItems;
    totals.fileCount += fileCount;
    totals.pendingUploadCount += pendingUploadCount;
    totals.pendingUploadBytes += pendingUploadBytes;
    totals.overQuotaCompanies += usedBytes > quotaBytes ? 1 : 0;
  }

  // Companies without a subscription or any vault/upload activity are not in
  // the grouped sets above. If the free plan includes vault access, account for
  // those untouched companies too instead of silently under-reporting enabled
  // vaults in the summary.
  const companiesNotInUsageGroups = Math.max(0, companyCount - companyIds.size);
  if (Boolean(plansById.get("free")?.vaultEnabled)) {
    totals.enabledCompanies += companiesNotInUsageGroups;
  }

  totals.disabledCompanies = Math.max(0, totals.companies - totals.enabledCompanies);
  return totals;
}
