import { Types } from "mongoose";
import { requirePlatformAdmin } from "@/lib/admin";
import { assertSameOrigin } from "@/lib/security";
import { getMongo } from "@/lib/mongodb";
import { jsonError, jsonOk } from "@/lib/http";
import { Company } from "@/models/company";
import { Subscription } from "@/models/subscription";
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

    const body = await request.json().catch(() => null) as { action?: unknown } | null;
    if (body?.action !== "expire" && body?.action !== "restore") {
      return jsonError("PLAN_EXPIRY_TEST_ACTION_INVALID", 400);
    }

    await getMongo();
    const id = new Types.ObjectId(companyId);
    const company = await Company.findById(id).lean();
    if (!company) return jsonError("COMPANY_NOT_FOUND", 404);

    if (body.action === "expire") {
      if (company.planExpiryTestActive) {
        return jsonOk({
          companyId,
          planExpired: true,
          planExpiryTestActive: true,
          planExpiredAt: company.planExpiredAt ?? null
        });
      }
      if (company.planExpired) return jsonError("PLAN_ALREADY_EXPIRED", 409);

      const subscription = await Subscription.findOne({ companyId: id })
        .select("source currentPeriodEnd")
        .lean();
      if (!subscription) return jsonError("SUBSCRIPTION_NOT_FOUND", 409);
      const now = new Date();
      if (
        ["PAID", "ADMIN_GRANTED"].includes(subscription.source) &&
        subscription.currentPeriodEnd.getTime() <= now.getTime()
      ) {
        await Company.updateOne(
          { _id: id, planExpired: { $ne: true } },
          { $set: { planExpired: true, planExpiredAt: subscription.currentPeriodEnd } }
        );
        return jsonError("PLAN_ALREADY_EXPIRED", 409);
      }

      const updated = await Company.findOneAndUpdate(
        { _id: id, planExpired: { $ne: true }, planExpiryTestActive: { $ne: true } },
        {
          $set: {
            planExpired: true,
            planExpiredAt: now,
            planExpiredByUserId: new Types.ObjectId(session.userId),
            planExpiryTestActive: true
          }
        },
        { returnDocument: "after" }
      ).select("_id planExpired planExpiredAt planExpiryTestActive").lean();

      if (!updated) return jsonError("PLAN_EXPIRY_TEST_CONFLICT", 409);

      await PlatformAuditEvent.create({
        actorUserId: new Types.ObjectId(session.userId),
        entityType: "COMPANY",
        entityId: id,
        action: "PLAN_EXPIRY_TEST_STARTED",
        details: {
          planExpired: true,
          planExpiryTestActive: true,
          changedAt: now,
          billingPeriodPreserved: true
        }
      });

      return jsonOk({
        companyId: String(updated._id),
        planExpired: true,
        planExpiryTestActive: true,
        planExpiredAt: updated.planExpiredAt ?? now
      });
    }

    if (!company.planExpiryTestActive) {
      return jsonError("PLAN_EXPIRY_TEST_NOT_ACTIVE", 409);
    }

    const subscription = await Subscription.findOne({ companyId: id })
      .select("source currentPeriodEnd")
      .lean();
    const now = new Date();
    const expiredDuringTest = Boolean(
      subscription &&
      ["PAID", "ADMIN_GRANTED"].includes(subscription.source) &&
      subscription.currentPeriodEnd.getTime() <= now.getTime()
    );

    const update = await Company.findOneAndUpdate(
      { _id: id, planExpiryTestActive: true },
      {
        $set: {
          planExpired: expiredDuringTest,
          planExpiryTestActive: false,
          ...(expiredDuringTest && subscription ? { planExpiredAt: subscription.currentPeriodEnd } : {})
        },
        $unset: expiredDuringTest ? { planExpiredByUserId: "" } : {
          planExpiredAt: "",
          planExpiredByUserId: ""
        }
      },
      { returnDocument: "after" }
    ).select("_id planExpired planExpiredAt planExpiryTestActive").lean();

    if (!update) return jsonError("PLAN_EXPIRY_TEST_CONFLICT", 409);

    await PlatformAuditEvent.create({
      actorUserId: new Types.ObjectId(session.userId),
      entityType: "COMPANY",
      entityId: id,
      action: "PLAN_EXPIRY_TEST_RESTORED",
      details: {
        planExpired: Boolean(update.planExpired),
        planExpiryTestActive: false,
        changedAt: now,
        naturallyExpiredDuringTest: expiredDuringTest
      }
    });

    return jsonOk({
      companyId: String(update._id),
      planExpired: Boolean(update.planExpired),
      planExpiryTestActive: false,
      planExpiredAt: update.planExpiredAt ?? null
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PLAN_EXPIRY_TEST_FAILED";
    const status = code === "UNAUTHENTICATED" ? 401
      : code === "FORBIDDEN" || code === "CSRF_ORIGIN_INVALID" ? 403
      : 500;
    return jsonError(code, status);
  }
}
