import { Types } from "mongoose";
import { Feedback } from "@/models/feedback";
import { PlatformAuditEvent } from "@/models/platform-audit-event";
import { Company } from "@/models/company";
import { User } from "@/models/user";
import { BookingRequest } from "@/models/booking-request";
import { requirePlatformAdmin } from "@/lib/admin";
import { assertSameOrigin } from "@/lib/security";
import { jsonError, jsonOk } from "@/lib/http";
import {
  FEEDBACK_REVIEW_STATUSES,
  FEEDBACK_SOURCES,
  isValidFeedbackStatusTransition
} from "@/lib/platform-communication";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseDay(value: string | null, end = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + "T00:00:00.000Z");
  if (Number.isNaN(date.getTime())) return null;
  if (end) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function statusFor(code: string) {
  if (code === "UNAUTHENTICATED") return 401;
  if (code === "FORBIDDEN" || code === "CSRF_ORIGIN_INVALID") return 403;
  if (code === "FEEDBACK_NOT_FOUND" || code === "COMPANY_NOT_FOUND") return 404;
  return 400;
}

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin();
    const url = new URL(request.url);
    const rawPage = Number(url.searchParams.get("page") ?? "1");
    const rawLimit = Number(url.searchParams.get("limit") ?? "25");
    const page = Number.isFinite(rawPage) ? Math.min(1000, Math.max(1, Math.floor(rawPage))) : 1;
    const limit = Number.isFinite(rawLimit) ? Math.min(50, Math.max(1, Math.floor(rawLimit))) : 25;

    const source = url.searchParams.get("source") ?? "";
    const ratingValue = url.searchParams.get("rating") ?? "";
    const reviewStatus = url.searchParams.get("reviewStatus") ?? "";
    const companyId = url.searchParams.get("companyId") ?? "";
    const from = parseDay(url.searchParams.get("from"));
    const to = parseDay(url.searchParams.get("to"), true);

    const query: Record<string, unknown> = {};

    if (source) {
      if (!FEEDBACK_SOURCES.includes(source as typeof FEEDBACK_SOURCES[number])) {
        throw new Error("INVALID_FEEDBACK_SOURCE");
      }
      query.source = source;
    }

    if (ratingValue) {
      const rating = Number(ratingValue);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        throw new Error("INVALID_FEEDBACK_RATING_FILTER");
      }
      query.rating = rating;
    }

    if (reviewStatus) {
      if (!FEEDBACK_REVIEW_STATUSES.includes(reviewStatus as typeof FEEDBACK_REVIEW_STATUSES[number])) {
        throw new Error("INVALID_FEEDBACK_STATUS");
      }
      query.reviewStatus = reviewStatus;
    }

    if (companyId) {
      if (!Types.ObjectId.isValid(companyId)) throw new Error("INVALID_COMPANY_ID");
      const exists = await Company.exists({ _id: new Types.ObjectId(companyId) });
      if (!exists) throw new Error("COMPANY_NOT_FOUND");
      query.companyId = new Types.ObjectId(companyId);
    }

    if (url.searchParams.has("from") && !from) throw new Error("INVALID_FEEDBACK_DATE");
    if (url.searchParams.has("to") && !to) throw new Error("INVALID_FEEDBACK_DATE");

    if (from || to) {
      query.createdAt = {
        ...(from ? { $gte: from } : {}),
        ...(to ? { $lt: to } : {})
      };
    }

    const raw = await Feedback.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit + 1)
      .select("_id source companyId submitterUserId submitterName bookingRequestId rating description reviewStatus createdAt")
      .lean();

    const hasNext = raw.length > limit;
    const items = raw.slice(0, limit);

    const companyIds = [...new Set(items.map((item) => String(item.companyId)))];
    const submitterIds = [...new Set(items.map((item) => item.submitterUserId ? String(item.submitterUserId) : "").filter(Boolean))];
    const bookingIds = [...new Set(
      items.flatMap((item) => item.bookingRequestId ? [String(item.bookingRequestId)] : [])
    )];

    const [companies, submitters, bookings] = await Promise.all([
      companyIds.length
        ? Company.find({ _id: { $in: companyIds } }).select("_id name slug").limit(50).lean()
        : [],
      submitterIds.length
        ? User.find({ _id: { $in: submitterIds } }).select("_id name").limit(50).lean()
        : [],
      bookingIds.length
        ? BookingRequest.find({ _id: { $in: bookingIds } })
            .select("_id requestedStartAt")
            .limit(50)
            .lean()
        : []
    ]);

    const companyMap = new Map(
      companies.map((item) => [
        String(item._id),
        { id: String(item._id), name: item.name, slug: item.slug }
      ])
    );
    const submitterMap = new Map(
      submitters.map((item) => [String(item._id), { name: item.name }])
    );
    const bookingMap = new Map(bookings.map((item) => [String(item._id), item]));

    return jsonOk({
      items: items.map((item) => ({
        id: String(item._id),
        source: item.source,
        company: companyMap.get(String(item.companyId)) ?? null,
        rating: item.rating,
        description: item.description,
        createdAt: item.createdAt,
        reviewStatus: item.reviewStatus,
        submitter: item.submitterName
          ? { name: item.submitterName }
          : submitterMap.get(String(item.submitterUserId)) ?? null,
        booking: item.bookingRequestId
          ? {
              id: String(item.bookingRequestId),
              startAt: bookingMap.get(String(item.bookingRequestId))?.requestedStartAt ?? null
            }
          : null
      })),
      page,
      limit,
      hasNext
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "FEEDBACK_LIST_FAILED";
    return jsonError(code, statusFor(code));
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requirePlatformAdmin();
    const id = new URL(request.url).searchParams.get("id") ?? "";
    if (!Types.ObjectId.isValid(id)) return jsonError("INVALID_FEEDBACK_ID", 400);

    const item = await Feedback.findById(id);
    if (!item) return jsonError("FEEDBACK_NOT_FOUND", 404);

    const body = await request.json().catch(() => null) as { reviewStatus?: string } | null;
    if (!body?.reviewStatus) return jsonError("INVALID_FEEDBACK_STATUS", 400);

    const current = item.reviewStatus as "NEW" | "REVIEWED" | "RESOLVED";
    if (!isValidFeedbackStatusTransition(current, body.reviewStatus)) {
      return jsonError("INVALID_FEEDBACK_STATUS_TRANSITION", 400);
    }

    item.reviewStatus = body.reviewStatus;
    item.reviewStatusChangedAt = new Date();
    item.reviewStatusChangedByUserId = new Types.ObjectId(session.userId);
    await item.save();

    await PlatformAuditEvent.create({
      actorUserId: new Types.ObjectId(session.userId),
      entityType: "FEEDBACK",
      entityId: item._id,
      action: "REVIEW_STATUS_CHANGE",
      details: {
        source: item.source,
        companyId: String(item.companyId),
        fromStatus: current,
        toStatus: item.reviewStatus
      }
    });

    return jsonOk({
      id,
      reviewStatus: item.reviewStatus,
      changedAt: item.reviewStatusChangedAt
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "FEEDBACK_STATUS_UPDATE_FAILED";
    return jsonError(code, statusFor(code));
  }
}
