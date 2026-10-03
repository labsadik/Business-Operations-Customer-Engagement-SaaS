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