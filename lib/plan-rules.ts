export const PLAN_STATUSES = ["PUBLIC", "COMING_SOON", "PRIVATE"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const PLAN_DISCOUNT_TYPES = ["NONE", "PERCENTAGE", "FIXED_AMOUNT"] as const;
export type PlanDiscountType = (typeof PLAN_DISCOUNT_TYPES)[number];

export type PlanPricing = {
  baseAmountMinor: number;
  discountAmountMinor: number;
  discountedAmountMinor: number;
  basePriceInr: number;
  discountAmountInr: number;
  finalPriceInr: number;
};

export type PlanDraftInput = {
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
};

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

  if (baseAmountMinor === 0 && discountType !== "NONE" && normalizedDiscount !== 0) {
    throw new Error("DISCOUNT_ON_FREE_PLAN_INVALID");
  }

  if (discountType === "NONE") {
    if (normalizedDiscount !== 0) throw new Error("DISCOUNT_VALUE_INVALID");
  } else if (discountType === "PERCENTAGE") {
    if (normalizedDiscount < 0 || normalizedDiscount > 100) {
      throw new Error("DISCOUNT_PERCENTAGE_INVALID");
    }
    discountAmountMinor = Math.round((baseAmountMinor * normalizedDiscount) / 100);
  } else if (discountType === "FIXED_AMOUNT") {
    if (normalizedDiscount < 0 || normalizedDiscount * 100 > baseAmountMinor) {
      throw new Error("DISCOUNT_FIXED_INVALID");
    }
    discountAmountMinor = Math.round(normalizedDiscount * 100);
  } else {
    throw new Error("DISCOUNT_TYPE_INVALID");
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

export function validatePlanDraft(input: PlanDraftInput) {
  const identifier = identifierFrom(input.identifier);

  if (!/^[a-z][a-z0-9_-]{1,63}$/.test(identifier)) {
    throw new Error("PLAN_IDENTIFIER_INVALID");
  }

  const name = assertText(input.name, "plan_name", 1, 120);
  const description =
    input.description == null
      ? ""
      : assertText(input.description, "plan_description", 0, 1200);

  const status = input.status as PlanStatus;
  if (!PLAN_STATUSES.includes(status)) throw new Error("PLAN_STATUS_INVALID");

  const popular =
    input.popular == null ? false : assertBoolean(input.popular, "plan_popular");
  const recommended =
    input.recommended == null
      ? false
      : assertBoolean(input.recommended, "plan_recommended");

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

  const maxWorkspaces = assertIntegerRange(
    input.maxWorkspaces,
    "max_workspaces",
    1,
    1000000
  );
  const maxCompanies = assertIntegerRange(
    input.maxCompanies,
    "max_companies",
    1,
    1000000
  );
  const maxEmployees = assertIntegerRange(
    input.maxEmployees,
    "max_employees",
    1,
    1000000
  );
  const monthlyMeetingLimit = assertIntegerRange(
    input.monthlyMeetingLimit,
    "monthly_meeting_limit",
    1,
    10000000
  );
  const maxMeetingDurationMinutes = assertIntegerRange(
    input.maxMeetingDurationMinutes,
    "max_meeting_duration_minutes",
    1,
    1440
  );
  const maxConcurrentMeetings = assertIntegerRange(
    input.maxConcurrentMeetings,
    "max_concurrent_meetings",
    1,
    1000000
  );
  const validityDays = assertIntegerRange(
    input.validityDays,
    "validity_days",
    1,
    3650
  );

  let freeFeatureDays: number | null = null;
  if (
    input.freeFeatureDays !== null &&
    input.freeFeatureDays !== "" &&
    input.freeFeatureDays !== undefined
  ) {
    freeFeatureDays = assertIntegerRange(
      input.freeFeatureDays,
      "free_feature_days",
      0,
      3650
    );
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

export function isPlanPubliclyPurchasable(plan: {
  status: PlanStatus;
  archivedAt: Date | null;
}) {
  return plan.status === "PUBLIC" && plan.archivedAt === null;
}
