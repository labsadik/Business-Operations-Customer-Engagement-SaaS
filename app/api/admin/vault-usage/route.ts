import { getMongo } from "@/lib/mongodb";
import { requirePlatformAdmin } from "@/lib/admin";
import { jsonError, jsonOk } from "@/lib/http";
import { Company } from "@/models/company";
import { Subscription } from "@/models/subscription";
import { VaultUsage } from "@/models/vault-usage";
import { VaultFile } from "@/models/vault-file";
import { VaultUpload } from "@/models/vault-upload";
import { listPlansForAdmin } from "@/lib/plan-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requirePlatformAdmin();
    await getMongo();

    const [companies, plans] = await Promise.all([
      Company.find({}).select("_id name slug").sort({ name: 1, _id: 1 }).limit(5000).lean(),
      listPlansForAdmin()
    ]);
    const ids = companies.map((company) => company._id);
    const [subscriptions, usageRows, files, pendingUploads] = await Promise.all([
      Subscription.find({ companyId: { $in: ids } }).select("companyId planId status currentPeriodEnd").lean(),
      VaultUsage.find({ companyId: { $in: ids } }).select("companyId usedBytes quotaBytes usedItems").lean(),
      VaultFile.aggregate<{ _id: unknown; count: number; sizeBytes: number }>([
        { $match: { companyId: { $in: ids } } },
        { $group: { _id: "$companyId", count: { $sum: 1 }, sizeBytes: { $sum: "$sizeBytes" } } }
      ]),
      VaultUpload.aggregate<{ _id: unknown; count: number; sizeBytes: number }>([
        { $match: { companyId: { $in: ids }, status: { $in: ["OPEN", "COMPLETING"] } } },
        { $group: { _id: "$companyId", count: { $sum: 1 }, sizeBytes: { $sum: "$sizeBytes" } } }
      ])
    ]);

    const planMap = new Map(plans.map((plan) => [plan.id, plan]));
    const subscriptionMap = new Map(subscriptions.map((item) => [String(item.companyId), item]));
    const usageMap = new Map(usageRows.map((item) => [String(item.companyId), item]));
    const fileMap = new Map(files.map((item) => [String(item._id), item]));
    const pendingMap = new Map(pendingUploads.map((item) => [String(item._id), item]));

    const items = companies.map((company) => {
      const companyId = String(company._id);
      const subscription = subscriptionMap.get(companyId);
      const plan = planMap.get(subscription?.planId ?? "free") ?? null;
      const usage = usageMap.get(companyId);
      const fileStats = fileMap.get(companyId);
      const pendingStats = pendingMap.get(companyId);
      const usedBytes = usage?.usedBytes ?? ((fileStats?.sizeBytes ?? 0) + (pendingStats?.sizeBytes ?? 0));
      const usedItems = usage?.usedItems ?? ((fileStats?.count ?? 0) + (pendingStats?.count ?? 0));
      const quotaBytes = plan?.vaultEnabled ? plan.vaultQuotaBytes : 0;
      const maxFileBytes = plan?.vaultEnabled ? plan.vaultMaxFileBytes : 0;
      const maxItems = plan?.vaultEnabled ? plan.vaultMaxItems : 0;
      return {
        companyId,
        companyName: company.name,
        companySlug: company.slug,
        planId: plan?.id ?? subscription?.planId ?? "unknown",
        planName: plan?.name ?? "Unknown plan",
        vaultEnabled: Boolean(plan?.vaultEnabled),
        usedBytes,
        quotaBytes,
        availableBytes: Math.max(0, quotaBytes - usedBytes),
        usedItems,
        maxItems,
        maxFileBytes,
        fileCount: fileStats?.count ?? 0,
        pendingUploadCount: pendingStats?.count ?? 0,
        pendingUploadBytes: pendingStats?.sizeBytes ?? 0,
        quotaExceeded: Boolean(plan?.vaultEnabled && usedBytes > quotaBytes)
      };
    });

    return jsonOk({
      items,
      totals: {
        companies: items.length,
        enabledCompanies: items.filter((item) => item.vaultEnabled).length,
        usedBytes: items.reduce((sum, item) => sum + item.usedBytes, 0),
        quotaBytes: items.reduce((sum, item) => sum + item.quotaBytes, 0),
        fileCount: items.reduce((sum, item) => sum + item.fileCount, 0),
        pendingUploadCount: items.reduce((sum, item) => sum + item.pendingUploadCount, 0)
      }
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "ADMIN_VAULT_USAGE_FAILED";
    const status = code === "UNAUTHENTICATED" ? 401 : code === "FORBIDDEN" ? 403 : 500;
    return jsonError(code, status);
  }
}
