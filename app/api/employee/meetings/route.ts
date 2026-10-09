import { getMongo } from "@/lib/mongodb";
import { Meeting } from "@/models/meeting";
import { User } from "@/models/user";
import { requireCompanyMember } from "@/lib/authz";
import { jsonError, jsonOk } from "@/lib/http";
import { encodeHistoryCursor, decodeHistoryCursor } from "@/lib/history-cursor";
import { Types } from "mongoose";
import { Workspace } from "@/models/workspace";
import { nextDateIso, zonedDateTimeToUtc } from "@/lib/timezone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedLimit = Number(searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(100, Math.max(1, Math.floor(requestedLimit)))
    : 50;
  const paginated = searchParams.get("paginated") === "true";
  const requestedDate = searchParams.get("date");
  const cursorValue = searchParams.get("cursor");
  const cursor = paginated ? decodeHistoryCursor(cursorValue) : null;

  if (
    paginated &&
    cursorValue &&
    (!cursor || !Types.ObjectId.isValid(cursor.id))
  ) {
    return jsonError("INVALID_HISTORY_CURSOR", 400);
  }

  let session: { userId: string; companyId?: string; role: string };
  try {
    const result = await requireCompanyMember([
      "EMPLOYEE",
      "COMPANY_OWNER",
      "COMPANY_ADMIN"
    ]);
    session = result.session;
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNAUTHENTICATED";
    return jsonError(code, code === "UNAUTHENTICATED" ? 401 : 403);
  }

  if (!session.companyId) return jsonError("COMPANY_NOT_CONFIGURED", 403);

  await getMongo();

  let dateRange: { startAt: Date; endAt: Date } | null = null;
  if (requestedDate) {
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(requestedDate)) {
      return jsonError("INVALID_HISTORY_DATE", 400);
    }
    try {
      const workspace = await Workspace.findOne({
        companyId: session.companyId,
        active: true
      }).select("timezone").lean();
      const timezone = workspace?.timezone || "Asia/Kolkata";
      const startAt = zonedDateTimeToUtc(requestedDate, 0, timezone);
      const endAt = zonedDateTimeToUtc(nextDateIso(requestedDate), 0, timezone);
      if (startAt >= endAt) return jsonError("INVALID_HISTORY_DATE", 400);
      dateRange = { startAt, endAt };
    } catch {
      return jsonError("INVALID_HISTORY_DATE", 400);
    }
  }

  const filter: Record<string, unknown> = {
    companyId: session.companyId,
    $or: [
      { status: { $in: ["COMPLETED", "CANCELLED"] } },
      { status: { $in: ["READY", "LIVE"] }, endAt: { $lte: new Date() } }
    ]
  };
  if (dateRange) filter.startAt = { $gte: dateRange.startAt, $lt: dateRange.endAt };

  if (session.role === "EMPLOYEE") {
    filter.employeeId = session.userId;
  }

  const totalCount = paginated ? await Meeting.countDocuments(filter) : undefined;

  if (paginated && cursor) {
    filter.$and = [
      {
        $or: [
          { startAt: { $lt: cursor.at } },
          { startAt: cursor.at, _id: { $lt: new Types.ObjectId(cursor.id) } }
        ]
      }
    ];
  }

  const meetings = await Meeting.find(filter)
    .sort({ startAt: -1, _id: -1 })
    .limit(paginated ? limit + 1 : limit)
    .select(
      "_id bookingRequestId employeeId customerId startAt endAt endedAt status calendarSyncStatus"
    )
    .lean();

  const hasMore = paginated && meetings.length > limit;
  const page = hasMore ? meetings.slice(0, limit) : meetings;

  const participantIds = page.flatMap((meeting) => [
    meeting.employeeId,
    meeting.customerId
  ]);

  const participants = await User.find({
    _id: { $in: participantIds }
  })
    .select("name email image")
    .lean();

  const participantMap = new Map(
    participants.map((participant) => [
      String(participant._id),
      {
        name: participant.name,
        email: participant.email,
        image: participant.image ?? null
      }
    ])
  );

  const items = page.map((meeting) => {
    const durationMinutes = Math.max(
      1,
      Math.round((meeting.endAt.getTime() - meeting.startAt.getTime()) / 60000)
    );

    return {
      id: String(meeting._id),
      bookingRequestId: String(meeting.bookingRequestId),
      startAt: meeting.startAt,
      endAt: meeting.endAt,
      endedAt: meeting.endedAt ?? meeting.endAt,
      durationMinutes,
      status: meeting.status,
      calendarSyncStatus: meeting.calendarSyncStatus,
      employee: participantMap.get(String(meeting.employeeId)) ?? null,
      customer: participantMap.get(String(meeting.customerId)) ?? null,
      scheduledBy: participantMap.get(String(meeting.customerId)) ?? null
    };
  });

  if (!paginated) return jsonOk(items);

  return jsonOk({
    items,
    totalCount,
    nextCursor:
      hasMore && page.length > 0
        ? encodeHistoryCursor(
            page[page.length - 1].startAt,
            String(page[page.length - 1]._id)
          )
        : null
  });
}
