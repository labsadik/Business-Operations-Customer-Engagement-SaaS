import { getMongo } from "@/lib/mongodb";
import { Announcement } from "@/models/announcement";
import { getSession } from "@/lib/session";
import { Membership } from "@/models/membership";
import { jsonError, jsonOk } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security";
import { Types } from "mongoose";
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

function serialize(item: {
  _id: unknown;
  title: string;
  message: string;
  active: boolean;
  createdAt: Date;
}) {
  return {
    id: String(item._id),
    title: item.title,
    message: item.message,
    active: item.active,
    createdAt: item.createdAt
  };
}

export async function GET(request: Request) {
  try {
    const session = await requireManager();
    const url = new URL(request.url);
    const paginated = url.searchParams.get("paginated") === "true";
    const limit = paginated ? parseListLimit(url.searchParams.get("limit")) : 50;
    const cursorValue = url.searchParams.get("cursor");
    const cursor = paginated ? decodeListCursor(cursorValue) : null;
    if (paginated && cursorValue && !cursor) return jsonError("INVALID_ANNOUNCEMENT_CURSOR", 400);
    const cursorDate = cursor ? new Date(cursor.key) : null;
    if (cursorDate && !Number.isFinite(cursorDate.getTime())) return jsonError("INVALID_ANNOUNCEMENT_CURSOR", 400);
    const rows = await Announcement.find({
      companyId: session.companyId,
      ...(cursor && cursorDate ? { $or: [
        { createdAt: { $lt: cursorDate } },
        { createdAt: cursorDate, _id: { $lt: cursor.id } }
      ] } : {})
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(paginated ? limit + 1 : limit)
      .select("_id title message active createdAt")
      .lean();
    const hasMore = paginated && rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const serialized = items.map(serialize);
    if (!paginated) return jsonOk(serialized);
    const last = items[items.length - 1];
    return jsonOk({
      items: serialized,
      nextCursor: hasMore && last ? encodeListCursor(last.createdAt, last._id) : null
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "ANNOUNCEMENT_FAILED";
    const status = code === "UNAUTHENTICATED" ? 401 : code === "FORBIDDEN" ? 403 : code === "PLAN_SUSPENDED" ? 423 : 500;
    return jsonError(code, status);
  }
}

export async function POST(request: Request) {
  assertSameOrigin(request);
  try {
    const session = await requireManager();
    if (session.role !== "PLATFORM_ADMIN" && await isCompanyPlanSuspended(session.companyId!)) return jsonError("PLAN_SUSPENDED", 423);
    const body = await request.json().catch(() => null) as {
      title?: string;
      message?: string;
    } | null;

    const title = body?.title?.trim() || "Announcement";
    const message = body?.message?.trim();

    if (title.length > 120) return jsonError("ANNOUNCEMENT_TITLE_TOO_LONG", 400);
    if (!message || message.length > 500) return jsonError("ANNOUNCEMENT_MESSAGE_INVALID", 400);

    const db = await getMongo();
    const tx = await db.startSession();
    try {
      let created;
      await tx.withTransaction(async () => {
        await Announcement.updateMany(
          { companyId: session.companyId, active: true },
          { $set: { active: false } },
          { session: tx }
        );

        const [announcement] = await Announcement.create([{
          companyId: session.companyId,
          title,
          message,
          active: true,
          createdByUserId: session.userId
        }], { session: tx });

        created = announcement;
      });

      if (!created) return jsonError("ANNOUNCEMENT_CREATE_FAILED", 500);
      return jsonOk(serialize(created), 201);
    } finally {
      await tx.endSession();
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : "ANNOUNCEMENT_CREATE_FAILED";
    const status = code === "UNAUTHENTICATED" ? 401 : code === "FORBIDDEN" ? 403 : code === "PLAN_SUSPENDED" ? 423 : 500;
    return jsonError(code, status);
  }
}

export async function PATCH(request: Request) {
  assertSameOrigin(request);
  try {
    const session = await requireManager();
    if (session.role !== "PLATFORM_ADMIN" && await isCompanyPlanSuspended(session.companyId!)) return jsonError("PLAN_SUSPENDED", 423);
    const body = await request.json().catch(() => null) as {
      id?: string;
      title?: string;
      message?: string;
      active?: boolean;
    } | null;

    if (!body?.id || !Types.ObjectId.isValid(body.id)) {
      return jsonError("INVALID_ANNOUNCEMENT_UPDATE", 400);
    }

    const announcement = await Announcement.findOne({
      _id: body.id,
      companyId: session.companyId
    });
    if (!announcement) return jsonError("ANNOUNCEMENT_NOT_FOUND", 404);

    if (typeof body.title === "string") {
      const title = body.title.trim() || "Announcement";
      if (title.length > 120) return jsonError("ANNOUNCEMENT_TITLE_TOO_LONG", 400);
      announcement.title = title;
    }

    if (typeof body.message === "string") {
      const message = body.message.trim();
      if (!message || message.length > 500) return jsonError("ANNOUNCEMENT_MESSAGE_INVALID", 400);
      announcement.message = message;
    }

    if (typeof body.active === "boolean") {
      if (body.active) {
        await Announcement.updateMany(
          {
            companyId: session.companyId,
            _id: { $ne: announcement._id },
            active: true
          },
          { $set: { active: false } }
        );
      }
      announcement.active = body.active;
    }

    await announcement.save();
    return jsonOk(serialize(announcement));
  } catch (error) {
    const code = error instanceof Error ? error.message : "ANNOUNCEMENT_UPDATE_FAILED";
    const status = code === "UNAUTHENTICATED" ? 401 : code === "FORBIDDEN" ? 403 : code === "PLAN_SUSPENDED" ? 423 : 500;
    return jsonError(code, status);
  }
}

export async function DELETE(request: Request) {
  assertSameOrigin(request);
  try {
    const session = await requireManager();
    if (session.role !== "PLATFORM_ADMIN" && await isCompanyPlanSuspended(session.companyId!)) return jsonError("PLAN_SUSPENDED", 423);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id") ?? "";

    if (!Types.ObjectId.isValid(id)) return jsonError("INVALID_ANNOUNCEMENT_ID", 400);

    const deleted = await Announcement.findOneAndDelete({
      _id: id,
      companyId: session.companyId
    }).lean();

    if (!deleted) return jsonError("ANNOUNCEMENT_NOT_FOUND", 404);
    return jsonOk({ id, deleted: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "ANNOUNCEMENT_DELETE_FAILED";
    const status = code === "UNAUTHENTICATED" ? 401 : code === "FORBIDDEN" ? 403 : code === "PLAN_SUSPENDED" ? 423 : 500;
    return jsonError(code, status);
  }
}
