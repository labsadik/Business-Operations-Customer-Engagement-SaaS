import { getPlan, type PlanEntitlements } from "@/lib/plans";
import { Subscription } from "@/models/subscription";
import { Payment } from "@/models/payment";
import { Workspace } from "@/models/workspace";
import { getMongo } from "@/lib/mongodb";

const FREE_USAGE_LIMIT_DAYS = 14;

function addValidityDays(from: Date, days: number) {
  const result = new Date(from);
  result.setDate(result.getDate() + days);
  return result;
}

function periodFor(plan: PlanEntitlements, start: Date) {
  return addValidityDays(start, plan.validityDays);
}

function utcDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export async function reconcileLatestPaidAccess(companyId: string) {
  const [subscription, latestPayment] = await Promise.all([
    Subscription.findOne({ companyId }).lean(),
    Payment.findOne({
      companyId,
      merchantAccount: "CONVENTUS",
      status: { $in: ["CAPTURED", "PENDING", "FAILED"] },
      providerPaymentId: { $exists: true, $ne: "" },
      $or: [
        { paidAt: { $exists: true, $ne: null } },
        { activatedAt: { $exists: true, $ne: null } }
      ]
    })
      .sort({ paidAt: -1, activatedAt: -1, createdAt: -1 })
      .lean()
  ]);

  if (!latestPayment) return subscription;

  const plan = getPlan(latestPayment.planId);
  if (!plan?.requiresPayment) return subscription;

  const activationStart = new Date(
    latestPayment.paidAt ??
    latestPayment.activatedAt ??
    latestPayment.createdAt ??
    new Date()
  );
  const periodEnd = addValidityDays(activationStart, plan.validityDays);
  const now = Date.now();

  if (periodEnd.getTime() <= now) return subscription;

  const currentStart = subscription?.currentPeriodStart?.getTime() ?? 0;
  const currentEnd = subscription?.currentPeriodEnd?.getTime() ?? 0;
  const currentAccessIsActive = Boolean(
    subscription &&
    subscription.status === "ACTIVE" &&
    currentEnd > now
  );
  const currentAccessIsPaidOrGranted = Boolean(
    currentAccessIsActive &&
    subscription &&
    ["PAID", "ADMIN_GRANTED"].includes(subscription.source)
  );
  const paymentIsNewer = activationStart.getTime() > currentStart;
  const planNeedsRepair = !subscription ||
    !currentAccessIsPaidOrGranted ||
    paymentIsNewer;

  if (planNeedsRepair) {
    await Subscription.findOneAndUpdate(
      { companyId },
      {
        $set: {
          planId: plan.id,
          source: "PAID",
          status: "ACTIVE",
          currentPeriodStart: activationStart,
          currentPeriodEnd: periodEnd,
          monthlyMeetingsUsed: 0,
          freeUsageDates: [],
          grantedByUserId: undefined,
          grantedAt: undefined
        },
        $setOnInsert: { companyId }
      },
      { upsert: true, new: true }
    );

    await Workspace.updateOne(
      { companyId },
      { $set: { planId: plan.id } }
    );
  }

  if (latestPayment.status !== "CAPTURED") {
    await Payment.updateOne(
      {
        _id: latestPayment._id,
        status: "PENDING"
      },
      {
        $set: {
          status: "CAPTURED",
          activatedAt: latestPayment.activatedAt ?? new Date()
        }
      }
    );
  }

  return Subscription.findOne({ companyId });
}

async function ensureSubscription(companyId: string) {
  let subscription = await Subscription.findOne({ companyId });
  if (!subscription) {
    const plan = getPlan("free")!;
    const start = new Date();
    subscription = await Subscription.create({
      companyId,
      planId: plan.id,
      status: "ACTIVE",
      source: "FREE",
      currentPeriodStart: start,
      currentPeriodEnd: periodFor(plan, start),
      monthlyMeetingsUsed: 0,
      freeUsageDates: []
    });
  }

  const now = new Date();
  if (subscription.currentPeriodEnd.getTime() <= now.getTime()) {
    const plan = getPlan(subscription.planId);
    const nextPlan = plan?.requiresPayment ? getPlan("free")! : plan!;
    const start = now;
    subscription.planId = nextPlan.id;
    subscription.source = nextPlan.id === "free" ? "FREE" : subscription.source;
    subscription.status = "ACTIVE";
    subscription.currentPeriodStart = start;
    subscription.currentPeriodEnd = periodFor(nextPlan, start);
    subscription.monthlyMeetingsUsed = 0;
    subscription.freeUsageDates = nextPlan.id === "free" ? [] : subscription.freeUsageDates;
    subscription.grantedByUserId = nextPlan.id === "free" ? undefined : subscription.grantedByUserId;
    subscription.grantedAt = nextPlan.id === "free" ? undefined : subscription.grantedAt;
    await subscription.save();
  }

  return subscription;
}

export async function getCompanySubscription(companyId: string) {
  await getMongo();
  await reconcileLatestPaidAccess(companyId);
  return ensureSubscription(companyId);
}

export async function getCompanyEntitlements(companyId: string): Promise<PlanEntitlements> {
  await getMongo();
  await reconcileLatestPaidAccess(companyId);
  const subscription = await ensureSubscription(companyId);
  return getPlan(subscription.planId) ?? getPlan("free")!;
}

export async function assertFeatureAccess(companyId: string) {
  await getMongo();
  await reconcileLatestPaidAccess(companyId);
  const subscription = await ensureSubscription(companyId);
  const plan = getPlan(subscription.planId) ?? getPlan("free")!;

  if (plan.id === "free") {
    const featureWindowEnd = new Date(subscription.currentPeriodStart);
    featureWindowEnd.setDate(featureWindowEnd.getDate() + FREE_USAGE_LIMIT_DAYS);
    if (Date.now() >= featureWindowEnd.getTime()) {
      throw new Error("FREE_FEATURE_DAYS_EXHAUSTED");
    }

    const today = utcDayKey();
    await Subscription.updateOne(
      { _id: subscription._id, freeUsageDates: { $ne: today } },
      { $addToSet: { freeUsageDates: today } }
    );
  }

  return plan;
}

export async function assertMeetingCapacity(companyId: string, durationMinutes: number) {
  const plan = await assertFeatureAccess(companyId);
  if (durationMinutes > plan.maxMeetingDurationMinutes) {
    throw new Error("MEETING_DURATION_LIMIT");
  }

  const subscription = await getCompanySubscription(companyId);
  if (subscription.monthlyMeetingsUsed >= plan.monthlyMeetingLimit) {
    throw new Error("MONTHLY_MEETING_LIMIT");
  }

  return plan;
}

export async function incrementMeetingUsage(companyId: string) {
  const plan = await assertFeatureAccess(companyId);
  const updated = await Subscription.findOneAndUpdate(
    {
      companyId,
      status: "ACTIVE",
      monthlyMeetingsUsed: { $lt: plan.monthlyMeetingLimit }
    },
    { $inc: { monthlyMeetingsUsed: 1 } },
    { new: true }
  );
  if (!updated) throw new Error("MONTHLY_MEETING_LIMIT");
  return updated;
}
