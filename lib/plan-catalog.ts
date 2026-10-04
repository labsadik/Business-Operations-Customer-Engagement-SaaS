import { getMongo } from "@/lib/mongodb";
import { PLANS, PLAN_IDS, type PlanEntitlements } from "@/lib/plans";
import { Plan } from "@/models/plan";
import { Subscription } from "@/models/subscription";
import { Payment } from "@/models/payment";
import { Invoice } from "@/models/invoice";

export const PLAN_STATUSES = ["PUBLIC", "COMING_SOON", "PRIVATE"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const PLAN_DISCOUNT_TYPES = ["NONE", "PERCENTAGE", "FIXED_AMOUNT"] as const;
export type PlanDiscountType = (typeof PLAN_DISCOUNT_TYPES)[number];

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

export type PublicPlan = ManagedPlan & {
  discountAmountInr: number;
  finalPriceInr: number;
};

export type AdminPlan = ManagedPlan & {
  activeSubscriptionCount: number;
  paymentCount: number;
  invoiceCount: number;
};

export type PlanPricing = {
  baseAmountMinor: number;
  discountAmountMinor: number;
  discountedAmountMinor: number;
  basePriceInr: number;
  discountAmountInr: number;
  finalPriceInr: number;
};

const LEGACY_DESCRIPTIONS: Record<string, string> = {
  free: "A small workspace for trying the core scheduling workflow.",
  starter: "For small teams that need reliable scheduling capacity.",
  elite: "For growing teams with higher meeting and employee limits.",
  pro: "For established teams running scheduling at higher volume.",
  plus: "The highest standard capacity in the current Conventus catalog."
};

const seedPromiseState: { promise: Promise<void> | null } = { promise: null };

function isSafeInteger(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function moneyInr(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value * 100) / 100
    : NaN;
}

function identifierFrom(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function assertText(value: unknown, field: string, min: number, max: number) {
  if (typeof value !== "string") throw new Error(field.toUpperCase() + "_INVALID");
  const cleaned = value.trim();
  if (cleaned.length < min || cleaned.length > max) {
    throw new Error(field.toUpperCase() + "_INVALID");
  }
  return cleaned;
}

function assertBoolean(value: unknown, field: string) {
  if (typeof value !== "boolean") throw new Error(field.toUpperCase() + "_INVALID");
  return value;
}

function assertIntegerRange(value: unknown, field: string, min: number, max: number) {
  if (!isSafeInteger(value) || value < min || value > max) {
    throw new Error(field.toUpperCase() + "_INVALID");
  }
  return value;
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
    validityDays: plan.validityDays,
    freeFeatureDays: plan.freeFeatureDays,
    requiresPayment: plan.requiresPayment
  };
}

export function isValidEntitlementSnapshot(value: unknown): value is PlanEntitlements {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    Number.isFinite(item.priceInr) &&
    isSafeInteger(item.maxWorkspaces) && item.maxWorkspaces >= 1 &&
    isSafeInteger(item.maxCompanies) && item.maxCompanies >= 1 &&
    isSafeInteger(item.maxEmployees) && item.maxEmployees >= 1 &&
    isSafeInteger(item.monthlyMeetingLimit) && item.monthlyMeetingLimit >= 1 &&
    isSafeInteger(item.maxMeetingDurationMinutes) && item.maxMeetingDurationMinutes >= 1 &&
    isSafeInteger(item.maxConcurrentMeetings) && item.maxConcurrentMeetings >= 1 &&
    isSafeInteger(item.validityDays) && item.validityDays >= 1 &&
    (item.freeFeatureDays === null || (isSafeInteger(item.freeFeatureDays) && item.freeFeatureDays >= 0)) &&
    typeof item.requiresPayment === "boolean"
  );
}

