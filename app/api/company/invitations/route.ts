import { getMongo } from "@/lib/mongodb";
import { getSession } from "@/lib/session";
import { Membership } from "@/models/membership";
import { Invitation } from "@/models/invitation";
import { jsonError, jsonOk } from "@/lib/http";
import { isCompanyPlanSuspended } from "@/lib/plans-server";
import { decodeListCursor, encodeListCursor, parseListLimit } from "@/lib/list-pagination";

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
  if (await isCompanyPlanSuspended(session.companyId)) throw new Error("PLAN_SUSPENDED");
  return session;
}

export async function GET(request: Request) {
  try {
    const session = await requireManager();
    const url = new URL(request.url);
    const paginated = url.searchParams.get("paginated") === "true";
    const limit = paginated ? parseListLimit(url.searchParams.get("limit")) : 50;
    const cursorValue = url.searchParams.get("cursor");
    const cursor = paginated ? decodeListCursor(cursorValue) : null;
    if (paginated && cursorValue && !cursor) return jsonError("INVALID_INVITATION_CURSOR", 400);
    const cursorDate = cursor ? new Date(cursor.key) : null;
    if (cursorDate && !Number.isFinite(cursorDate.getTime())) return jsonError("INVALID_INVITATION_CURSOR", 400);
    const now = new Date();
    const rows = await Invitation.find({
      companyId: session.companyId,
      acceptedAt: null,
      ...(cursor && cursorDate ? { $or: [
        { createdAt: { $lt: cursorDate } },
        { createdAt: cursorDate, _id: { $lt: cursor.id } }
      ] } : {})
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(paginated ? limit + 1 : limit)
      .select("_id invitedEmail role expiresAt createdAt")
      .lean();
    const hasMore = paginated && rows.length > limit;
    const invitations = hasMore ? rows.slice(0, limit) : rows;
    const items = invitations.map((item) => ({
      id: String(item._id),
      email: item.invitedEmail,
      role: item.role,
      status: item.expiresAt.getTime() > now.getTime() ? "PENDING" as const : "EXPIRED" as const,
      expiresAt: item.expiresAt,
      createdAt: item.createdAt
    }));
    if (!paginated) return jsonOk(items);
    const last = invitations[invitations.length - 1];
    return jsonOk({
      items,
      nextCursor: hasMore && last ? encodeListCursor(last.createdAt, last._id) : null
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVITATION_LIST_FAILED";
    const status = code === "UNAUTHENTICATED" ? 401 : code === "FORBIDDEN" ? 403 : code === "PLAN_SUSPENDED" ? 423 : 500;
    return jsonError(code, status);
  }
}
