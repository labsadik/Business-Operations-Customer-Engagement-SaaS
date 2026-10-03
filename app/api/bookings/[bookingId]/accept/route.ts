import { getMongo } from "@/lib/mongodb";
import { BookingRequest } from "@/models/booking-request";
import { Meeting } from "@/models/meeting";
import { Subscription } from "@/models/subscription";
import { requireCompanyMember } from "@/lib/authz";
import { withRedisLock } from "@/lib/redis-lock";
import { eligibleEmployees } from "@/lib/routing";
import { getCompanyEntitlements } from "@/lib/plans-server";
import { createMeetingForBooking } from "@/lib/meeting-service";
import { jsonError, jsonOk } from "@/lib/http";
import { after } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  let session: { userId: string; companyId?: string };
  try {
    const result = await requireCompanyMember(["EMPLOYEE", "COMPANY_OWNER", "COMPANY_ADMIN"]);
    session = result.session;
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNAUTHENTICATED";
    return jsonError(code, code === "UNAUTHENTICATED" ? 401 : 403);
  }
  if (!session.companyId) return jsonError("COMPANY_NOT_CONFIGURED", 403);

  await getMongo();
  const { bookingId } = await params;

  try {
    const result = await withRedisLock(`booking:accept:${bookingId}`, 10_000, async () => {
      const booking = await BookingRequest.findOneAndUpdate(
        {
          _id: bookingId,
          companyId: session.companyId,
          status: { $in: ["REQUESTED", "RETRYING"] },
          expiresAt: { $gt: new Date() },
          $or: [
            { assignedEmployeeId: { $exists: false } },
            { assignedEmployeeId: null },
            { assignedEmployeeId: session.userId }
          ],
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
        if (
          current &&
          ["ASSIGNED", "CREATING_MEETING"].includes(current.status) &&
          String(current.assignedEmployeeId || "") === session.userId
        ) {
          const meeting = await Meeting.findOne({ bookingRequestId: bookingId }).lean();
          return {
            bookingId,
            status: current.status,
            meetingUri: meeting?.googleMeetingUri ?? null
          };
        }
        throw new Error("BOOKING_NO_LONGER_AVAILABLE");
      }

      try {
        const plan = await getCompanyEntitlements(session.companyId!);
        if (booking.requestedDurationMinutes > plan.maxMeetingDurationMinutes) throw new Error("MEETING_DURATION_LIMIT");

        const employeeEligible = await eligibleEmployees(
          session.companyId!,
          booking.requestedStartAt,
          booking.requestedEndAt,
          booking.declinedBy?.map(String) ?? []
        );
        if (!employeeEligible.includes(session.userId)) {
          await BookingRequest.updateOne(
            { _id: booking._id, status: "ASSIGNED", assignedEmployeeId: session.userId },
            {
              $set: {
                status: "RETRYING",
                assignedEmployeeId: null,
                nextRetryAt: new Date(Date.now() + 20_000)
              }
            }
          );
          throw new Error("EMPLOYEE_NOT_AVAILABLE");
        }

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

        const acceptedBookingId = String(booking._id);
        const acceptedCompanyId = session.companyId!;

        after(async () => {
          let lastError: unknown = null;

          for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
              await withRedisLock(
                `meeting:finalize:${acceptedBookingId}`,
                60_000,
                async () => {
                  await createMeetingForBooking(acceptedBookingId);
                }
              );
              return;
            } catch (error) {
              lastError = error;
              const code = error instanceof Error ? error.message : "MEETING_CREATION_FAILED";
              if (code !== "GOOGLE_MEET_PENDING" || attempt === 2) break;
              await new Promise((resolve) => setTimeout(resolve, 1500));
            }
          }

          const current = await BookingRequest.findById(acceptedBookingId).lean();
          const meeting = await Meeting.findOne({ bookingRequestId: acceptedBookingId }).lean();
          if (meeting?.status === "READY" || current?.status === "CONFIRMED") return;

          if (current?.status === "CREATING_MEETING" || current?.status === "RETRYING") {
            const stillActive = current.expiresAt.getTime() > Date.now();
            await BookingRequest.updateOne(
              {
                _id: acceptedBookingId,
                status: { $in: ["CREATING_MEETING", "RETRYING"] }
              },
              {
                $set: {
                  status: stillActive ? "RETRYING" : "EXPIRED",
                  assignedEmployeeId: null,
                  nextRetryAt: stillActive ? new Date(Date.now() + 20_000) : null
                }
              }
            );
          }

          await Subscription.updateOne(
            { companyId: acceptedCompanyId, monthlyMeetingsUsed: { $gt: 0 } },
            { $inc: { monthlyMeetingsUsed: -1 } }
          );

          if (lastError) {
            void lastError;
          }
        });

        return { bookingId: acceptedBookingId, status: "CREATING_MEETING", meetingUri: null };
      } catch (error) {
        const stillActive = booking.expiresAt.getTime() > Date.now();
        const current = await BookingRequest.findById(booking._id).lean();
        if (current?.status === "ASSIGNED" && String(current.assignedEmployeeId) === session.userId) {
          await BookingRequest.updateOne(
            { _id: booking._id, status: "ASSIGNED", assignedEmployeeId: session.userId },
            {
              $set: {
                status: stillActive ? "RETRYING" : "EXPIRED",
                assignedEmployeeId: null,
                nextRetryAt: stillActive ? new Date(Date.now() + 20_000) : null
              }
            }
          );
        }
        throw error;
      }
    });

    return jsonOk(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "BOOKING_ACCEPT_FAILED";
    const status = [
      "BOOKING_NO_LONGER_AVAILABLE",
      "MEETING_DURATION_LIMIT",
      "EMPLOYEE_NOT_AVAILABLE",
      "CONCURRENT_MEETING_LIMIT",
      "MONTHLY_MEETING_LIMIT",
      "RESOURCE_BUSY"
    ].includes(code)
      ? 409
      : code.startsWith("GOOGLE_API_") || code.startsWith("GOOGLE_")
        ? 502
        : 500;
    return jsonError(code, status);
  }
}