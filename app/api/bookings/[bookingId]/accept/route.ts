import { getMongo } from "@/lib/mongodb";
import { BookingRequest } from "@/models/booking-request";
import { Meeting } from "@/models/meeting";
import { Subscription } from "@/models/subscription";
import { getSession } from "@/lib/session";
import { withRedisLock } from "@/lib/redis-lock";
import { eligibleEmployees } from "@/lib/routing";
import { getCompanyEntitlements } from "@/lib/plans-server";
import { createMeetingForBooking } from "@/lib/meeting-service";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const session = await getSession();
  if (!session || !session.companyId) return jsonError("UNAUTHENTICATED", 401);
  if (!["EMPLOYEE", "COMPANY_OWNER", "COMPANY_ADMIN"].includes(session.role)) return jsonError("FORBIDDEN", 403);

  await getMongo();
  const { bookingId } = await params;

  try {
    const result = await withRedisLock(`booking:accept:${bookingId}`, 10_000, async () => {
      const booking = await BookingRequest.findOneAndUpdate(
        {
          _id: bookingId,
          companyId: session.companyId,
          status: "REQUESTED",
          expiresAt: { $gt: new Date() },
          assignedEmployeeId: { $exists: false },
          declinedBy: { $ne: session.userId }
        },
        { $set: { assignedEmployeeId: session.userId, status: "ASSIGNED", acceptedAt: new Date() } },
        { new: true }
      );

      if (!booking) {
        const current = await BookingRequest.findById(bookingId).lean();
        if (current?.status === "CONFIRMED") {
          const meeting = await Meeting.findOne({ bookingRequestId: bookingId }).lean();
          return { bookingId, status: current.status, meetingUri: meeting?.googleMeetingUri ?? null };
        }
        throw new Error("BOOKING_NO_LONGER_AVAILABLE");
      }

      const plan = await getCompanyEntitlements(session.companyId!);
      if (booking.requestedDurationMinutes > plan.maxMeetingDurationMinutes) throw new Error("MEETING_DURATION_LIMIT");

      const employeeEligible = await eligibleEmployees(
        session.companyId!,
        booking.requestedStartAt,
        booking.requestedEndAt,
        booking.declinedBy?.map(String) ?? []
      );
      if (!employeeEligible.includes(session.userId)) throw new Error("EMPLOYEE_NOT_AVAILABLE");

      const concurrent = await Meeting.countDocuments({
        companyId: session.companyId,
        status: { $in: ["CREATING", "READY", "LIVE"] },
        startAt: { $lt: booking.requestedEndAt },
        endAt: { $gt: booking.requestedStartAt }
      });
      if (concurrent >= plan.maxConcurrentMeetings) throw new Error("CONCURRENT_MEETING_LIMIT");

      const usage = await Subscription.findOneAndUpdate(
        { companyId: session.companyId, status: "ACTIVE", monthlyMeetingsUsed: { $lt: plan.monthlyMeetingLimit } },
        { $inc: { monthlyMeetingsUsed: 1 } },
        { new: true }
      );
      if (!usage) throw new Error("MONTHLY_MEETING_LIMIT");

      try {
        const meeting = await createMeetingForBooking(String(booking._id));
        return { bookingId: String(booking._id), status: "CONFIRMED", meetingUri: meeting.googleMeetingUri ?? null };
      } catch (error) {
        await Subscription.updateOne({ companyId: session.companyId, monthlyMeetingsUsed: { $gt: 0 } }, { $inc: { monthlyMeetingsUsed: -1 } });
        throw error;
      }
    });

    return jsonOk(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "BOOKING_ACCEPT_FAILED";
    const status = ["BOOKING_NO_LONGER_AVAILABLE", "MEETING_DURATION_LIMIT", "EMPLOYEE_NOT_AVAILABLE", "CONCURRENT_MEETING_LIMIT", "MONTHLY_MEETING_LIMIT", "RESOURCE_BUSY"].includes(code) ? 409 : 500;
    return jsonError(code, status);
  }
}