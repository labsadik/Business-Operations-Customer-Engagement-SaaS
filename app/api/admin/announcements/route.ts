import { Types } from "mongoose";
import { Company } from "@/models/company";
import { PlatformAnnouncement } from "@/models/platform-announcement";
import { PlatformAuditEvent } from "@/models/platform-audit-event";
import { requirePlatformAdmin } from "@/lib/admin";
import { assertSameOrigin } from "@/lib/security";
import { jsonError, jsonOk } from "@/lib/http";
import {
  PLATFORM_ANNOUNCEMENT_AUDIENCES,
  validateAnnouncementAudience,
  validateAnnouncementContent,
  validateAnnouncementStatus
} from "@/lib/platform-communication";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorStatus(code: string) {
  if (code === "UNAUTHENTICATED") return 401;
  if (code === "FORBIDDEN" || code === "CSRF_ORIGIN_INVALID") return 403;
  if (code === "ANNOUNCEMENT_NOT_FOUND" || code === "COMPANY_NOT_FOUND") return 404;
  return 400;
}

async function validateTargets(ids: string[]) {
  const objectIds = ids.map((id) => new Types.ObjectId(id));
  if (!objectIds.length) return [];
  const companies = await Company.find({ _id: { $in: objectIds } })
    .select("_id name slug")
    .limit(50)
    .lean();
  if (companies.length !== ids.length) throw new Error("COMPANY_NOT_FOUND");
  return companies;
}

