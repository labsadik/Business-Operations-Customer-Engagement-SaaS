import { getMongo } from "@/lib/mongodb";
import { PLANS, type PlanId } from "@/lib/plans";
import { Payment } from "@/models/payment";
import { Subscription } from "@/models/subscription";

export async function activatePaidPlan(paymentId: string) {
  await getMongo();

  const payment = await Payment.findById(paymentId);
  if (!payment) throw new Error("PAYMENT_NOT_FOUND");

  const plan = PLANS[payment.planId as PlanId];
  if (!plan) throw new Error("PLAN_NOT_FOUND");

  const firstCapture = payment.status !== "CAPTURED";
  if (firstCapture) {
    payment.status = "CAPTURED";
    payment.paidAt = payment.paidAt ?? new Date();
    await payment.save();
  } else {
    return;
  }

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const subscription = await Subscription.findOne({ companyId: payment.companyId });
  if (!subscription) {
    await Subscription.create({
      companyId: payment.companyId,
      planId: plan.id,
      status: "ACTIVE",
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      monthlyMeetingsUsed: 0,
      providerCustomerId: undefined,
      providerSubscriptionId: undefined
    });
    return;
  }

  subscription.planId = plan.id;
  subscription.status = "ACTIVE";
  subscription.currentPeriodStart = now;
  subscription.currentPeriodEnd = periodEnd;
  subscription.monthlyMeetingsUsed = 0;
  await subscription.save();
}
