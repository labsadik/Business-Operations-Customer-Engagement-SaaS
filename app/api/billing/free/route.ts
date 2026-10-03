import { getSession } from "@/lib/session";
import { getMongo } from "@/lib/mongodb";
import { Subscription } from "@/models/subscription";
import { Workspace } from "@/models/workspace";
import { PLANS } from "@/lib/plans";
import { Company } from "@/models/company";
import { ensureCurrentAccessInvoice } from "@/lib/billing";
import { jsonError, jsonOk } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await getSession();
    if (!session || !session.companyId) return jsonError("UNAUTHENTICATED", 401);
    if (!["COMPANY_OWNER", "COMPANY_ADMIN"].includes(session.role)) return jsonError("FORBIDDEN", 403);

    await getMongo();
    const company = await Company.findById(session.companyId).lean();
    if (!company) return jsonError("COMPANY_NOT_FOUND", 404);

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setDate(periodEnd.getDate() + PLANS.free.validityDays);

    const subscription = await Subscription.findOneAndUpdate(
      { companyId: session.companyId },
      {
        $set: {
          planId: "free",
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
      { upsert: true, new: true }
    );

    await Workspace.updateOne(
      { companyId: session.companyId },
      { $set: { planId: "free" } }
    );
    await ensureCurrentAccessInvoice(session.companyId);

    return jsonOk({
      planId: "free",
      periodStart: subscription.currentPeriodStart,
      periodEnd: subscription.currentPeriodEnd
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "FREE_PLAN_FAILED";
    return jsonError(code, code === "CSRF_ORIGIN_INVALID" ? 403 : 500);
  }
}