export function calculatePlanPricing(
  priceInr: number,
  discountType: PlanDiscountType,
  discountValue: number
): PlanPricing {
  const normalizedPrice = moneyInr(priceInr);
  const normalizedDiscount = moneyInr(discountValue);
  if (!Number.isFinite(normalizedPrice) || !Number.isFinite(normalizedDiscount)) {
    throw new Error("PLAN_PRICE_INVALID");
  }

  const baseAmountMinor = Math.round(normalizedPrice * 100);
  let discountAmountMinor = 0;

  if (discountType === "NONE") {
    if (normalizedDiscount !== 0) throw new Error("DISCOUNT_VALUE_INVALID");
  } else if (discountType === "PERCENTAGE") {
    if (normalizedDiscount < 0 || normalizedDiscount > 100) {
      throw new Error("DISCOUNT_PERCENTAGE_INVALID");
    }
    discountAmountMinor = Math.round(baseAmountMinor * normalizedDiscount / 100);
  } else if (discountType === "FIXED_AMOUNT") {
    if (normalizedDiscount < 0 || normalizedDiscount * 100 > baseAmountMinor) {
      throw new Error("DISCOUNT_FIXED_INVALID");
    }
    discountAmountMinor = Math.round(normalizedDiscount * 100);
  } else {
    throw new Error("DISCOUNT_TYPE_INVALID");
  }

  if (baseAmountMinor === 0 && discountAmountMinor !== 0) {
    throw new Error("DISCOUNT_ON_FREE_PLAN_INVALID");
  }

  const discountedAmountMinor = Math.max(0, baseAmountMinor - discountAmountMinor);
  return {
    baseAmountMinor,
    discountAmountMinor,
    discountedAmountMinor,
    basePriceInr: baseAmountMinor / 100,
    discountAmountInr: discountAmountMinor / 100,
    finalPriceInr: discountedAmountMinor / 100
  };
}

export function validatePlanDraft(input: {
  identifier: unknown;
  name: unknown;
  description?: unknown;
  status: unknown;
  popular?: unknown;
  recommended?: unknown;
  priceInr: unknown;
  discountType: unknown;
  discountValue: unknown;
  maxWorkspaces: unknown;
  maxCompanies: unknown;
  maxEmployees: unknown;
  monthlyMeetingLimit: unknown;
  maxMeetingDurationMinutes: unknown;
  maxConcurrentMeetings: unknown;
  validityDays: unknown;
  freeFeatureDays?: unknown;
}) {
  const identifier = identifierFrom(input.identifier);
  if (!/^[a-z][a-z0-9_-]{1,63}$/.test(identifier)) {
    throw new Error("PLAN_IDENTIFIER_INVALID");
  }

  const name = assertText(input.name, "plan_name", 1, 120);
  const description = input.description == null
    ? ""
    : assertText(input.description, "plan_description", 0, 1200);
  const status = input.status as PlanStatus;
  if (!PLAN_STATUSES.includes(status)) throw new Error("PLAN_STATUS_INVALID");
  const popular = input.popular == null ? false : assertBoolean(input.popular, "plan_popular");
  const recommended = input.recommended == null ? false : assertBoolean(input.recommended, "plan_recommended");

  const priceInr = moneyInr(input.priceInr);
  if (!Number.isFinite(priceInr) || priceInr < 0 || priceInr > 10000000) {
    throw new Error("PLAN_PRICE_INVALID");
  }

  const discountType = input.discountType as PlanDiscountType;
  if (!PLAN_DISCOUNT_TYPES.includes(discountType)) {
    throw new Error("DISCOUNT_TYPE_INVALID");
  }

  const discountValue = moneyInr(input.discountValue ?? 0);
  if (!Number.isFinite(discountValue) || discountValue < 0) {
    throw new Error("DISCOUNT_VALUE_INVALID");
  }

  if (priceInr === 0 && discountType !== "NONE") {
    throw new Error("DISCOUNT_ON_FREE_PLAN_INVALID");
  }

  const pricing = calculatePlanPricing(priceInr, discountType, discountValue);

  const maxWorkspaces = assertIntegerRange(input.maxWorkspaces, "max_workspaces", 1, 1000000);
  const maxCompanies = assertIntegerRange(input.maxCompanies, "max_companies", 1, 1000000);
  const maxEmployees = assertIntegerRange(input.maxEmployees, "max_employees", 1, 1000000);
  const monthlyMeetingLimit = assertIntegerRange(input.monthlyMeetingLimit, "monthly_meeting_limit", 1, 10000000);
  const maxMeetingDurationMinutes = assertIntegerRange(input.maxMeetingDurationMinutes, "max_meeting_duration_minutes", 1, 1440);
  const maxConcurrentMeetings = assertIntegerRange(input.maxConcurrentMeetings, "max_concurrent_meetings", 1, 1000000);
  const validityDays = assertIntegerRange(input.validityDays, "validity_days", 1, 3650);

  let freeFeatureDays: number | null = null;
  if (input.freeFeatureDays !== null && input.freeFeatureDays !== "" && input.freeFeatureDays !== undefined) {
    freeFeatureDays = assertIntegerRange(input.freeFeatureDays, "free_feature_days", 0, 3650);
  }

  return {
    identifier,
    name,
    description,
    status,
    popular,
    recommended,
    priceInr,
    discountType,
    discountValue,
    maxWorkspaces,
    maxCompanies,
    maxEmployees,
    monthlyMeetingLimit,
    maxMeetingDurationMinutes,
    maxConcurrentMeetings,
    validityDays,
    freeFeatureDays,
    requiresPayment: priceInr > 0,
    pricing
  };
}

