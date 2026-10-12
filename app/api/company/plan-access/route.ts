import { requireCompanyMember } from "@/lib/authz";
import { getMongo } from "@/lib/mongodb";
import { jsonError, jsonOk } from "@/lib/http";
import { getCompanyPlanAccessState } from "@/lib/plans-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { session } = await requireCompanyMember([
      "COMPANY_ADMIN",
      "EMPLOYEE",
      "PLATFORM_ADMIN"
    ]);
    if (!session.companyId) return jsonError("COMPANY_NOT_CONFIGURED", 403);

    await getMongo();
    const state = await getCompanyPlanAccessState(session.companyId);
    if (!state) return jsonError("COMPANY_NOT_FOUND", 404);

    return jsonOk({
      ...state,
      planAccessExpiresAt: state.planAccessExpiresAt?.toISOString() ?? null,
      planSuspendedAt: state.planSuspendedAt?.toISOString() ?? null,
      planExpiredAt: state.planExpiredAt?.toISOString() ?? null
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PLAN_ACCESS_CHECK_FAILED";
    const status = code === "UNAUTHENTICATED" ? 401
      : code === "FORBIDDEN" || code === "CSRF_ORIGIN_INVALID" ? 403
      : 500;
    return jsonError(code, status);
  }
}
