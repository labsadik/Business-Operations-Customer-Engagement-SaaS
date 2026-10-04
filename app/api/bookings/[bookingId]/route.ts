import { getMongo } from "@/lib/mongodb";
import { BookingRequest } from "@/models/booking-request";
import { Meeting } from "@/models/meeting";
import { Membership } from "@/models/membership";
import { getSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/http";
import { recordBookingActivity, releaseMeetingUsage } from "@/lib/booking-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const session = await getSession();
  if (!session) return jsonError("UNAUTHENTICATED", 401);

  await getMongo();
  const { bookingId } = await params;

  const booking = await BookingRequest.findOne(
    session.role === "CUSTOMER" || !session.companyId
      ? { _id: bookingId }
      : { _id: bookingId, companyId: session.companyId }
  ).lean();

  if (!booking) return jsonError("BOOKING_NOT_FOUND", 404);

  const companyMatch = Boolean(
    session.companyId && String(booking.companyId) === session.companyId
  );
  let companyRole = false;
  let activeCompanyMember = false;

  if (companyMatch && session.role !== "CUSTOMER") {
    const isManager = ["COMPANY_OWNER", "COMPANY_ADMIN", "PLATFORM_ADMIN"].includes(
      session.role
    );

    if (isManager) {
      if (session.role !== "PLATFORM_ADMIN") {
        const membership = await Membership.findOne({
          companyId: booking.companyId,
          userId: session.userId,
          active: true
        }).lean();
        activeCompanyMember = Boolean(membership);
        if (!activeCompanyMember) return jsonError("FORBIDDEN", 403);
      } else {
        activeCompanyMember = true;
      }
      companyRole = true;
    } else {
      const membership = await Membership.findOne({
        companyId: booking.companyId,
        userId: session.userId,
        active: true
      }).lean();
      activeCompanyMember = Boolean(membership);
      if (!activeCompanyMember) return jsonError("FORBIDDEN", 403);
    }
  }

  const customerParticipant = String(booking.customerId) === session.userId;
  const employeeParticipant =
    String(booking.assignedEmployeeId || "") === session.userId &&
    activeCompanyMember;
  const participantMatch = customerParticipant || employeeParticipant;

  if (
    !companyRole &&
    session.role !== "CUSTOMER" &&
    !participantMatch
  ) {
    return jsonError("FORBIDDEN", 403);
  }

  if (!companyMatch && !participantMatch) return jsonError("FORBIDDEN", 403);

  if (
    booking.expiresAt.getTime() <= Date.now() &&
    ["REQUESTED", "ASSIGNED", "CREATING_MEETING", "RETRYING"].includes(booking.status)
  ) {
    const db = await getMongo();
    const tx = await db.startSession();
    try {
      await tx.withTransaction(async () => {
        const before = await BookingRequest.findOne({
          _id: booking._id,
          companyId: booking.companyId,
          status: {
            $in: [
              "REQUESTED",
              "ASSIGNED",
              "CREATING_MEETING",
              "RETRYING"
            ]
          },
          expiresAt: { $lte: new Date() }
        }).session(tx);

        if (!before) return;

        await BookingRequest.updateOne(
          { _id: before._id, companyId: before.companyId, status: before.status },
          { $set: { status: "EXPIRED", assignedEmployeeId: null, nextRetryAt: null } },
          { session: tx }
        );

        await releaseMeetingUsage({
          bookingId,
          companyId: String(booking.companyId),
          session: tx
        });

        await recordBookingActivity({
          companyId: String(booking.companyId),
          bookingRequestId: bookingId,
          eventType: "REQUEST_EXPIRED",
          fromStatus: before.status,
          toStatus: "EXPIRED",
          outcome: "EXPIRED",
          actorId: session.userId,
          actorRole: session.role,
          employeeId: before.assignedEmployeeId
            ? String(before.assignedEmployeeId)
            : null,
          session: tx
        });
      });
    } finally {
      await tx.endSession();
    }

    booking.status = "EXPIRED";
    booking.assignedEmployeeId = undefined;
  }

  const meeting = await Meeting.findOne({
    bookingRequestId: booking._id,
    companyId: booking.companyId
  }).lean();

  return jsonOk({
    booking: {
      id: String(booking._id),
      companyId: String(booking.companyId),
      customerId: String(booking.customerId),
      assignedEmployeeId: booking.assignedEmployeeId
        ? String(booking.assignedEmployeeId)
        : null,
      status: booking.status,
      startAt: booking.requestedStartAt,
      endAt: booking.requestedEndAt,
      durationMinutes: booking.requestedDurationMinutes,
      expiresAt: booking.expiresAt
    },
    meeting: meeting
      ? {
          status: meeting.status,
          meetingUri: meeting.googleMeetingUri ?? null
        }
      : null,
    canManage: companyRole
  });
}
