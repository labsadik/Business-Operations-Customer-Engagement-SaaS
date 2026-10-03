export const PLAN_IDS = ["starter", "business"] as const;

export type PlanId = (typeof PLAN_IDS)[number];

export type PlanEntitlements = {
  id: PlanId;
  name: string;
  priceInr: number;
  maxWorkspaces: number;
  maxCompanies: number;
  maxEmployees: number;
  monthlyMeetingLimit: number;
  maxMeetingDurationMinutes: number;
  maxConcurrentMeetings: number;
};

export const PLANS: Record<PlanId, PlanEntitlements> = {
  starter: {
    id: "starter",
    name: "Starter",
    priceInr: 99,
    maxWorkspaces: 1,
    maxCompanies: 1,
    maxEmployees: 10,
    monthlyMeetingLimit: 100,
    maxMeetingDurationMinutes: 20,
    maxConcurrentMeetings: 10
  },
  business: {
    id: "business",
    name: "Business",
    priceInr: 199,
    maxWorkspaces: 1,
    maxCompanies: 1,
    maxEmployees: 30,
    monthlyMeetingLimit: 350,
    maxMeetingDurationMinutes: 35,
    maxConcurrentMeetings: 30
  }
};

export function getPlan(planId: string | null | undefined): PlanEntitlements | null {
  if (!planId || !(planId in PLANS)) return null;
  return PLANS[planId as PlanId];
}
export const STANDARD_MEETING_DURATIONS_MINUTES = [10, 15, 20, 25, 30, 35] as const;

export function getMeetingDurationOptions(
  planMaxMinutes: number,
  configured: number[] = []
) {
  const configuredOptions = configured
    .filter((minutes) => Number.isInteger(minutes) && minutes >= 10 && minutes <= planMaxMinutes)
    .sort((a, b) => a - b);

  // Older workspaces were created with only [20]. Treat that as the legacy
  // default and expose the plan-supported standard durations.
  const legacyDefault = configuredOptions.length === 1 && configuredOptions[0] === 20;
  const source = legacyDefault
    ? STANDARD_MEETING_DURATIONS_MINUTES
    : configuredOptions;

  return source.filter((minutes) => minutes <= planMaxMinutes);
}
