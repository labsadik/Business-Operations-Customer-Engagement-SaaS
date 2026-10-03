import { getPlan, type PlanEntitlements } from "@/lib/plans";
import { Subscription } from "@/models/subscription";

export async function getCompanyEntitlements(companyId: string): Promise<PlanEntitlements> {
  const subscription = await Subscription.findOne({ companyId }).lean();
  return getPlan(subscription?.planId) ?? getPlan("starter")!;
}

export async function assertMeetingCapacity(companyId: string, durationMinutes: number) {
  const plan = await getCompanyEntitlements(companyId);

  if (durationMinutes > plan.maxMeetingDurationMinutes) {
    throw new Error("MEETING_DURATION_LIMIT");
  }

  const subscription = await Subscription.findOne({ companyId }).lean();
  if ((subscription?.monthlyMeetingsUsed ?? 0) >= plan.monthlyMeetingLimit) {
    throw new Error("MONTHLY_MEETING_LIMIT");
  }

  return plan;
}