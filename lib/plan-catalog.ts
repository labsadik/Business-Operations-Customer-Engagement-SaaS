import { getMongo } from "@/lib/mongodb";
import { PLANS, PLAN_IDS, type PlanEntitlements } from "@/lib/plans";
import { Plan } from "@/models/plan";
import { Subscription } from "@/models/subscription";
import { Payment } from "@/models/payment";
import { Invoice } from "@/models/invoice";

import {
  calculatePlanPricing,
  isPlanPubliclyPurchasable,
  PLAN_DISCOUNT_TYPES,
  PLAN_STATUSES,
  validatePlanDraft,
  type PlanDiscountType,
  type PlanStatus
} from "@/lib/plan-rules";

export {
  calculatePlanPricing,
  isPlanPubliclyPurchasable,
  PLAN_DISCOUNT_TYPES,
  PLAN_STATUSES,
  validatePlanDraft
} from "@/lib/plan-rules";

export type { PlanDiscountType, PlanPricing, PlanStatus } from "@/lib/plan-rules";

export type ManagedPlan = PlanEntitlements & {
  description: string;
  status: PlanStatus;
  popular: boolean;
  recommended: boolean;
  discountType: PlanDiscountType;
  discountValue: number;
  revision: number;
  sortOrder: number;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId?: string;
  updatedByUserId?: string;
};

export type PublicPlan = Omit<ManagedPlan, "status"> & {
  status: Exclude<PlanStatus, "PRIVATE">;
  discountAmountInr: number;
  finalPriceInr: number;
};

export type AdminPlan = ManagedPlan & {
  activeSubscriptionCount: number;
  paymentCount: number;
  invoiceCount: number;
};

const LEGACY_DESCRIPTIONS: Record<string, string> = {
  free: "A small workspace for trying the core scheduling workflow.",
  starter: "For small teams that need reliable scheduling capacity.",
  elite: "For growing teams with higher meeting and employee limits.",
  pro: "For established teams running scheduling at higher volume.",
  plus: "The highest standard capacity in the current Conventus catalog."
};

const seedPromiseState: { promise: Promise<void> | null } = { promise: null };

