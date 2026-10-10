import type { PlanEntitlements } from "@/lib/plans";
import { getPlan } from "@/lib/plans";
import { getManagedPlan } from "@/lib/plan-catalog";
import { Payment } from "@/models/payment";
import { Types } from "mongoose";

type PlanSnapshotLike = Partial<PlanEntitlements> & {
  id?: string;
  name?: string;
};

function asSnapshot(value: unknown): PlanSnapshotLike | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as PlanSnapshotLike;
}

/**
 * Resolve the complete set of plan entitlements to display on an invoice.
 *
 * Priority is deliberately per-field: the immutable invoice snapshot wins,
 * followed by the checkout snapshot, then the managed catalog and legacy
 * static catalog. The latter two sources repair fields that older invoice
 * documents never persisted (notably Task Management and Cloud Vault limits)
 * without replacing historical price, tax, plan name, or captured limits.
 */
export async function resolveInvoicePlanSnapshot(input: {
  companyId: unknown;
  paymentId?: unknown;
  planId: string;
  planSnapshot?: unknown;
}): Promise<PlanEntitlements | null> {
  const storedSnapshot = asSnapshot(input.planSnapshot);
  const entitlementKeys: Array<keyof PlanEntitlements> = [
    "id", "name", "priceInr", "maxWorkspaces", "maxCompanies", "maxEmployees",
    "monthlyMeetingLimit", "maxMeetingDurationMinutes", "maxConcurrentMeetings",
    "taskManagementEnabled", "taskManagementDailyLimit", "vaultEnabled",
    "vaultQuotaBytes", "vaultMaxFileBytes", "vaultMaxItems",
    "liveChatEnabled", "liveChatMonthlyLimit", "liveChatCustomerLimit", "liveChatAgentLimit",
    "liveChatRetentionDays", "liveChatMessageCooldownSeconds", "liveChatPdfExportEnabled", "liveChatDeleteEnabled", "validityDays",
    "freeFeatureDays", "requiresPayment"
  ];
  const needsLegacyRepair = !storedSnapshot ||
    entitlementKeys.some((key) => storedSnapshot[key] === undefined);

  let checkoutSnapshot: PlanSnapshotLike | null = null;
  const paymentId = input.paymentId == null ? "" : String(input.paymentId);

  if (needsLegacyRepair && paymentId && Types.ObjectId.isValid(paymentId)) {
    const payment = await Payment.findOne({
      _id: new Types.ObjectId(paymentId),
      companyId: input.companyId
    })
      .select("checkoutPlanSnapshot")
      .lean();
    checkoutSnapshot = asSnapshot(payment?.checkoutPlanSnapshot);
  }

  const managedPlan = needsLegacyRepair
    ? await getManagedPlan(input.planId, { includeArchived: true })
    : null;
  const legacyPlan = getPlan(input.planId);
  const sources = [
    storedSnapshot,
    checkoutSnapshot,
    managedPlan,
    legacyPlan
  ].filter((source): source is PlanSnapshotLike => Boolean(source));

  function pick<K extends keyof PlanEntitlements>(
    key: K,
    fallback: PlanEntitlements[K]
  ): PlanEntitlements[K] {
    for (const source of sources) {
      const value = source[key];
      // null is meaningful for optional limits (for example no daily task cap).
      if (value !== undefined) return value as PlanEntitlements[K];
    }
    return fallback;
  }

  const name = sources.map((source) => source.name).find((value) => typeof value === "string" && value.trim());
  const id = sources.map((source) => source.id).find((value) => typeof value === "string" && value.trim());

  if (!name && !managedPlan && !legacyPlan) return null;

  return {
    id: id || input.planId,
    name: name || managedPlan?.name || legacyPlan?.name || input.planId,
    priceInr: pick("priceInr", 0),
    maxWorkspaces: pick("maxWorkspaces", 1),
    maxCompanies: pick("maxCompanies", 1),
    maxEmployees: pick("maxEmployees", 0),
    monthlyMeetingLimit: pick("monthlyMeetingLimit", 0),
    maxMeetingDurationMinutes: pick("maxMeetingDurationMinutes", 0),
    maxConcurrentMeetings: pick("maxConcurrentMeetings", 0),
    taskManagementEnabled: pick("taskManagementEnabled", false),
    taskManagementDailyLimit: pick("taskManagementDailyLimit", 10),
    vaultEnabled: pick("vaultEnabled", false),
    vaultQuotaBytes: pick("vaultQuotaBytes", 0),
    vaultMaxFileBytes: pick("vaultMaxFileBytes", 0),
    vaultMaxItems: pick("vaultMaxItems", 0),
    liveChatEnabled: pick("liveChatEnabled", false),
    liveChatMonthlyLimit: pick("liveChatMonthlyLimit", 1000),
    liveChatCustomerLimit: pick("liveChatCustomerLimit", 500),
    liveChatAgentLimit: pick("liveChatAgentLimit", 5),
    liveChatRetentionDays: pick("liveChatRetentionDays", 30),
    liveChatMessageCooldownSeconds: pick("liveChatMessageCooldownSeconds", 15),
    liveChatPdfExportEnabled: pick("liveChatPdfExportEnabled", true),
    liveChatDeleteEnabled: pick("liveChatDeleteEnabled", true),
    validityDays: pick("validityDays", 30),
    freeFeatureDays: pick("freeFeatureDays", null),
    requiresPayment: pick("requiresPayment", false)
  };
}
