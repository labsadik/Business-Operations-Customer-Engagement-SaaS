import { Types } from "mongoose";
import { getMongo } from "@/lib/mongodb";
import { Company } from "@/models/company";
import { Subscription } from "@/models/subscription";
import { VaultFile } from "@/models/vault-file";
import { VaultUpload } from "@/models/vault-upload";
import { listPlansForAdmin } from "@/lib/plan-catalog";
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

/**
 * Read the platform-wide or selected-company vault snapshot from committed file
 * metadata plus active, uncommitted upload reservations. Bunny credentials and
 * object contents are never read or sent to the browser.
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
    .lean();

  if (!companies.length) return { items: [], totals: emptyTotals() };

  const ids = companies.map((company) => company._id);
  const [subscriptions, fileStatsRows, pendingRows, plans] = await Promise.all([
    Subscription.find({ companyId: { $in: ids } })
      .select("companyId planId status currentPeriodEnd")
      .lean(),
    VaultFile.aggregate<{ _id: unknown; count: number; sizeBytes: number }>([
      { $match: { companyId: { $in: ids } } },
      {
        $group: {
          _id: "$companyId",
          count: { $sum: 1 },
          sizeBytes: {
            $sum: { $ifNull: ["$storageSizeBytes", "$sizeBytes"] }
          }
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
    ]),
    listPlansForAdmin()
  ]);

  const now = Date.now();
  const plansById = new Map(plans.map((plan) => [plan.id, plan]));
  const subscriptionsByCompany = new Map(subscriptions.map((row) => [String(row.companyId), row]));
  const filesByCompany = new Map(fileStatsRows.map((row) => [String(row._id), row]));
  const pendingByCompany = new Map(pendingRows.map((row) => [String(row._id), row]));

  const items: AdminVaultUsageItem[] = companies.map((company) => {
    const companyId = String(company._id);
    const subscription = subscriptionsByCompany.get(companyId);
    const subscriptionEnd = subscription?.currentPeriodEnd?.getTime() ?? 0;
    // Vault access follows the company's current subscription period, as does
    // getCompanyEntitlements. A cancelled or past-due subscription can retain
    // its already-granted plan until the period ends.
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
      planId: plan?.id ?? activePlanId,
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

  const totals = items.reduce<AdminVaultUsageTotals>((sum, item) => {
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

  return { items, totals };
}