export function serializeManagedPlan(doc: any): ManagedPlan {
  return {
    id: String(doc.identifier),
    name: doc.name,
    description: doc.description ?? "",
    priceInr: Number(doc.priceInr),
    maxWorkspaces: Number(doc.maxWorkspaces),
    maxCompanies: Number(doc.maxCompanies),
    maxEmployees: Number(doc.maxEmployees),
    monthlyMeetingLimit: Number(doc.monthlyMeetingLimit),
    maxMeetingDurationMinutes: Number(doc.maxMeetingDurationMinutes),
    maxConcurrentMeetings: Number(doc.maxConcurrentMeetings),
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

async function seedLegacyPlans() {
  const operations = PLAN_IDS.map((id, index) => {
    const plan = PLANS[id];
    return Plan.updateOne(
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
  });
  await Promise.all(operations);
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

export function isPlanPubliclyPurchasable(plan: { status: PlanStatus; archivedAt: Date | null }) {
  return plan.status === "PUBLIC" && plan.archivedAt === null;
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
      .map(serializeRecord)
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

  return docs.map((doc) => {
    const plan = serializeManagedPlan(doc);
    return {
      ...plan,
      activeSubscriptionCount: activeMap.get(plan.id) ?? 0,
      paymentCount: paymentMap.get(plan.id) ?? 0,
      invoiceCount: invoiceMap.get(plan.id) ?? 0
    };
  });
}

export function serializePublicPlan(plan: PublicPlan) {
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
    validityDays: plan.validityDays,
    freeFeatureDays: plan.freeFeatureDays,
    requiresPayment: plan.requiresPayment
  };
}

export function serializeAdminPlan(plan: AdminPlan) {
  const pricing = calculatePlanPricing(plan.priceInr, plan.discountType, plan.discountValue);
  return {
    ...serializePublicPlan(plan as PublicPlan),
    revision: plan.revision,
    sortOrder: plan.sortOrder,
    archivedAt: plan.archivedAt,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    createdByUserId: plan.createdByUserId ?? null,
    updatedByUserId: plan.updatedByUserId ?? null,
    activeSubscriptionCount: plan.activeSubscriptionCount,
    paymentCount: plan.paymentCount,
    invoiceCount: plan.invoiceCount,
    finalPriceInr: pricing.finalPriceInr
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
      : currentPlan
        ? createEntitlementSnapshot(currentPlan)
        : legacy
          ? createEntitlementSnapshot(legacy)
          : createEntitlementSnapshot(PLANS.free);

  await Subscription.updateOne(
    { _id: subscription._id },
    { $set: { entitlementSnapshot: fallback } }
  );

  subscription.entitlementSnapshot = fallback;
  return fallback;
}
