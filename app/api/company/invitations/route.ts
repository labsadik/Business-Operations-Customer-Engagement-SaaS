import { getMongo } from "@/lib/mongodb";
import { getSession } from "@/lib/session";
import { Membership } from "@/models/membership";
import { Invitation } from "@/models/invitation";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireManager() {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHENTICATED");
  if (!session.companyId || (session.role !== "PLATFORM_ADMIN" && !["COMPANY_ADMIN"].includes(session.role))) {
    throw new Error("FORBIDDEN");
  }

  if (session.role === "PLATFORM_ADMIN") return session;

  await getMongo();
  const membership = await Membership.findOne({
    companyId: session.companyId,
    userId: session.userId,
    active: true,
    role: { $in: ["COMPANY_ADMIN"] }
  }).lean();

  if (!membership) throw new Error("FORBIDDEN");
  return session;
}

export async function GET() {
  try {
    const session = await requireManager();
    const now = new Date();
    const invitations = await Invitation.find({
      companyId: session.companyId,
      acceptedAt: null
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .select("_id invitedEmail role expiresAt createdAt")
      .lean();

    return jsonOk(invitations.map((item) => ({
      id: String(item._id),
      email: item.invitedEmail,
      role: item.role,
      status: item.expiresAt.getTime() > now.getTime() ? "PENDING" : "EXPIRED",
      expiresAt: item.expiresAt,
      createdAt: item.createdAt
    })));
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVITATION_LIST_FAILED";
    const status = code === "UNAUTHENTICATED" ? 401 : code === "FORBIDDEN" ? 403 : 500;
    return jsonError(code, status);
  }
}
