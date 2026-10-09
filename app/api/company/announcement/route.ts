import { getMongo } from "@/lib/mongodb";
import { Announcement } from "@/models/announcement";
import { getSession } from "@/lib/session";
import { Membership } from "@/models/membership";
import { jsonError, jsonOk } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security";
import { Types } from "mongoose";

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

export async function GET() {
  try {
    const session = await requireManager();
    const announcements = await Announcement.find({ companyId: session.companyId })
      .sort({ createdAt: -1 })
      .limit(50)
      .select("_id title message active createdAt")
      .lean();

    return jsonOk(announcements.map(serialize));
  } catch (error) {
    const code = error instanceof Error ? error.message : "ANNOUNCEMENT_FAILED";
    const status = code === "UNAUTHENTICATED" ? 401 : code === "FORBIDDEN" ? 403 : 500;
    return jsonError(code, status);
  }
}

export async function POST(request: Request) {
  assertSameOrigin(request);
  try {
    const session = await requireManager();
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
    const status = code === "UNAUTHENTICATED" ? 401 : code === "FORBIDDEN" ? 403 : 500;
    return jsonError(code, status);
  }
}

export async function PATCH(request: Request) {
  assertSameOrigin(request);
  try {
    const session = await requireManager();
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
    const status = code === "UNAUTHENTICATED" ? 401 : code === "FORBIDDEN" ? 403 : 500;
    return jsonError(code, status);
  }
}

export async function DELETE(request: Request) {
  assertSameOrigin(request);
  try {
    const session = await requireManager();
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
    const status = code === "UNAUTHENTICATED" ? 401 : code === "FORBIDDEN" ? 403 : 500;
    return jsonError(code, status);
  }
}
