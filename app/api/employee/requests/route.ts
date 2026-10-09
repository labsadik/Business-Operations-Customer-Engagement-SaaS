import { getMongo } from "@/lib/mongodb";
import { BookingRequest } from "@/models/booking-request";
import { BookingActivity } from "@/models/booking-activity";
import { User } from "@/models/user";
import { Meeting } from "@/models/meeting";
import { requireCompanyMember } from "@/lib/authz";
import { jsonError, jsonOk } from "@/lib/http";
import { decodeHistoryCursor, encodeHistoryCursor } from "@/lib/history-cursor";
import { Types } from "mongoose";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sessionError(error: unknown) {
  return error instanceof Error ? error.message : "UNAUTHENTICATED";
}

async function getSessionOrError() {
  try {
    return (await requireCompanyMember([
      "EMPLOYEE",
      "COMPANY_OWNER",
      "COMPANY_ADMIN"
    ])).session;
  } catch (error) {
    throw new Error(sessionError(error));
  }
}

async function historyResponse(
  request: Request,
  session: { userId: string; companyId?: string; role: string }
) {
  if (!session.companyId) return jsonError("COMPANY_NOT_CONFIGURED", 403);

  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get("limit") ?? "25");
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(100, Math.max(1, Math.floor(requestedLimit)))
    : 25;
  const cursorValue = url.searchParams.get("cursor");
  const cursor = decodeHistoryCursor(cursorValue);
  if (
    cursorValue &&
    (!cursor || !Types.ObjectId.isValid(cursor.id))
  ) {
    return jsonError("INVALID_HISTORY_CURSOR", 400);
  }

  const roleAllowsAll = ["COMPANY_OWNER", "COMPANY_ADMIN", "PLATFORM_ADMIN"].includes(
    session.role
  );

  const historyFilters: Record<string, unknown>[] = [
    { companyId: session.companyId }
  ];

  if (!roleAllowsAll) {
    historyFilters.push({
      $or: [
        { actorId: session.userId },
        { employeeId: session.userId }
      ]
    });
  }

  if (cursor) {
    historyFilters.push({
      $or: [
        { occurredAt: { $lt: cursor.at } },
        { occurredAt: cursor.at, _id: { $lt: new Types.ObjectId(cursor.id) } }
      ]
    });
  }

  const activities = await BookingActivity.find({
    $and: historyFilters
  })
    .sort({ occurredAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean();

  const hasMore = activities.length > limit;
  const page = hasMore ? activities.slice(0, limit) : activities;

  const bookingIds = page.map((item) => item.bookingRequestId);
  const bookings = await BookingRequest.find({
    _id: { $in: bookingIds },
    companyId: session.companyId
  })
    .select("_id customerId requestedStartAt requestedEndAt requestedDurationMinutes")
    .lean();

  const participantIds = new Set<string>();
  for (const item of page) {
    if (item.actorId) participantIds.add(String(item.actorId));
    if (item.employeeId) participantIds.add(String(item.employeeId));
  }
  for (const booking of bookings) participantIds.add(String(booking.customerId));

  const participants = await User.find({
    _id: { $in: [...participantIds] }
  })
    .select("name email image")
    .lean();

  const bookingMap = new Map(bookings.map((item) => [String(item._id), item]));
  const participantMap = new Map(
    participants.map((item) => [
      String(item._id),
      { name: item.name, email: item.email, image: item.image ?? null }
    ])
  );

  const items = page.map((activity) => {
    const booking = bookingMap.get(String(activity.bookingRequestId));
    return {
      id: String(activity._id),
      bookingId: String(activity.bookingRequestId),
      eventType: activity.eventType,
      fromStatus: activity.fromStatus,
      toStatus: activity.toStatus,
      outcome: activity.outcome,
      occurredAt: activity.occurredAt,
      reasonCode: activity.reasonCode ?? null,
      actor: activity.actorId
        ? {
            ...(participantMap.get(String(activity.actorId)) ?? {
              name: "System",
              email: "",
              image: null
            }),
            role: activity.actorRole ?? "SYSTEM"
          }
        : null,
      employee: activity.employeeId
        ? participantMap.get(String(activity.employeeId)) ?? null
        : null,
      customer: booking
        ? participantMap.get(String(booking.customerId)) ?? null
        : null,
      startAt: booking?.requestedStartAt ?? null,
      endAt: booking?.requestedEndAt ?? null,
      durationMinutes: booking?.requestedDurationMinutes ?? null
    };
  });

  return jsonOk({
    items,
    nextCursor:
      hasMore && page.length > 0
        ? encodeHistoryCursor(
            page[page.length - 1].occurredAt,
            String(page[page.length - 1]._id)
          )
        : null
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const isHistory = url.searchParams.get("history") === "true";

  let session: { userId: string; companyId?: string; role: string };
  try {
    session = await getSessionOrError();
  } catch (error) {
    const code = sessionError(error);
    return jsonError(code, code === "UNAUTHENTICATED" ? 401 : 403);
  }

  await getMongo();
  if (isHistory) return historyResponse(request, session);

  if (url.searchParams.get("notifications") === "true") {
    if (!session.companyId) return jsonError("COMPANY_NOT_CONFIGURED", 403);
    const cutoff = new Date(Date.now() - 10 * 60 * 1000);
    const notifications = await BookingRequest.find({
      companyId: session.companyId,
      createdAt: { $gte: cutoff },
      $or: [
        {
          status: { $in: ["REQUESTED", "RETRYING"] },
          declinedBy: { $ne: session.userId }
        },
        {
          status: { $in: ["ASSIGNED", "CREATING_MEETING"] },
          assignedEmployeeId: session.userId
        }
      ]
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(10)
      .select("_id status requestedStartAt createdAt assignedEmployeeId")
      .lean();

    return jsonOk({
      items: notifications.map((item) => ({
        id: String(item._id),
        status: item.status,
        startAt: item.requestedStartAt,
        createdAt: item.createdAt,
        assignedEmployeeId: item.assignedEmployeeId ? String(item.assignedEmployeeId) : null
      }))
    });
  }

  if (!session.companyId) return jsonError("COMPANY_NOT_CONFIGURED", 403);

  const requestedLimit = Number(url.searchParams.get("limit") ?? "100");
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(100, Math.max(1, Math.floor(requestedLimit)))
    : 100;

  const roleAllowsAllActive = [
    "COMPANY_OWNER",
    "COMPANY_ADMIN",
    "PLATFORM_ADMIN"
  ].includes(session.role);
  const now = new Date();

  const bookings = await BookingRequest.find({
    companyId: session.companyId,
    $or: [
      {
        status: { $in: ["REQUESTED", "RETRYING"] },
        expiresAt: { $gt: now },
        declinedBy: { $ne: session.userId }
      },
      {
        status: { $in: ["ASSIGNED", "CREATING_MEETING"] },
        expiresAt: { $gt: now },
        ...(roleAllowsAllActive
          ? {}
          : { assignedEmployeeId: session.userId })
      },
      {
        status: { $in: ["CONFIRMED", "IN_PROGRESS"] },
        requestedEndAt: { $gt: now },
        ...(roleAllowsAllActive
          ? {}
          : { assignedEmployeeId: session.userId })
      }
    ]
  })
    .sort({ requestedStartAt: 1, _id: 1 })
    .limit(limit)
    .lean();

  const customers = await User.find({
    _id: { $in: bookings.map((b) => b.customerId) }
  })
    .select("name email image")
    .lean();

  const meetings = await Meeting.find({
    companyId: session.companyId,
    bookingRequestId: { $in: bookings.map((b) => b._id) }
  })
    .select("_id bookingRequestId status googleMeetingUri startAt endAt")
    .lean();

  const meetingMap = new Map(
    meetings.map((meeting) => [String(meeting.bookingRequestId), meeting])
  );
  const map = new Map(customers.map((u) => [String(u._id), u]));

  return jsonOk(
    bookings.map((booking) => {
      const customer = map.get(String(booking.customerId));
      const meeting = meetingMap.get(String(booking._id));
      return {
        id: String(booking._id),
        startAt: booking.requestedStartAt,
        endAt: booking.requestedEndAt,
        durationMinutes: booking.requestedDurationMinutes,
        status: booking.status,
        assignedEmployeeId: booking.assignedEmployeeId
          ? String(booking.assignedEmployeeId)
          : null,
        expiresAt: booking.expiresAt,
        customer: customer
          ? { name: customer.name, email: customer.email, image: customer.image }
          : null,
        meeting: meeting
          ? {
              status: meeting.status,
              meetingUri: meeting.googleMeetingUri ?? null
            }
          : null
      };
    })
  );
}
