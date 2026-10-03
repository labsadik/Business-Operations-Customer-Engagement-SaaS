import { getPlan, type PlanEntitlements } from "@/lib/plans";
import { Subscription } from "@/models/subscription";

export async function getCompanyEntitlements(companyId: string): Promise<PlanEntitlements> {
  let subscription = await Subscription.findOne({ companyId });

  if (subscription && subscription.currentPeriodEnd.getTime() <= Date.now()) {
    const periodStart = new Date();
    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    subscription.currentPeriodStart = periodStart;
    subscription.currentPeriodEnd = periodEnd;
    subscription.monthlyMeetingsUsed = 0;
    subscription.status = "ACTIVE";
    await subscription.save();
  }

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