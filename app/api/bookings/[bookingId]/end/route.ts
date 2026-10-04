import { getMongo } from "@/lib/mongodb";
import { BookingRequest } from "@/models/booking-request";
import { Meeting } from "@/models/meeting";
import { requireCompanyMember } from "@/lib/authz";
import { deleteCalendarEvent } from "@/lib/google-calendar";
import { withRedisLock } from "@/lib/redis-lock";
import { jsonError, jsonOk } from "@/lib/http";
import { recordBookingActivity } from "@/lib/booking-history";
import { assertSameOrigin } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  try {
    assertSameOrigin(request);
  } catch {
    return jsonError("CSRF_ORIGIN_INVALID", 403);
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
  const { bookingId } = await params;

  try {
    const result = await withRedisLock(
      `meeting:end:${session.companyId}:${bookingId}`,
      10_000,
      async () => {
        const db = await getMongo();
        const tx = await db.startSession();
        let calendarEventId: string | null = null;
        let employeeId: string | null = null;

        try {
          let result;
          await tx.withTransaction(async () => {
            const meeting = await Meeting.findOne({
              bookingRequestId: bookingId,
              companyId: session.companyId
            }).session(tx);

            if (!meeting) throw new Error("MEETING_NOT_FOUND");
            if (["COMPLETED", "CANCELLED", "FAILED"].includes(meeting.status)) {
              throw new Error("MEETING_ALREADY_ENDED");
            }
            if (!["READY", "LIVE"].includes(meeting.status)) {
              throw new Error("MEETING_NOT_READY");
            }

            const isAssignedEmployee = String(meeting.employeeId) === session.userId;
            const isManager = [
              "COMPANY_OWNER",
              "COMPANY_ADMIN",
              "PLATFORM_ADMIN"
            ].includes(session.role);
            if (!isAssignedEmployee && !isManager) throw new Error("FORBIDDEN");

            const booking = await BookingRequest.findOne({
              _id: bookingId,
              companyId: session.companyId,
              status: { $in: ["CONFIRMED", "IN_PROGRESS"] }
            }).session(tx);

            if (!booking) throw new Error("BOOKING_NOT_ACTIVE");

            const previousStatus = booking.status;
            const endedAt = new Date();

            meeting.status = "COMPLETED";
            meeting.endedAt = endedAt;
            meeting.endedByUserId = session.userId;
            meeting.endReason = "MANUAL";
            await meeting.save({ session: tx });

            booking.status = "COMPLETED";
            await booking.save({ session: tx });

            await recordBookingActivity({
              companyId: session.companyId!,
              bookingRequestId: bookingId,
              eventType: "MEETING_COMPLETED",
              fromStatus: previousStatus,
              toStatus: "COMPLETED",
              outcome: "COMPLETED",
              actorId: session.userId,
              actorRole: session.role,
              employeeId: String(meeting.employeeId),
              occurredAt: endedAt,
              session: tx
            });

            calendarEventId = meeting.googleCalendarEventId ?? null;
            employeeId = String(meeting.employeeId);

            result = {
              bookingId,
              status: "COMPLETED",
              calendarEventRemoved: true
            };
          });

          return result;
        } finally {
          await tx.endSession();
        }

        // unreachable
      }
    );

    if (calendarEventId && employeeId) {
      try {
        await deleteCalendarEvent(employeeId, calendarEventId);
      } catch {
        await Meeting.updateOne(
          { bookingRequestId: bookingId, companyId: session.companyId, status: "COMPLETED" },
          { $set: { calendarSyncStatus: "FAILED" } }
        );
        result.calendarEventRemoved = false;
      }
    }

    return jsonOk(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "MEETING_END_FAILED";
    const status =
      code === "MEETING_NOT_FOUND" ? 404 :
      ["FORBIDDEN", "MEETING_ALREADY_ENDED", "MEETING_NOT_READY", "BOOKING_NOT_ACTIVE"].includes(code)
        ? 409
        : 500;
    return jsonError(code, status);
  }
}
