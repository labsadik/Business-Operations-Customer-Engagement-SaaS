import { getMongo } from "@/lib/mongodb";
import { Announcement } from "@/models/announcement";
import { getSession } from "@/lib/session";
import { Membership } from "@/models/membership";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireManager() {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHENTICATED");
  if (!session.companyId || !["COMPANY_OWNER", "COMPANY_ADMIN"].includes(session.role)) {
    throw new Error("FORBIDDEN");
  }

  await getMongo();
  const membership = await Membership.findOne({
    companyId: session.companyId,
    userId: session.userId,
    active: true,
    role: { $in: ["COMPANY_OWNER", "COMPANY_ADMIN"] }
  }).lean();

  if (!membership) throw new Error("FORBIDDEN");
  return session;
}

export async function GET() {
  try {
    const session = await requireManager();
    const announcements = await Announcement.find({ companyId: session.companyId })
      .sort({ createdAt: -1 })
      .limit(20)
      .select("_id title message active createdAt")
      .lean();

    return jsonOk(
      announcements.map((item) => ({
        id: String(item._id),
        title: item.title,
        message: item.message,
        active: item.active,
        createdAt: item.createdAt
      }))
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "ANNOUNCEMENT_FAILED";
    return jsonError(code, code === "UNAUTHENTICATED" ? 401 : 403);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireManager();
    const body = await request.json().catch(() => null) as {
      title?: string;
      message?: string;
    } | null;

    const title = body?.title?.trim() || "Announcement";
    const message = body?.message?.trim();

    if (title.length > 120) return jsonError("ANNOUNCEMENT_TITLE_TOO_LONG", 400);
    if (!message || message.length < 1 || message.length > 500) {
      return jsonError("ANNOUNCEMENT_MESSAGE_INVALID", 400);
    }

    await Announcement.updateMany(
      { companyId: session.companyId, active: true },
      { $set: { active: false } }
    );

    const announcement = await Announcement.create({
      companyId: session.companyId,
      title,
      message,
      active: true,
      createdByUserId: session.userId
    });

    return jsonOk({
      id: String(announcement._id),
      title: announcement.title,
      message: announcement.message,
      active: announcement.active,
      createdAt: announcement.createdAt
    }, 201);
  } catch (error) {
    const code = error instanceof Error ? error.message : "ANNOUNCEMENT_CREATE_FAILED";
    return jsonError(code, code === "UNAUTHENTICATED" ? 401 : 403);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireManager();
    const body = await request.json().catch(() => null) as {
      id?: string;
      active?: boolean;
    } | null;

    if (!body?.id || typeof body.active !== "boolean") {
      return jsonError("INVALID_ANNOUNCEMENT_UPDATE", 400);
    }

    const announcement = await Announcement.findOne({
      _id: body.id,
      companyId: session.companyId
    });
    if (!announcement) return jsonError("ANNOUNCEMENT_NOT_FOUND", 404);

    if (body.active) {
      await Announcement.updateMany(
        { companyId: session.companyId, _id: { $ne: announcement._id }, active: true },
        { $set: { active: false } }
      );
    }

    announcement.active = body.active;
    await announcement.save();

    return jsonOk({
      id: String(announcement._id),
      title: announcement.title,
      message: announcement.message,
      active: announcement.active,
      createdAt: announcement.createdAt
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "ANNOUNCEMENT_UPDATE_FAILED";
    return jsonError(code, code === "UNAUTHENTICATED" ? 401 : 403);
  }
}
