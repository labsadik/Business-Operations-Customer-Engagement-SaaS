import { jsonError, jsonOk } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security";
import { requireCompanyMember } from "@/lib/authz";
import { getMongo } from "@/lib/mongodb";
import { Membership } from "@/models/membership";
import { User } from "@/models/user";
import { GoogleAccount } from "@/models/google-account";
import { Invitation } from "@/models/invitation";
import { isGoogleSchedulingReady } from "@/lib/google-scheduling";
import { getPublicOriginString } from "@/lib/public-origin";
import { isCompanyPlanSuspended } from "@/lib/plans-server";
import { parseListLimit, decodeListCursor, encodeListCursor } from "@/lib/list-pagination";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { session } = await requireCompanyMember(["COMPANY_ADMIN", "EMPLOYEE",
    "PLATFORM_ADMIN"
  ]);
    await getMongo();
    const url = new URL(request.url);
    const limit = parseListLimit(url.searchParams.get("limit"));
    const cursorValue = url.searchParams.get("cursor");
    const cursor = decodeListCursor(cursorValue);
    if (cursorValue && !cursor) return jsonError("INVALID_LIST_CURSOR", 400);

    const filters: Record<string, unknown>[] = [
      { companyId: session.companyId, active: true }
    ];
    if (cursor) {
      const createdAt = new Date(cursor.key);
      if (!Number.isFinite(createdAt.getTime())) return jsonError("INVALID_LIST_CURSOR", 400);
      filters.push({
        $or: [
          { createdAt: { $gt: createdAt } },
          { createdAt, _id: { $gt: cursor.id } }
        ]
      });
    }

    const membershipRows = await Membership.find({ $and: filters })
      .select("userId role employmentStatus createdAt")
      .sort({ createdAt: 1, _id: 1 })
      .limit(limit + 1)
      .lean();
    const hasMore = membershipRows.length > limit;
    const members = membershipRows.slice(0, limit);
    const users = await User.find({ _id: { $in: members.map((member) => member.userId) } })
      .select("_id name email image role jobTitle department")
      .lean();
    const connections = await GoogleAccount.find({
      userId: { $in: users.map((user) => user._id) },
      status: "CONNECTED"
    }).select("userId status scopes").lean();
    const connected = new Set(
      connections.filter(isGoogleSchedulingReady).map((item) => String(item.userId))
    );
    const membershipByUserId = new Map(members.map((member) => [String(member.userId), member]));
    const userMap = new Map(users.map((user) => [String(user._id), user]));
    const items = members.flatMap((member) => {
      const user = userMap.get(String(member.userId));
      if (!user) return [];
      return [{
        id: String(user._id),
        name: user.name,
        email: user.email,
        image: user.image ?? "",
        role: membershipByUserId.get(String(user._id))?.role ?? user.role,
        jobTitle: user.jobTitle ?? "",
        department: user.department ?? "",
        employmentStatus: member.employmentStatus ?? "ACTIVE",
        googleConnected: connected.has(String(user._id))
      }];
    });
    const last = members[members.length - 1];
    return jsonOk({
      items,
      nextCursor: hasMore && last ? encodeListCursor(last.createdAt, last._id) : null
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "FORBIDDEN";
    return jsonError(code, code === "UNAUTHENTICATED" ? 401 : 403);
  }
}

export async function POST(request: Request) {
  assertSameOrigin(request);
  try {
    const { session } = await requireCompanyMember(["COMPANY_ADMIN",
    "PLATFORM_ADMIN"
  ]);
    if (session.role !== "PLATFORM_ADMIN" && await isCompanyPlanSuspended(session.companyId!)) {
      return jsonError("PLAN_SUSPENDED", 423);
    }
    await getMongo();

    const body = await request.json().catch(() => null) as { email?: string } | null;
    const email = body?.email?.trim().toLowerCase();
    if (!email || !email.includes("@")) return jsonError("INVALID_EMAIL");

    const companyMemberCount = await Membership.countDocuments({ companyId: session.companyId, active: true, role: { $in: ["COMPANY_ADMIN", "EMPLOYEE"] } });
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

    const base = getPublicOriginString();
    return jsonOk({ id: String(invitation._id), inviteUrl: `${base}/invite/${token}`, expiresAt: invitation.expiresAt }, 201);
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVITE_FAILED";
    return jsonError(code, code === "UNAUTHENTICATED" ? 401 : 403);
  }
}