async function serialize(items: Array<{
  _id: unknown;
  title: string;
  message: string;
  audience: string;
  targetCompanyIds?: unknown[];
  status: string;
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date | null;
}>) {
  const targetIds = [...new Set(items.flatMap((item) => (item.targetCompanyIds ?? []).map(String)))];
  const companies = targetIds.length
    ? await Company.find({ _id: { $in: targetIds.map((id) => new Types.ObjectId(id)) } })
        .select("_id name slug")
        .limit(50)
        .lean()
    : [];
  const companyMap = new Map(
    companies.map((company) => [String(company._id), {
      id: String(company._id),
      name: company.name,
      slug: company.slug
    }])
  );

  return items.map((item) => ({
    id: String(item._id),
    title: item.title,
    message: item.message,
    audience: item.audience,
    status: item.status,
    targetCompanies: (item.targetCompanyIds ?? [])
      .map((id) => companyMap.get(String(id)))
      .filter((company): company is { id: string; name: string; slug: string } => Boolean(company)),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    publishedAt: item.publishedAt ?? null
  }));
}

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin();
    const url = new URL(request.url);
    const rawPage = Number(url.searchParams.get("page") ?? "1");
    const rawLimit = Number(url.searchParams.get("limit") ?? "20");
    const page = Number.isFinite(rawPage) ? Math.min(1000, Math.max(1, Math.floor(rawPage))) : 1;
    const limit = Number.isFinite(rawLimit) ? Math.min(50, Math.max(1, Math.floor(rawLimit))) : 20;
    const status = url.searchParams.get("status") ?? "";
    const audience = url.searchParams.get("audience") ?? "";
    const companyId = url.searchParams.get("companyId") ?? "";

    const query: Record<string, unknown> = {};

    if (status) query.status = validateAnnouncementStatus(status);
    if (audience) {
      if (!PLATFORM_ANNOUNCEMENT_AUDIENCES.includes(audience as typeof PLATFORM_ANNOUNCEMENT_AUDIENCES[number])) {
        throw new Error("INVALID_ANNOUNCEMENT_AUDIENCE");
      }
      query.audience = audience;
    }

    if (companyId) {
      if (!Types.ObjectId.isValid(companyId)) throw new Error("INVALID_COMPANY_ID");
      query.$or = [
        { audience: "ALL_COMPANIES" },
        { targetCompanyIds: new Types.ObjectId(companyId) }
      ];
    }

    const rows = await PlatformAnnouncement.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit + 1)
      .select("_id title message audience targetCompanyIds status createdAt updatedAt publishedAt")
      .lean();

    const hasNext = rows.length > limit;
    const items = hasNext ? rows.slice(0, limit) : rows;
    return jsonOk({ items: await serialize(items), page, limit, hasNext });
  } catch (error) {
    const code = error instanceof Error ? error.message : "ANNOUNCEMENT_LIST_FAILED";
    return jsonError(code, errorStatus(code));
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requirePlatformAdmin();
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const content = validateAnnouncementContent(body?.title, body?.message);
    const targetIds = validateAnnouncementAudience(body?.audience, body?.targetCompanyIds);
    const audience = body?.audience as string;
    const status = validateAnnouncementStatus(body?.status ?? "DRAFT");
    await validateTargets(targetIds);

    const item = await PlatformAnnouncement.create({
      ...content,
      audience,
      targetCompanyIds: targetIds.map((id) => new Types.ObjectId(id)),
      status,
      createdByUserId: new Types.ObjectId(session.userId),
      updatedByUserId: new Types.ObjectId(session.userId),
      ...(status === "PUBLISHED" ? { publishedAt: new Date() } : {})
    });

    await PlatformAuditEvent.create({
      actorUserId: new Types.ObjectId(session.userId),
      entityType: "PLATFORM_ANNOUNCEMENT",
      entityId: item._id,
      action: "CREATE",
      details: {
        audience,
        targetCompanyIds: targetIds,
        status
      }
    });

    return jsonOk((await serialize([item.toObject()]))[0], 201);
  } catch (error) {
    const code = error instanceof Error ? error.message : "ANNOUNCEMENT_CREATE_FAILED";
    return jsonError(code, errorStatus(code));
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requirePlatformAdmin();
    const id = new URL(request.url).searchParams.get("id") ?? "";
    if (!Types.ObjectId.isValid(id)) return jsonError("INVALID_ANNOUNCEMENT_ID", 400);

    const item = await PlatformAnnouncement.findById(id);
    if (!item) return jsonError("ANNOUNCEMENT_NOT_FOUND", 404);

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const before = {
      title: item.title,
      message: item.message,
      audience: item.audience,
      targetCompanyIds: (item.targetCompanyIds ?? []).map(String),
      status: item.status
    };

    if (body && ("title" in body || "message" in body)) {
      const content = validateAnnouncementContent(
        "title" in body ? body.title : item.title,
        "message" in body ? body.message : item.message
      );
      item.title = content.title;
      item.message = content.message;
    }

    if (body && ("audience" in body || "targetCompanyIds" in body)) {
      const nextAudience = "audience" in body ? body.audience : item.audience;
      const nextTargets = validateAnnouncementAudience(
        nextAudience,
        "targetCompanyIds" in body
          ? body.targetCompanyIds
          : (item.targetCompanyIds ?? []).map(String)
      );
      await validateTargets(nextTargets);
      item.audience = nextAudience as typeof item.audience;
      item.targetCompanyIds = nextTargets.map((value) => new Types.ObjectId(value));
    }

    if (body && "status" in body) {
      const nextStatus = validateAnnouncementStatus(body.status);
      item.status = nextStatus;
      item.publishedAt = nextStatus === "PUBLISHED" ? (item.publishedAt ?? new Date()) : undefined;
    }

    item.updatedByUserId = new Types.ObjectId(session.userId);
    await item.save();

    const after = {
      title: item.title,
      message: item.message,
      audience: item.audience,
      targetCompanyIds: (item.targetCompanyIds ?? []).map(String),
      status: item.status
    };

    if (JSON.stringify(before) !== JSON.stringify(after)) {
      await PlatformAuditEvent.create({
        actorUserId: new Types.ObjectId(session.userId),
        entityType: "PLATFORM_ANNOUNCEMENT",
        entityId: item._id,
        action: before.status !== after.status
          ? (after.status === "PUBLISHED" ? "PUBLISH" : "UNPUBLISH")
          : "UPDATE",
        details: { before, after }
      });
    }

    return jsonOk((await serialize([item.toObject()]))[0]);
  } catch (error) {
    const code = error instanceof Error ? error.message : "ANNOUNCEMENT_UPDATE_FAILED";
    return jsonError(code, errorStatus(code));
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requirePlatformAdmin();
    const id = new URL(request.url).searchParams.get("id") ?? "";
    if (!Types.ObjectId.isValid(id)) return jsonError("INVALID_ANNOUNCEMENT_ID", 400);

    const item = await PlatformAnnouncement.findById(id).lean();
    if (!item) return jsonError("ANNOUNCEMENT_NOT_FOUND", 404);

    await PlatformAnnouncement.deleteOne({ _id: item._id });

    await PlatformAuditEvent.create({
      actorUserId: new Types.ObjectId(session.userId),
      entityType: "PLATFORM_ANNOUNCEMENT",
      entityId: item._id,
      action: "DELETE",
      details: {
        audience: item.audience,
        targetCompanyIds: (item.targetCompanyIds ?? []).map(String),
        status: item.status
      }
    });

    return jsonOk({ id, deleted: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "ANNOUNCEMENT_DELETE_FAILED";
    return jsonError(code, errorStatus(code));
  }
}
