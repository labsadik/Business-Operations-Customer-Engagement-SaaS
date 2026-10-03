import { jsonError, jsonOk } from "@/lib/http";
import { requireCompanyMember } from "@/lib/authz";
import { getMongo } from "@/lib/mongodb";
import { Membership } from "@/models/membership";
import { User } from "@/models/user";
import { GoogleAccount } from "@/models/google-account";
import { Invitation } from "@/models/invitation";
import { isGoogleSchedulingReady } from "@/lib/google-scheduling";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { session } = await requireCompanyMember(["COMPANY_OWNER", "COMPANY_ADMIN", "EMPLOYEE"]);
    await getMongo();
    const members = await Membership.find({ companyId: session.companyId, active: true }).lean();
    const users = await User.find({ _id: { $in: members.map((m) => m.userId) } }).lean();
    const connections = await GoogleAccount.find({
      userId: { $in: users.map((u) => u._id) },
      status: "CONNECTED"
    }).select("userId status scopes").lean();
    const connected = new Set(
      connections.filter(isGoogleSchedulingReady).map((item) => String(item.userId))
    );
    return jsonOk(users.map((user) => ({
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
      googleConnected: connected.has(String(user._id))
    })));
  } catch (error) {
    const code = error instanceof Error ? error.message : "FORBIDDEN";
    return jsonError(code, code === "UNAUTHENTICATED" ? 401 : 403);
  }
}

export async function POST(request: Request) {
  try {
    const { session } = await requireCompanyMember(["COMPANY_OWNER", "COMPANY_ADMIN"]);
    await getMongo();

    const body = await request.json().catch(() => null) as { email?: string } | null;
    const email = body?.email?.trim().toLowerCase();
    if (!email || !email.includes("@")) return jsonError("INVALID_EMAIL");

    const companyMemberCount = await Membership.countDocuments({ companyId: session.companyId, active: true, role: { $in: ["COMPANY_OWNER", "COMPANY_ADMIN", "EMPLOYEE"] } });
    const { getCompanyEntitlements } = await import("@/lib/plans-server");
    const plan = await getCompanyEntitlements(session.companyId!);
    if (companyMemberCount >= plan.maxEmployees) return jsonError("EMPLOYEE_LIMIT_REACHED", 409);

    const { Invitation } = await import("@/models/invitation");
    const { randomToken, sha256 } = await import("@/lib/security");
    const workspace = await (await import("@/models/workspace")).Workspace.findOne({ companyId: session.companyId }).lean();
    if (!workspace) return jsonError("WORKSPACE_NOT_FOUND", 404);

    const pendingInvitation = await Invitation.findOne({
      companyId: session.companyId,
      invitedEmail: email,
      acceptedAt: null,
      expiresAt: { $gt: new Date() }
    }).lean();
    if (pendingInvitation) return jsonError("INVITATION_ALREADY_PENDING", 409);

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      const existingMembership = await Membership.findOne({ companyId: session.companyId, userId: existingUser._id, active: true }).lean();
      if (existingMembership) return jsonError("ALREADY_MEMBER", 409);
    }

    const token = randomToken(32);
    const invitation = await Invitation.create({
      companyId: session.companyId,
      workspaceId: workspace._id,
      invitedEmail: email,
      tokenHash: sha256(token),
      role: "EMPLOYEE",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });

    const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    return jsonOk({ id: String(invitation._id), inviteUrl: `${base}/invite/${token}`, expiresAt: invitation.expiresAt }, 201);
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVITE_FAILED";
    return jsonError(code, code === "UNAUTHENTICATED" ? 401 : 403);
  }
}