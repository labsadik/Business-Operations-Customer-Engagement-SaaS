import { getMongo } from "@/lib/mongodb";
import { getSession } from "@/lib/session";
import { Membership } from "@/models/membership";
import { Invitation } from "@/models/invitation";
import { jsonError, jsonOk } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security";
import { randomToken, sha256 } from "@/lib/security";
import { Types } from "mongoose";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  {
  assertSameOrigin(request); params }: { params: Promise<{ invitationId: string }> }
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

    const invitation = await Invitation.findOne({
      _id: invitationId,
      companyId: session.companyId,
      acceptedAt: null
    });
    if (!invitation) return jsonError("INVITATION_NOT_FOUND", 404);

    const token = randomToken(32);
    invitation.tokenHash = sha256(token);
    invitation.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await invitation.save();

    const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    return jsonOk({
      id: String(invitation._id),
      email: invitation.invitedEmail,
      inviteUrl: `${base}/invite/${token}`,
      expiresAt: invitation.expiresAt
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVITATION_RESEND_FAILED";
    const status = code === "UNAUTHENTICATED" ? 401 : code === "FORBIDDEN" ? 403 : 500;
    return jsonError(code, status);
  }
}
