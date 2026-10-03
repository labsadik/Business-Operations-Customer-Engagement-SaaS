import { getMongo } from "@/lib/mongodb";
import { getSession } from "@/lib/session";
import { Membership } from "@/models/membership";
import { Invitation } from "@/models/invitation";
import { jsonError, jsonOk } from "@/lib/http";
import { Types } from "mongoose";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ invitationId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return jsonError("UNAUTHENTICATED", 401);
    if (!session.companyId || !["COMPANY_OWNER", "COMPANY_ADMIN"].includes(session.role)) {
      return jsonError("FORBIDDEN", 403);
    }

    await getMongo();
    const membership = await Membership.findOne({
      companyId: session.companyId,
      userId: session.userId,
      active: true,
      role: { $in: ["COMPANY_OWNER", "COMPANY_ADMIN"] }
    }).lean();
    if (!membership) return jsonError("FORBIDDEN", 403);

    const { invitationId } = await params;
    if (!Types.ObjectId.isValid(invitationId)) return jsonError("INVALID_INVITATION_ID", 400);

    const deleted = await Invitation.findOneAndDelete({
      _id: invitationId,
      companyId: session.companyId,
      acceptedAt: null
    }).lean();

    if (!deleted) return jsonError("INVITATION_NOT_FOUND", 404);
    return jsonOk({ id: invitationId, cancelled: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVITATION_CANCEL_FAILED";
    const status = code === "UNAUTHENTICATED" ? 401 : code === "FORBIDDEN" ? 403 : 500;
    return jsonError(code, status);
  }
}
