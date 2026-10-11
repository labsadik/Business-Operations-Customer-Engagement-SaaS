import { Types } from "mongoose";
import { requirePlatformAdmin } from "@/lib/admin";
import { assertSameOrigin } from "@/lib/security";
import { jsonError, jsonOk } from "@/lib/http";
import { Company } from "@/models/company";
import { PlatformAuditEvent } from "@/models/platform-audit-event";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> }
) {
  try {
    assertSameOrigin(request);
    const session = await requirePlatformAdmin();
    const { companyId } = await params;
    if (!Types.ObjectId.isValid(companyId)) return jsonError("COMPANY_NOT_FOUND", 404);

    const body = await request.json().catch(() => null) as { suspended?: unknown } | null;
    if (!body || typeof body.suspended !== "boolean") {
      return jsonError("PLAN_SUSPENSION_VALUE_INVALID", 400);
    }

    const companyObjectId = new Types.ObjectId(companyId);
    const now = new Date();
    const company = await Company.findOneAndUpdate(
      { _id: companyObjectId },
      body.suspended
        ? {
            $set: {
              planSuspended: true,
              planSuspendedAt: now,
              planSuspendedByUserId: new Types.ObjectId(session.userId)
            }
          }
        : {
            $set: { planSuspended: false },
            $unset: { planSuspendedAt: "", planSuspendedByUserId: "" }
          },
      { returnDocument: "after", runValidators: true }
    ).select("_id name planSuspended planSuspendedAt").lean();

    if (!company) return jsonError("COMPANY_NOT_FOUND", 404);

    await PlatformAuditEvent.create({
      actorUserId: new Types.ObjectId(session.userId),
      entityType: "COMPANY",
      entityId: companyObjectId,
      action: body.suspended ? "PLAN_SUSPENDED" : "PLAN_RESUMED",
      details: {
        companyName: company.name,
        planSuspended: company.planSuspended,
        changedAt: now
      }
    });

    return jsonOk({
      companyId: String(company._id),
      planSuspended: Boolean(company.planSuspended),
      planSuspendedAt: company.planSuspendedAt ?? null
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PLAN_SUSPENSION_FAILED";
    const status = code === "UNAUTHENTICATED" ? 401
      : code === "FORBIDDEN" || code === "CSRF_ORIGIN_INVALID" ? 403
      : 500;
    return jsonError(code, status);
  }
}
