import { Types } from "mongoose";
import { getMongo } from "@/lib/mongodb";
import { getSession } from "@/lib/session";
import { User } from "@/models/user";
import { Membership } from "@/models/membership";
import { Session } from "@/models/session";
import { AdminAuditEvent } from "@/models/admin-audit-event";
import { assertSameOrigin } from "@/lib/security";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MEMBERSHIP_ROLES = ["COMPANY_ADMIN", "EMPLOYEE"] as const;
type RestorableRole = "CUSTOMER" | "COMPANY_ADMIN" | "EMPLOYEE";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    assertSameOrigin(request);

    const session = await getSession();
    if (!session) return jsonError("UNAUTHENTICATED", 401);
    if (session.role !== "PLATFORM_ADMIN") return jsonError("FORBIDDEN", 403);

    const { userId } = await params;
    if (!Types.ObjectId.isValid(userId)) return jsonError("INVALID_USER_ID", 400);
    if (userId === session.userId) return jsonError("SELF_ROLE_CHANGE_NOT_ALLOWED", 409);

    const body = await request.json().catch(() => null) as { platformAdmin?: boolean } | null;
    if (typeof body?.platformAdmin !== "boolean") {
      return jsonError("INVALID_PLATFORM_ADMIN_VALUE", 400);
    }

    await getMongo();
    const target = await User.findById(userId);
    if (!target) return jsonError("USER_NOT_FOUND", 404);

    const enabling = body.platformAdmin;

    if (enabling) {
      if (target.role === "PLATFORM_ADMIN") {
        return jsonOk({ id: userId, role: target.role, changed: false });
      }

      target.platformAdminPreviousRole = target.role as RestorableRole;
      target.role = "PLATFORM_ADMIN";
      await target.save();

      await AdminAuditEvent.create({
        actorUserId: session.userId,
        targetUserId: target._id,
        action: "GRANT_PLATFORM_ADMIN",
        fromRole: target.platformAdminPreviousRole,
        toRole: "PLATFORM_ADMIN"
      });

      return jsonOk({ id: userId, role: target.role, changed: true });
    }

    if (target.role !== "PLATFORM_ADMIN") {
      return jsonOk({ id: userId, role: target.role, changed: false });
    }

    const activeAdminCount = await User.countDocuments({
      role: "PLATFORM_ADMIN",
      active: true
    });

    if (activeAdminCount <= 1) {
      return jsonError("LAST_PLATFORM_ADMIN", 409);
    }

    const membership = await Membership.findOne({
      userId: target._id,
      active: true,
      role: { $in: MEMBERSHIP_ROLES }
    }).sort({ createdAt: -1 }).lean();

    const restoredRole: RestorableRole =
      target.platformAdminPreviousRole ??
      (membership?.role as RestorableRole | undefined) ??
      "CUSTOMER";

    const previousRole = target.role;
    target.role = restoredRole;
    target.platformAdminPreviousRole = undefined;
    await target.save();

    await Session.deleteMany({
      userId: target._id,
      role: "PLATFORM_ADMIN"
    });

    await AdminAuditEvent.create({
      actorUserId: session.userId,
      targetUserId: target._id,
      action: "REVOKE_PLATFORM_ADMIN",
      fromRole: previousRole,
      toRole: restoredRole
    });

    return jsonOk({ id: userId, role: restoredRole, changed: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "ADMIN_ACCESS_UPDATE_FAILED";
    const status =
      code === "CSRF_ORIGIN_INVALID" || code === "FORBIDDEN" ? 403 :
      code === "SELF_ROLE_CHANGE_NOT_ALLOWED" || code === "LAST_PLATFORM_ADMIN" ? 409 :
      code === "UNAUTHENTICATED" ? 401 : 500;
    return jsonError(code, status);
  }
}
