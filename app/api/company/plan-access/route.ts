import { requireCompanyMember } from "@/lib/authz";
import { getMongo } from "@/lib/mongodb";
import { jsonError, jsonOk } from "@/lib/http";
import { Company } from "@/models/company";
import { isCompanyPlanSuspended } from "@/lib/plans-server";

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
    // This resolves natural expiry and its legacy fallback once, then the
    // company access cache makes subsequent polls a single small read.
    const locked = await isCompanyPlanSuspended(session.companyId);
    const company = await Company.findById(session.companyId)
      .select("planSuspended planExpired planExpiryTestActive planExpiredAt planSuspendedAt planAccessExpiresAt")
      .lean();
    if (!company) return jsonError("COMPANY_NOT_FOUND", 404);

    const planExpired = Boolean(
      company.planExpired ||
      company.planExpiryTestActive ||
      (company.planAccessExpiresAt && company.planAccessExpiresAt.getTime() <= Date.now())
    );

    return jsonOk({
      planSuspended: Boolean(company.planSuspended),
      planExpired,
      planExpiryTestActive: Boolean(company.planExpiryTestActive),
      locked,
      planSuspendedAt: company.planSuspendedAt ?? null,
      planExpiredAt: company.planExpiredAt ?? (
        planExpired ? company.planAccessExpiresAt ?? null : null
      )
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PLAN_ACCESS_CHECK_FAILED";
    const status = code === "UNAUTHENTICATED" ? 401
      : code === "FORBIDDEN" || code === "CSRF_ORIGIN_INVALID" ? 403
      : 500;
    return jsonError(code, status);
  }
}
