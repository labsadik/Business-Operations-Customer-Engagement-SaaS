import { Types } from "mongoose";
import { PlatformAnnouncement } from "@/models/platform-announcement";
import { getSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/http";
import { companyPlatformAnnouncementFilter } from "@/lib/platform-announcement-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return jsonError("UNAUTHENTICATED", 401);
    if (!session.companyId || !Types.ObjectId.isValid(session.companyId)) {
      return jsonError("COMPANY_NOT_CONFIGURED", 403);
    }
    if (!["COMPANY_OWNER", "COMPANY_ADMIN", "EMPLOYEE", "PLATFORM_ADMIN"].includes(session.role)) {
      return jsonError("FORBIDDEN", 403);
    }

    const announcements = await PlatformAnnouncement.find(
      companyPlatformAnnouncementFilter(session.companyId)
    )
      .sort({ publishedAt: -1, createdAt: -1, _id: -1 })
      .limit(10)
      .select("_id title message audience publishedAt createdAt")
      .lean();

    return jsonOk(announcements.map((item) => ({
      id: String(item._id),
      title: item.title,
      message: item.message,
      audience: item.audience,
      publishedAt: item.publishedAt ?? null,
      createdAt: item.createdAt
    })));
  } catch (error) {
    const code = error instanceof Error ? error.message : "PLATFORM_ANNOUNCEMENT_READ_FAILED";
    return jsonError(code, code === "UNAUTHENTICATED" ? 401 : code === "FORBIDDEN" ? 403 : 500);
  }
}
