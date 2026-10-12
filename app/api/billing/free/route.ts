import { getSession } from "@/lib/session";
import { getMongo } from "@/lib/mongodb";
import { Subscription } from "@/models/subscription";
import { Workspace } from "@/models/workspace";
import { Company } from "@/models/company";
import { ensureCurrentAccessInvoice } from "@/lib/billing";
import { getCompanyPlanAccessState, getCompanySubscription } from "@/lib/plans-server";
import { createEntitlementSnapshot, getManagedPlan } from "@/lib/plan-catalog";
import { jsonError, jsonOk } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);

    const session = await getSession();
    if (!session || !session.companyId) return jsonError("UNAUTHENTICATED", 401);
    if (!["COMPANY_ADMIN", "PLATFORM_ADMIN"].includes(session.role)) {
      return jsonError("FORBIDDEN", 403);
    }

    await getMongo();

    const accessState = await getCompanyPlanAccessState(session.companyId);
    if (accessState?.locked) {
      return jsonError(
        accessState.reason === "SUSPENDED" ? "PLAN_SUSPENDED" : "PLAN_REQUIRES_RENEWAL",
        accessState.reason === "SUSPENDED" ? 423 : 409
      );
    }

    const company = await Company.findById(session.companyId).lean();
    if (!company) return jsonError("COMPANY_NOT_FOUND", 404);

    const body = await request.json().catch(() => null) as { planId?: string } | null;
    const requestedPlanId = body?.planId?.trim().toLowerCase() || "free";
    const freePlan = await getManagedPlan(requestedPlanId, { includeArchived: true });

    if (!freePlan || freePlan.archivedAt) return jsonError("PLAN_NOT_FOUND", 404);
    if (freePlan.status !== "PUBLIC") {
      return jsonError(
        freePlan.status === "COMING_SOON" ? "PLAN_COMING_SOON" : "PLAN_PRIVATE",
        409
      );
    }
    if (freePlan.requiresPayment || freePlan.priceInr > 0) {
      return jsonError("PLAN_REQUIRES_PAYMENT", 409);
    }

    const current = await getCompanySubscription(session.companyId);
    const now = new Date();

    if (
      current.planId === freePlan.id &&
      current.source === "FREE" &&
      current.status === "ACTIVE" &&
      current.currentPeriodEnd.getTime() > now.getTime()
    ) {
      return jsonOk({
        planId: current.planId,
        periodStart: current.currentPeriodStart,
        periodEnd: current.currentPeriodEnd
      });
    }

    if (
      current.source === "PAID" &&
      current.status === "ACTIVE" &&
      current.currentPeriodEnd.getTime() > now.getTime()
    ) {
      return jsonError("PAID_PLAN_ACTIVE", 409);
    }

    if (
      current.source === "ADMIN_GRANTED" &&
      current.status === "ACTIVE" &&
      current.currentPeriodEnd.getTime() > now.getTime()
    ) {
      return jsonError("ADMIN_PLAN_ACTIVE", 409);
    }

    const periodEnd = new Date(now);
    periodEnd.setDate(periodEnd.getDate() + freePlan.validityDays);

    const subscription = await Subscription.findOneAndUpdate(
      { companyId: session.companyId },
      {
        $set: {
          planId: freePlan.id,
          entitlementSnapshot: createEntitlementSnapshot(freePlan),
          source: "FREE",
          status: "ACTIVE",
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          monthlyMeetingsUsed: 0,
          freeUsageDates: [],
          grantedByUserId: undefined,
          grantedAt: undefined
        },
        $setOnInsert: { companyId: session.companyId }
      },
      { upsert: true, returnDocument: "after" }
    );

    await Workspace.updateOne(
      { companyId: session.companyId },
      { $set: { planId: freePlan.id } }
    );

    await ensureCurrentAccessInvoice(session.companyId);

    return jsonOk({
      planId: subscription.planId,
      periodStart: subscription.currentPeriodStart,
      periodEnd: subscription.currentPeriodEnd
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "FREE_PLAN_FAILED";
    const status =
      code === "CSRF_ORIGIN_INVALID"
        ? 403
        : [
            "PAID_PLAN_ACTIVE",
            "ADMIN_PLAN_ACTIVE",
            "PLAN_COMING_SOON",
            "PLAN_PRIVATE",
            "PLAN_REQUIRES_PAYMENT"
          ].includes(code)
          ? 409
          : 500;
    return jsonError(code, status);
  }
}
