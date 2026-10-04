import { getSession } from "@/lib/session";
import { grantCompanyPlan } from "@/lib/billing";

import { jsonError, jsonOk } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> }
) {
  try {
    assertSameOrigin(request);
    const session = await getSession();
    if (!session) return jsonError("UNAUTHENTICATED", 401);
    if (session.role !== "PLATFORM_ADMIN") return jsonError("FORBIDDEN", 403);

    const { companyId } = await params;
    const body = await request.json().catch(() => null) as { planId?: string } | null;
    const planId = body?.planId?.trim().toLowerCase();
    if (!planId) return jsonError("PLAN_NOT_FOUND", 400);

    const subscription = await grantCompanyPlan(companyId, planId, session.userId);
    return jsonOk({
      planId: subscription.planId,
      source: subscription.source,
      periodStart: subscription.currentPeriodStart,
      periodEnd: subscription.currentPeriodEnd
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PLAN_GRANT_FAILED";
    return jsonError(code, code === "CSRF_ORIGIN_INVALID" ? 403 : code === "FORBIDDEN" ? 403 : code === "PLAN_ARCHIVED" ? 409 : 500);
  }
}
