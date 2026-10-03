import { getMongo } from "@/lib/mongodb";
import { BookingRequest } from "@/models/booking-request";
import { User } from "@/models/user";
import { requireCompanyMember } from "@/lib/authz";
import { jsonError, jsonOk } from "@/lib/http";
import { Meeting } from "@/models/meeting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedLimit = Number(searchParams.get("limit") ?? "100");
  const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, Math.floor(requestedLimit))) : 100;
  let session: { userId: string; companyId?: string; role: string };
  try {
    const result = await requireCompanyMember(["EMPLOYEE", "COMPANY_OWNER", "COMPANY_ADMIN"]);
    session = result.session;
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNAUTHENTICATED";
    return jsonError(code, code === "UNAUTHENTICATED" ? 401 : 403);
  }
  if (!session.companyId) return jsonError("COMPANY_NOT_CONFIGURED", 403);

  await getMongo();
  const roleAllowsAllActive = ["COMPANY_OWNER", "COMPANY_ADMIN", "PLATFORM_ADMIN"].includes(session.role);
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
        ...(roleAllowsAllActive ? {} : { assignedEmployeeId: session.userId })
      },
      {
        status: { $in: ["CONFIRMED", "IN_PROGRESS"] },
        requestedEndAt: { $gt: now },
        ...(roleAllowsAllActive ? {} : { assignedEmployeeId: session.userId })
      }
    ]
  }).sort({ requestedStartAt: 1 }).limit(limit).lean();

  const customers = await User.find({ _id: { $in: bookings.map((b) => b.customerId) } }).select("name email image").lean();
  const meetings = await Meeting.find({
    bookingRequestId: { $in: bookings.map((b) => b._id) }
  }).select("_id bookingRequestId status googleMeetingUri startAt endAt").lean();
  const meetingMap = new Map(meetings.map((meeting) => [String(meeting.bookingRequestId), meeting]));
  const map = new Map(customers.map((u) => [String(u._id), u]));

  return jsonOk(bookings.map((booking) => {
    const customer = map.get(String(booking.customerId));
    return {
      id: String(booking._id),
      startAt: booking.requestedStartAt,
      endAt: booking.requestedEndAt,
      durationMinutes: booking.requestedDurationMinutes,
      status: booking.status,
      assignedEmployeeId: booking.assignedEmployeeId ? String(booking.assignedEmployeeId) : null,
      expiresAt: booking.expiresAt,
      customer: customer ? { name: customer.name, email: customer.email, image: customer.image } : null,
      meeting: (() => {
        const meeting = meetingMap.get(String(booking._id));
        if (!meeting) return null;
        return {
          status: meeting.status,
          meetingUri: meeting.googleMeetingUri ?? null
        };
      })()
    };
  }));
}