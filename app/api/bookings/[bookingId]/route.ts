import { getMongo } from "@/lib/mongodb";
import { BookingRequest } from "@/models/booking-request";
import { Meeting } from "@/models/meeting";
import { Membership } from "@/models/membership";
import { getSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/http";

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

  const companyMatch = session.companyId && String(booking.companyId) === session.companyId;
  const participantMatch = String(booking.customerId) === session.userId || String(booking.assignedEmployeeId || "") === session.userId;
  if (!companyMatch && !participantMatch) return jsonError("FORBIDDEN", 403);

  const meeting = await Meeting.findOne({ bookingRequestId: booking._id }).lean();

  let companyRole = false;
  if (session.companyId) {
    const membership = await Membership.findOne({ companyId: booking.companyId, userId: session.userId, active: true }).lean();
    companyRole = Boolean(membership);
  }

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
      id: String(meeting._id),
      status: meeting.status,
      meetingUri: meeting.googleMeetingUri ?? null,
      calendarEventId: meeting.googleCalendarEventId ?? null
    } : null,
    canManage: companyRole || ["EMPLOYEE", "COMPANY_OWNER", "COMPANY_ADMIN"].includes(session.role)
  });
}