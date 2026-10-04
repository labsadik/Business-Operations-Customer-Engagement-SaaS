export const PLAN_IDS = ["free", "starter", "elite", "pro", "plus"] as const;

export type PlanId = string;

export type PlanEntitlements = {
  id: string;
  name: string;
  priceInr: number;
  maxWorkspaces: number;
  maxCompanies: number;
  maxEmployees: number;
  monthlyMeetingLimit: number;
  maxMeetingDurationMinutes: number;
  maxConcurrentMeetings: number;
  validityDays: number;
  freeFeatureDays: number | null;
  requiresPayment: boolean;
};

export const PLANS: Record<PlanId, PlanEntitlements> = {
  free: {
    id: "free",
    name: "Free",
    priceInr: 0,
    maxWorkspaces: 1,
    maxCompanies: 1,
    maxEmployees: 1,
    monthlyMeetingLimit: 10,
    maxMeetingDurationMinutes: 5,
    maxConcurrentMeetings: 1,
    validityDays: 30,
    freeFeatureDays: 14,
    requiresPayment: false
  },
  starter: {
    id: "starter",
    name: "Starter",
    priceInr: 99,
    maxWorkspaces: 1,
    maxCompanies: 1,
    maxEmployees: 10,
    monthlyMeetingLimit: 100,
    maxMeetingDurationMinutes: 20,
    maxConcurrentMeetings: 10,
    validityDays: 30,
    freeFeatureDays: null,
    requiresPayment: true
  },
  elite: {
    id: "elite",
    name: "Elite",
    priceInr: 399,
    maxWorkspaces: 1,
    maxCompanies: 1,
    maxEmployees: 50,
    monthlyMeetingLimit: 850,
    maxMeetingDurationMinutes: 60,
    maxConcurrentMeetings: 25,
    validityDays: 30,
    freeFeatureDays: null,
    requiresPayment: true
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceInr: 799,
    maxWorkspaces: 1,
    maxCompanies: 1,
    maxEmployees: 100,
    monthlyMeetingLimit: 1500,
    maxMeetingDurationMinutes: 90,
    maxConcurrentMeetings: 50,
    validityDays: 30,
    freeFeatureDays: null,
    requiresPayment: true
  },
  plus: {
    id: "plus",
    name: "Plus",
    priceInr: 1499,
    maxWorkspaces: 1,
    maxCompanies: 1,
    maxEmployees: 250,
    monthlyMeetingLimit: 3000,
    maxMeetingDurationMinutes: 120,
    maxConcurrentMeetings: 100,
    validityDays: 30,
    freeFeatureDays: null,
    requiresPayment: true
  }
};

export function getPlan(planId: string | null | undefined): PlanEntitlements | null {
  if (!planId || !(planId in PLANS)) return null;
  return PLANS[planId as PlanId];
}

export const STANDARD_MEETING_DURATIONS_MINUTES = [5, 10, 15, 20, 25, 30, 35, 45, 60, 90, 120] as const;

export function getMeetingDurationOptions(
  planMaxMinutes: number,
  configured: number[] = []
) {
  if (!Number.isInteger(planMaxMinutes) || planMaxMinutes <= 0) return [];

  return [...new Set(configured)]
    .filter(
      (minutes) =>
        Number.isInteger(minutes) &&
        minutes > 0 &&
        minutes <= planMaxMinutes
    )
    .sort((a, b) => a - b);
}

export function resolveMeetingDuration(
  planMaxMinutes: number,
  configured: number[],
  requestedDurationMinutes: number
) {
  const options = getMeetingDurationOptions(planMaxMinutes, configured);

  if (options.length === 0) {
    throw new Error("MEETING_DURATION_NOT_CONFIGURED");
  }

  if (
    !Number.isInteger(requestedDurationMinutes) ||
    !options.includes(requestedDurationMinutes)
  ) {
    throw new Error("INVALID_DURATION");
  }

  return {
    durationMinutes: requestedDurationMinutes,
    allowedDurationsMinutes: options
  };
}