function identifierFrom(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function createEntitlementSnapshot(plan: PlanEntitlements): PlanEntitlements {
  return {
    id: plan.id,
    name: plan.name,
    priceInr: plan.priceInr,
    maxWorkspaces: plan.maxWorkspaces,
    maxCompanies: plan.maxCompanies,
    maxEmployees: plan.maxEmployees,
    monthlyMeetingLimit: plan.monthlyMeetingLimit,
    maxMeetingDurationMinutes: plan.maxMeetingDurationMinutes,
    maxConcurrentMeetings: plan.maxConcurrentMeetings,
    taskManagementEnabled: Boolean(plan.taskManagementEnabled),
    taskManagementDailyLimit:
      (plan as Partial<PlanEntitlements>).taskManagementDailyLimit === undefined
        ? 10
        : plan.taskManagementDailyLimit,
    vaultEnabled: Boolean((plan as Partial<PlanEntitlements>).vaultEnabled),
    vaultQuotaBytes: (plan as Partial<PlanEntitlements>).vaultQuotaBytes ?? 5368709120,
    vaultMaxFileBytes: (plan as Partial<PlanEntitlements>).vaultMaxFileBytes ?? 104857600,
    vaultMaxItems: (plan as Partial<PlanEntitlements>).vaultMaxItems ?? 1000,
    validityDays: plan.validityDays,
    freeFeatureDays: plan.freeFeatureDays,
    requiresPayment: plan.requiresPayment
  };
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function isValidEntitlementSnapshot(value: unknown): value is PlanEntitlements {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;

  return (
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    typeof item.priceInr === "number" &&
    Number.isFinite(item.priceInr) &&
    isPositiveSafeInteger(item.maxWorkspaces) &&
    isPositiveSafeInteger(item.maxCompanies) &&
    isPositiveSafeInteger(item.maxEmployees) &&
    isPositiveSafeInteger(item.monthlyMeetingLimit) &&
    isPositiveSafeInteger(item.maxMeetingDurationMinutes) &&
    isPositiveSafeInteger(item.maxConcurrentMeetings) &&
    (item.taskManagementEnabled === undefined || typeof item.taskManagementEnabled === "boolean") &&
    (
      item.taskManagementDailyLimit === undefined ||
      item.taskManagementDailyLimit === null ||
      isPositiveSafeInteger(item.taskManagementDailyLimit)
    ) &&
    (item.vaultEnabled === undefined || typeof item.vaultEnabled === "boolean") &&
    (item.vaultQuotaBytes === undefined || isPositiveSafeInteger(item.vaultQuotaBytes)) &&
    (item.vaultMaxFileBytes === undefined || isPositiveSafeInteger(item.vaultMaxFileBytes)) &&
    (item.vaultMaxItems === undefined || isPositiveSafeInteger(item.vaultMaxItems)) &&
    isPositiveSafeInteger(item.validityDays) &&
    (
      item.freeFeatureDays === null ||
      isNonNegativeSafeInteger(item.freeFeatureDays)
    ) &&
    typeof item.requiresPayment === "boolean"
  );
}

export function serializeManagedPlan(doc: any): ManagedPlan {
  const id = identifierFrom(doc.identifier) || identifierFrom(doc.planId) || identifierFrom(doc.id);
  return {
    id,
    name: doc.name,
    description: doc.description ?? "",
    priceInr: Number(doc.priceInr),
    maxWorkspaces: Number(doc.maxWorkspaces),
    maxCompanies: Number(doc.maxCompanies),
    maxEmployees: Number(doc.maxEmployees),
    monthlyMeetingLimit: Number(doc.monthlyMeetingLimit),
    maxMeetingDurationMinutes: Number(doc.maxMeetingDurationMinutes),
    maxConcurrentMeetings: Number(doc.maxConcurrentMeetings),
    taskManagementEnabled: Boolean(doc.taskManagementEnabled),
    taskManagementDailyLimit:
      doc.taskManagementDailyLimit === undefined
        ? 10
        : doc.taskManagementDailyLimit === null
          ? null
          : Number(doc.taskManagementDailyLimit),
    vaultEnabled: Boolean(doc.vaultEnabled),
    vaultQuotaBytes: Number(doc.vaultQuotaBytes ?? 5368709120),
    vaultMaxFileBytes: Number(doc.vaultMaxFileBytes ?? 104857600),
    vaultMaxItems: Number(doc.vaultMaxItems ?? 1000),
    validityDays: Number(doc.validityDays),
    freeFeatureDays: doc.freeFeatureDays == null ? null : Number(doc.freeFeatureDays),
    requiresPayment: Boolean(doc.requiresPayment),
    status: doc.status as PlanStatus,
    popular: Boolean(doc.popular),
    recommended: Boolean(doc.recommended),
    discountType: doc.discountType as PlanDiscountType,
    discountValue: Number(doc.discountValue ?? 0),
    revision: Number(doc.revision ?? 1),
    sortOrder: Number(doc.sortOrder ?? 1000),
    archivedAt: doc.archivedAt ? new Date(doc.archivedAt) : null,
    createdAt: new Date(doc.createdAt),
    updatedAt: new Date(doc.updatedAt),
    createdByUserId: doc.createdByUserId ? String(doc.createdByUserId) : undefined,
    updatedByUserId: doc.updatedByUserId ? String(doc.updatedByUserId) : undefined
  };
}

function legacyPlanCandidateQuery(id: string, plan: PlanEntitlements) {
  return {
    $or: [
      { planId: id },
      { id },
      { slug: id },
      { code: id },
      {
        name: {
          $regex: new RegExp("^" + plan.name + "$", "i")
        }
      }
    ],
    $and: [
      {
        $or: [
          { identifier: { $exists: false } },
          { identifier: null },
          { identifier: "" },
          { identifier: "undefined" }
        ]
      }
    ]
  };
}

async function seedLegacyPlans() {
  await Promise.all(
    PLAN_IDS.map(async (id, index) => {
      const plan = PLANS[id];

      const current = await Plan.findOne({ identifier: id }).select({ _id: 1 }).lean();
      if (current) return;

      const legacyRow = await Plan.findOne(
        legacyPlanCandidateQuery(id, plan)
      ).select({ _id: 1 }).lean();

      if (legacyRow) {
        await Plan.updateOne(
          { _id: legacyRow._id },
          { $set: { identifier: id } }
        );
        return;
      }

      await Plan.updateOne(
        { identifier: id },
        {
          $setOnInsert: {
            identifier: id,
            name: plan.name,
            description: LEGACY_DESCRIPTIONS[id] ?? "",
            status: "PUBLIC",
            popular: false,
            recommended: false,
            priceInr: plan.priceInr,
            discountType: "NONE",
            discountValue: 0,
            maxWorkspaces: plan.maxWorkspaces,
            maxCompanies: plan.maxCompanies,
            maxEmployees: plan.maxEmployees,
            monthlyMeetingLimit: plan.monthlyMeetingLimit,
            maxMeetingDurationMinutes: plan.maxMeetingDurationMinutes,
            maxConcurrentMeetings: plan.maxConcurrentMeetings,
            taskManagementEnabled: Boolean(plan.taskManagementEnabled),
            taskManagementDailyLimit: plan.taskManagementDailyLimit ?? 10,
            vaultEnabled: false,
            vaultQuotaBytes: 5368709120,
            vaultMaxFileBytes: 104857600,
            vaultMaxItems: 1000,
            validityDays: plan.validityDays,
            freeFeatureDays: plan.freeFeatureDays,
            requiresPayment: plan.requiresPayment,
            revision: 1,
            sortOrder: index,
            archivedAt: null
          }
        },
        { upsert: true }
      );
    })
  );
}

export async function ensurePlanCatalog() {
  if (!seedPromiseState.promise) {
    seedPromiseState.promise = (async () => {
      await getMongo();
      await seedLegacyPlans();
    })().catch((error) => {
      seedPromiseState.promise = null;
      throw error;
    });
  }
  await seedPromiseState.promise;
}

export async function getManagedPlan(identifier: string, options: { includeArchived?: boolean } = {}) {
  const id = identifierFrom(identifier);
  if (!id) return null;
  await ensurePlanCatalog();
  const doc = await Plan.findOne({
    identifier: id,
    ...(options.includeArchived ? {} : { archivedAt: null })
  }).lean();
  return doc ? serializeManagedPlan(doc) : null;
}

export async function getPlanForCheckout(identifier: string) {
  const plan = await getManagedPlan(identifier);
  if (!plan) throw new Error("PLAN_NOT_FOUND");
  if (plan.archivedAt) throw new Error("PLAN_NOT_FOUND");
  if (!isPlanPubliclyPurchasable(plan)) {
    throw new Error(plan.status === "COMING_SOON" ? "PLAN_COMING_SOON" : "PLAN_PRIVATE");
  }
  if (!plan.requiresPayment || plan.priceInr <= 0) throw new Error("PLAN_NOT_PAYABLE");
  calculatePlanPricing(plan.priceInr, plan.discountType, plan.discountValue);
  return plan;
}

export async function listPublicPlans(): Promise<PublicPlan[]> {
  try {
    await ensurePlanCatalog();
    const docs = await Plan.find({
      archivedAt: null,
      status: { $in: ["PUBLIC", "COMING_SOON"] }
    })
      .sort({ sortOrder: 1, createdAt: 1, _id: 1 })
      .limit(100)
      .lean();

    return docs
      .map(serializeManagedPlan)
      .filter(
        (plan): plan is ManagedPlan & { status: Exclude<PlanStatus, "PRIVATE"> } =>
          plan.status !== "PRIVATE"
      )
      .filter((plan) => {
        try {
          calculatePlanPricing(plan.priceInr, plan.discountType, plan.discountValue);
          return true;
        } catch {
          return false;
        }
      })
      .map((plan) => ({
        ...plan,
        discountAmountInr: calculatePlanPricing(plan.priceInr, plan.discountType, plan.discountValue).discountAmountInr,
        finalPriceInr: calculatePlanPricing(plan.priceInr, plan.discountType, plan.discountValue).finalPriceInr
      }));
  } catch {
    return [];
  }
}

export async function listPlansForAdmin(): Promise<AdminPlan[]> {
  await ensurePlanCatalog();
  const docs = await Plan.find({})
    .sort({ archivedAt: 1, sortOrder: 1, createdAt: 1, _id: 1 })
    .limit(200)
    .lean();

  const identifiers = docs.map((doc) => String(doc.identifier));
  if (!identifiers.length) return [];

  const [subscriptionCounts, paymentCounts, invoiceCounts] = await Promise.all([
    Subscription.aggregate<{ _id: string; count: number }>([
      { $match: { planId: { $in: identifiers }, status: "ACTIVE" } },
      { $group: { _id: "$planId", count: { $sum: 1 } } }
    ]),
    Payment.aggregate<{ _id: string; count: number }>([
      { $match: { planId: { $in: identifiers } } },
      { $group: { _id: "$planId", count: { $sum: 1 } } }
    ]),
    Invoice.aggregate<{ _id: string; count: number }>([
      { $match: { planId: { $in: identifiers } } },
      { $group: { _id: "$planId", count: { $sum: 1 } } }
    ])
  ]);

  const activeMap = new Map(subscriptionCounts.map((row) => [row._id, row.count]));
  const paymentMap = new Map(paymentCounts.map((row) => [row._id, row.count]));
  const invoiceMap = new Map(invoiceCounts.map((row) => [row._id, row.count]));

  return docs
    .map((doc) => ({ doc, id: identifierFrom(doc.identifier) || identifierFrom(doc.planId) || identifierFrom(doc.id) }))
    .filter(({ id }) => /^[a-z][a-z0-9_-]{1,63}$/.test(id))
    .map(({ doc }) => {
      const plan = serializeManagedPlan(doc);
      return {
        ...plan,
        activeSubscriptionCount: activeMap.get(plan.id) ?? 0,
        paymentCount: paymentMap.get(plan.id) ?? 0,
        invoiceCount: invoiceMap.get(plan.id) ?? 0
      };
    });
}

export function serializePublicPlan(plan: ManagedPlan) {
  const pricing = calculatePlanPricing(plan.priceInr, plan.discountType, plan.discountValue);
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    status: plan.status,
    popular: plan.popular,
    recommended: plan.recommended,
    priceInr: plan.priceInr,
    discountType: plan.discountType,
    discountValue: plan.discountValue,
    discountAmountInr: pricing.discountAmountInr,
    finalPriceInr: pricing.finalPriceInr,
    maxWorkspaces: plan.maxWorkspaces,
    maxCompanies: plan.maxCompanies,
    maxEmployees: plan.maxEmployees,
    monthlyMeetingLimit: plan.monthlyMeetingLimit,
    maxMeetingDurationMinutes: plan.maxMeetingDurationMinutes,
    maxConcurrentMeetings: plan.maxConcurrentMeetings,
    taskManagementEnabled: Boolean(plan.taskManagementEnabled),
    taskManagementDailyLimit: plan.taskManagementDailyLimit,
    vaultEnabled: Boolean(plan.vaultEnabled),
    vaultQuotaBytes: plan.vaultQuotaBytes,
    vaultMaxFileBytes: plan.vaultMaxFileBytes,
    vaultMaxItems: plan.vaultMaxItems,
    validityDays: plan.validityDays,
    freeFeatureDays: plan.freeFeatureDays,
    requiresPayment: plan.requiresPayment
  };
}

export function serializeAdminPlan(plan: AdminPlan) {
  const pricing = calculatePlanPricing(plan.priceInr, plan.discountType, plan.discountValue);
  const serialized = serializeManagedPlan(plan);
  const pricingFields = {
    discountAmountInr: pricing.discountAmountInr,
    finalPriceInr: pricing.finalPriceInr
  };

  return {
    ...serialized,
    ...pricingFields,
    revision: plan.revision,
    sortOrder: plan.sortOrder,
    archivedAt: plan.archivedAt,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    createdByUserId: plan.createdByUserId ?? null,
    updatedByUserId: plan.updatedByUserId ?? null,
    activeSubscriptionCount: plan.activeSubscriptionCount,
    paymentCount: plan.paymentCount,
    invoiceCount: plan.invoiceCount
  };
}

export function snapshotFromPlan(plan: PlanEntitlements) {
  return createEntitlementSnapshot(plan);
}

export async function resolvePlanEntitlementsForSubscription(subscription: any): Promise<PlanEntitlements> {
  if (isValidEntitlementSnapshot(subscription?.entitlementSnapshot)) {
    return createEntitlementSnapshot(subscription.entitlementSnapshot);
  }

  const planId = identifierFrom(subscription?.planId);
  if (!planId) return createEntitlementSnapshot(PLANS.free);

  const [payment, invoice, currentPlan] = await Promise.all([
    Payment.findOne({
      companyId: subscription.companyId,
      planId,
      status: { $in: ["CAPTURED", "REFUNDED"] }
    }).sort({ paidAt: -1, createdAt: -1 }).lean(),
    Invoice.findOne({
      companyId: subscription.companyId,
      planId
    }).sort({ issuedAt: -1, createdAt: -1 }).lean(),
    getManagedPlan(planId, { includeArchived: true })
  ]);

  const candidate = payment?.checkoutPlanSnapshot ?? invoice?.planSnapshot;
  const legacy = PLANS[planId as keyof typeof PLANS];
  const legacyInvoiceSnapshot = candidate && legacy && typeof candidate === "object"
    ? {
        ...legacy,
        name: typeof (candidate as Record<string, unknown>).name === "string"
          ? String((candidate as Record<string, unknown>).name)
          : legacy.name,
        priceInr: typeof (candidate as Record<string, unknown>).priceInr === "number"
          ? Number((candidate as Record<string, unknown>).priceInr)
          : legacy.priceInr,
        maxEmployees: typeof (candidate as Record<string, unknown>).maxEmployees === "number"
          ? Number((candidate as Record<string, unknown>).maxEmployees)
          : legacy.maxEmployees,
        monthlyMeetingLimit: typeof (candidate as Record<string, unknown>).monthlyMeetingLimit === "number"
          ? Number((candidate as Record<string, unknown>).monthlyMeetingLimit)
          : legacy.monthlyMeetingLimit,
        maxMeetingDurationMinutes: typeof (candidate as Record<string, unknown>).maxMeetingDurationMinutes === "number"
          ? Number((candidate as Record<string, unknown>).maxMeetingDurationMinutes)
          : legacy.maxMeetingDurationMinutes,
        maxConcurrentMeetings: typeof (candidate as Record<string, unknown>).maxConcurrentMeetings === "number"
          ? Number((candidate as Record<string, unknown>).maxConcurrentMeetings)
          : legacy.maxConcurrentMeetings
      }
    : null;
  const fallback = candidate && isValidEntitlementSnapshot(candidate)
    ? createEntitlementSnapshot(candidate)
    : legacyInvoiceSnapshot
      ? createEntitlementSnapshot(legacyInvoiceSnapshot)
      : legacy
        ? createEntitlementSnapshot(legacy)
        : currentPlan
          ? createEntitlementSnapshot(currentPlan)
          : createEntitlementSnapshot(PLANS.free);

  await Subscription.updateOne(
    { _id: subscription._id },
    { $set: { entitlementSnapshot: fallback } }
  );

  subscription.entitlementSnapshot = fallback;
  return fallback;
}
