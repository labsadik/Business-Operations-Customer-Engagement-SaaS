import { getMongo } from "@/lib/mongodb";
import { BookingRequest } from "@/models/booking-request";
import { Meeting } from "@/models/meeting";
import { Membership } from "@/models/membership";
import { getSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/http";
import { createMeetingAccessToken } from "@/lib/security";

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
  const booking = await BookingRequest.findById(bookingId).lean();
  if (!booking) return jsonError("BOOKING_NOT_FOUND", 404);

  const companyMatch = Boolean(session.companyId && String(booking.companyId) === session.companyId);
  let companyRole = false;
  let activeCompanyMember = false;

  if (companyMatch && session.role !== "CUSTOMER" && session.role !== "PLATFORM_ADMIN") {
    const membership = await Membership.findOne({
      companyId: booking.companyId,
      userId: session.userId,
      active: true
    }).lean();
    activeCompanyMember = Boolean(membership);
    if (!activeCompanyMember) return jsonError("FORBIDDEN", 403);
    companyRole = true;
  }

  const customerParticipant = String(booking.customerId) === session.userId;
  const employeeParticipant =
    String(booking.assignedEmployeeId || "") === session.userId &&
    activeCompanyMember;
  const participantMatch = customerParticipant || employeeParticipant;

  if (!companyMatch && !participantMatch) return jsonError("FORBIDDEN", 403);

  if (
    booking.expiresAt.getTime() <= Date.now() &&
    ["REQUESTED", "ASSIGNED", "CREATING_MEETING", "RETRYING"].includes(booking.status)
  ) {
    await BookingRequest.updateOne(
      { _id: booking._id, status: booking.status },
      { $set: { status: "EXPIRED", assignedEmployeeId: null, nextRetryAt: null } }
    );
    booking.status = "EXPIRED";
    booking.assignedEmployeeId = undefined;
  }

  const meeting = await Meeting.findOne({ bookingRequestId: booking._id }).lean();

  const meetingReady = meeting?.status === "READY";
  const meetingTokenExpiry = meeting
    ? new Date(Math.max(Date.now() + 60 * 60 * 1000, meeting.endAt.getTime() + 24 * 60 * 60 * 1000))
    : undefined;
  const meetingJoinToken = meetingReady
    ? createMeetingAccessToken(String(meeting!._id), meetingTokenExpiry)
    : null;

  return jsonOk({
    booking: {
      id: String(booking._id),
      companyId: String(booking.companyId),
      customerId: String(booking.customerId),
      assignedEmployeeId: booking.assignedEmployeeId ? String(booking.assignedEmployeeId) : null,
      status: booking.status,
      startAt: booking.requestedStartAt,
      endAt: booking.requestedEndAt,
      durationMinutes: booking.requestedDurationMinutes,
      expiresAt: booking.expiresAt
    },
    meeting: meeting ? {
      status: meeting.status,
      meetingUri: meeting.googleMeetingUri ?? null,
      joinToken: meetingJoinToken
    } : null,
    canManage: companyRole
  });
}