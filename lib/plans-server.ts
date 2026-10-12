import { type PlanEntitlements } from "@/lib/plans";
import {
  createEntitlementSnapshot,
  getManagedPlan,
  isValidEntitlementSnapshot,
  resolvePlanEntitlementsForSubscription
} from "@/lib/plan-catalog";
import { Subscription } from "@/models/subscription";
import { Payment } from "@/models/payment";
import { Workspace } from "@/models/workspace";
import { getMongo } from "@/lib/mongodb";
import { Company } from "@/models/company";

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

function paymentEntitlementSnapshot(payment: any): PlanEntitlements | null {
  if (isValidEntitlementSnapshot(payment?.checkoutPlanSnapshot)) {
    return createEntitlementSnapshot(payment.checkoutPlanSnapshot);
  }
  return null;
}

/**
 * Reconciles access only from a payment that is already CAPTURED.
 * PENDING/FAILED records are never allowed to grant paid entitlements.
 * Stored checkout snapshots are preferred so catalog edits do not silently
 * change historical paid access.
 */
export async function reconcileLatestPaidAccess(companyId: string) {
  const [subscription, latestPayment] = await Promise.all([
    Subscription.findOne({ companyId }).lean(),
    Payment.findOne({
      companyId,
      merchantAccount: "CONVENTUS",
      status: "CAPTURED",
      providerPaymentId: { $exists: true, $ne: "" },
      paidAt: { $exists: true, $ne: null }
    })
      .sort({ paidAt: -1, activatedAt: -1, createdAt: -1 })
      .lean()
  ]);

  if (!latestPayment) return subscription;

  const plan =
    paymentEntitlementSnapshot(latestPayment) ??
    await getManagedPlan(latestPayment.planId, { includeArchived: true });

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
  const planNeedsRepair =
    !subscription ||
    !currentAccessIsPaidOrGranted ||
    paymentIsNewer;

  if (planNeedsRepair) {
    const entitlementSnapshot = createEntitlementSnapshot(plan);
    await Subscription.findOneAndUpdate(
      { companyId },
      {
        $set: {
          planId: plan.id,
          entitlementSnapshot,
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
      { upsert: true, returnDocument: "after" }
    );

    await Promise.all([
      Workspace.updateOne(
        { companyId },
        { $set: { planId: plan.id } }
      ),
      Company.updateOne(
        { _id: companyId },
        { $set: { planAccessExpiresAt: periodEnd } }
      )
    ]);
  }

  return Subscription.findOne({ companyId });
}

async function ensureSubscription(companyId: string) {
  let subscription = await Subscription.findOne({ companyId });

  if (!subscription) {
    const plan = await getManagedPlan("free", { includeArchived: true });
    if (!plan) throw new Error("FREE_PLAN_NOT_CONFIGURED");
    const start = new Date();

    subscription = await Subscription.create({
      companyId,
      planId: plan.id,
      entitlementSnapshot: createEntitlementSnapshot(plan),
      status: "ACTIVE",
      source: "FREE",
      currentPeriodStart: start,
      currentPeriodEnd: periodFor(plan, start),
      monthlyMeetingsUsed: 0,
      freeUsageDates: []
    });

    await Workspace.updateOne(
      { companyId },
      { $set: { planId: plan.id } }
    );

    return subscription;
  }

  if (!isValidEntitlementSnapshot(subscription.entitlementSnapshot)) {
    await resolvePlanEntitlementsForSubscription(subscription);
  }

  const now = new Date();
  if (subscription.currentPeriodEnd.getTime() <= now.getTime()) {
    const currentPlan = await resolvePlanEntitlementsForSubscription(subscription);
    const accessState = await Company.findById(companyId)
      .select("planExpired planExpiryTestActive planAccessExpiresAt")
      .lean();

    // Paid and admin-granted access never silently rolls into a fresh free period.
    // Keeping the expired subscription also keeps its history visible to admins.
    if (["PAID", "ADMIN_GRANTED"].includes(subscription.source) || accessState?.planExpiryTestActive) {
      if (!accessState?.planExpired) {
        await Company.updateOne(
          { _id: companyId, planExpired: { $ne: true } },
          {
            $set: {
              planExpired: true,
              planExpiredAt: accessState?.planExpiryTestActive
                ? now
                : accessState?.planAccessExpiresAt ?? subscription.currentPeriodEnd
            }
          }
        );
      }
      return subscription;
    }

    const nextPlan = currentPlan.requiresPayment
      ? await getManagedPlan("free", { includeArchived: true })
      : currentPlan;

    if (!nextPlan) throw new Error("FREE_PLAN_NOT_CONFIGURED");

    const start = now;

    subscription.planId = nextPlan.id;
    subscription.entitlementSnapshot = createEntitlementSnapshot(nextPlan);
    subscription.source = nextPlan.id === "free" ? "FREE" : subscription.source;
    subscription.status = "ACTIVE";
    subscription.currentPeriodStart = start;
    subscription.currentPeriodEnd = periodFor(nextPlan, start);
    subscription.monthlyMeetingsUsed = 0;

    if (nextPlan.id === "free") {
      subscription.freeUsageDates = [];
      subscription.grantedByUserId = undefined;
      subscription.grantedAt = undefined;
    }

    await subscription.save();

    await Workspace.updateOne(
      { companyId },
      { $set: { planId: nextPlan.id } }
    );
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

  const snapshot = isValidEntitlementSnapshot(subscription.entitlementSnapshot)
    ? createEntitlementSnapshot(subscription.entitlementSnapshot)
    : await resolvePlanEntitlementsForSubscription(subscription);

  // Task Management access and its daily cap are centrally managed plan
  // entitlements. Apply administrator changes immediately without rewriting
  // historical pricing or billing snapshots.
  const currentPlan = await getManagedPlan(snapshot.id, { includeArchived: true });
  return currentPlan
    ? {
        ...snapshot,
        taskManagementEnabled: Boolean(currentPlan.taskManagementEnabled),
        taskManagementDailyLimit:
          currentPlan.taskManagementDailyLimit === undefined
            ? snapshot.taskManagementDailyLimit ?? 10
            : currentPlan.taskManagementDailyLimit,
        vaultEnabled: Boolean(currentPlan.vaultEnabled),
        vaultQuotaBytes: currentPlan.vaultQuotaBytes ?? snapshot.vaultQuotaBytes ?? 5368709120,
        vaultMaxFileBytes: currentPlan.vaultMaxFileBytes ?? snapshot.vaultMaxFileBytes ?? 104857600,
        vaultMaxItems: currentPlan.vaultMaxItems ?? snapshot.vaultMaxItems ?? 1000,
        liveChatEnabled: Boolean(currentPlan.liveChatEnabled),
        liveChatMonthlyLimit: currentPlan.liveChatMonthlyLimit ?? snapshot.liveChatMonthlyLimit ?? 1000,
        liveChatCustomerLimit: currentPlan.liveChatCustomerLimit ?? snapshot.liveChatCustomerLimit ?? 500,
        liveChatAgentLimit: currentPlan.liveChatAgentLimit ?? snapshot.liveChatAgentLimit ?? 5,
        liveChatRetentionDays: currentPlan.liveChatRetentionDays ?? snapshot.liveChatRetentionDays ?? 30,
        liveChatMessageCooldownSeconds: currentPlan.liveChatMessageCooldownSeconds ?? snapshot.liveChatMessageCooldownSeconds ?? 15,
        liveChatPdfExportEnabled: currentPlan.liveChatPdfExportEnabled !== false,
        liveChatDeleteEnabled: currentPlan.liveChatDeleteEnabled !== false
      }
    : {
        ...snapshot,
        taskManagementDailyLimit: snapshot.taskManagementDailyLimit ?? 10
      };
}


export type CompanyPlanAccessState = {
  locked: boolean;
  reason: "ACTIVE" | "SUSPENDED" | "EXPIRED" | "INACTIVE";
  planSuspended: boolean;
  planExpired: boolean;
  planExpiryTestActive: boolean;
  planAccessExpiresAt: Date | null;
  planSuspendedAt: Date | null;
  planExpiredAt: Date | null;
};

export async function isCompanyPlanSuspended(companyId: string) {
  await getMongo();
  const company = await Company.findById(companyId)
    .select("planSuspended planExpired planExpiryTestActive planAccessExpiresAt planExpiredAt")
    .lean();

  if (!company) return false;

  // Explicit platform suspensions and expiry tests always take precedence.
  if (company.planSuspended || company.planExpiryTestActive) return true;

  const storedAccessExpiry = company.planAccessExpiresAt as Date | null | undefined;
  const now = Date.now();
  const storedAccessExpired = Boolean(storedAccessExpiry && storedAccessExpiry.getTime() <= now);
  const subscription = await Subscription.findOne({ companyId })
    .select("status source currentPeriodEnd")
    .lean();

  // Reconcile against the subscription's actual service period even when the
  // company-level expiry timestamp or flag is stale in either direction.
  if (subscription && ["PAID", "ADMIN_GRANTED"].includes(subscription.source)) {
    const periodEnd = subscription.currentPeriodEnd;
    const periodEndMs = periodEnd?.getTime?.() ?? 0;

    if (periodEndMs > now && subscription.status === "ACTIVE") {
      const needsRepair = company.planExpired ||
        !storedAccessExpiry ||
        storedAccessExpiry.getTime() !== periodEndMs;

      if (needsRepair) {
        const repaired = await Company.updateOne(
          {
            _id: companyId,
            planSuspended: { $ne: true },
            planExpiryTestActive: { $ne: true }
          },
          {
            $set: {
              planExpired: false,
              planAccessExpiresAt: periodEnd
            },
            $unset: {
              planExpiredAt: "",
              planExpiredByUserId: ""
            }
          }
        );

        // Fail closed if an administrator changed the lock during reconciliation.
        if (repaired.matchedCount === 0) return true;
      }
      return false;
    }

    if (periodEndMs > now && subscription.status !== "ACTIVE") {
      // A future date alone cannot unlock a past-due or cancelled subscription.
      // Keep this distinct from natural expiry so the UI can offer clear renewal guidance.
      return true;
    }

    await Company.updateOne(
      {
        _id: companyId,
        planSuspended: { $ne: true },
        planExpiryTestActive: { $ne: true }
      },
      {
        $set: {
          planExpired: true,
          planAccessExpiresAt: periodEnd,
          planExpiredAt: company.planExpiredAt ?? periodEnd
        },
        $unset: { planExpiredByUserId: "" }
      }
    );
    return true;
  }

  if (company.planExpired || storedAccessExpired) {
    if (storedAccessExpired && !company.planExpired) {
      await Company.updateOne(
        {
          _id: companyId,
          planExpired: { $ne: true },
          planSuspended: { $ne: true },
          planExpiryTestActive: { $ne: true }
        },
        { $set: { planExpired: true, planExpiredAt: storedAccessExpiry } }
      );
    }
    return true;
  }

  // A defined date (including null for a legacy free plan) has already been resolved.
  if (storedAccessExpiry !== undefined) return false;

  // Recover legacy tenants that were previously downgraded to free after paid expiry.
  const latestPayment = await Payment.findOne({
    companyId,
    merchantAccount: "CONVENTUS",
    status: "CAPTURED",
    providerPaymentId: { $exists: true, $ne: "" },
    paidAt: { $exists: true, $ne: null }
  }).sort({ paidAt: -1, activatedAt: -1, createdAt: -1 }).lean();

  if (latestPayment) {
    const plan =
      paymentEntitlementSnapshot(latestPayment) ??
      await getManagedPlan(latestPayment.planId, { includeArchived: true });
    if (plan?.requiresPayment) {
      const periodStart = new Date(
        latestPayment.paidAt ??
        latestPayment.activatedAt ??
        latestPayment.createdAt ??
        new Date()
      );
      const expiresAt = addValidityDays(periodStart, plan.validityDays);
      const expired = expiresAt.getTime() <= now;
      await Company.updateOne(
        { _id: companyId, planAccessExpiresAt: { $exists: false } },
        {
          $set: {
            planAccessExpiresAt: expiresAt,
            ...(expired ? { planExpired: true, planExpiredAt: expiresAt } : {})
          }
        }
      );
      return expired;
    }
  }

  await Company.updateOne(
    { _id: companyId, planAccessExpiresAt: { $exists: false } },
    { $set: { planAccessExpiresAt: null } }
  );
  return false;
}

export async function getCompanyPlanAccessState(companyId: string): Promise<CompanyPlanAccessState | null> {
  const locked = await isCompanyPlanSuspended(companyId);
  const [company, subscription] = await Promise.all([
    Company.findById(companyId)
      .select("planSuspended planExpired planExpiryTestActive planAccessExpiresAt planSuspendedAt planExpiredAt")
      .lean(),
    Subscription.findOne({ companyId }).select("status source currentPeriodEnd").lean()
  ]);

  if (!company) return null;

  const now = Date.now();
  const planSuspended = Boolean(company.planSuspended);
  const planAccessExpiresAt = company.planAccessExpiresAt ?? null;
  const paidSubscription = Boolean(
    subscription && ["PAID", "ADMIN_GRANTED"].includes(subscription.source)
  );
  const naturallyExpired = Boolean(
    company.planExpired ||
    company.planExpiryTestActive ||
    (planAccessExpiresAt && planAccessExpiresAt.getTime() <= now) ||
    (paidSubscription && subscription && subscription.currentPeriodEnd.getTime() <= now)
  );
  const inactiveSubscription = Boolean(
    paidSubscription &&
    subscription &&
    subscription.status !== "ACTIVE" &&
    subscription.currentPeriodEnd.getTime() > now
  );
  const reason: CompanyPlanAccessState["reason"] = planSuspended
    ? "SUSPENDED"
    : !locked
      ? "ACTIVE"
      : naturallyExpired
        ? "EXPIRED"
        : inactiveSubscription
          ? "INACTIVE"
          : "EXPIRED";

  return {
    locked,
    reason,
    planSuspended,
    planExpired: reason === "EXPIRED",
    planExpiryTestActive: Boolean(company.planExpiryTestActive),
    planAccessExpiresAt,
    planSuspendedAt: company.planSuspendedAt ?? null,
    planExpiredAt: reason === "EXPIRED"
      ? company.planExpiredAt ?? planAccessExpiresAt
      : null
  };
}

export async function assertCompanyPlanNotSuspended(companyId: string) {
  if (await isCompanyPlanSuspended(companyId)) throw new Error("PLAN_SUSPENDED");
}

export async function assertFeatureAccess(companyId: string) {
  await assertCompanyPlanNotSuspended(companyId);
  const plan = await getCompanyEntitlements(companyId);
  const subscription = await getCompanySubscription(companyId);

  if (plan.id === "free") {
    const featureWindowEnd = new Date(subscription.currentPeriodStart);
    featureWindowEnd.setDate(
      featureWindowEnd.getDate() + (plan.freeFeatureDays ?? FREE_USAGE_LIMIT_DAYS)
    );

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

export async function assertMeetingCapacity(
  companyId: string,
  durationMinutes: number
) {
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
    { returnDocument: "after" }
  );

  if (!updated) throw new Error("MONTHLY_MEETING_LIMIT");
  return updated;
}
