import { getMongo } from "@/lib/mongodb";
import { BookingRequest } from "@/models/booking-request";
import { Meeting } from "@/models/meeting";
import { requireCompanyMember } from "@/lib/authz";
import { deleteCalendarEvent } from "@/lib/google-calendar";
import { withRedisLock } from "@/lib/redis-lock";
import { jsonError, jsonOk } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  try {
    assertSameOrigin(_request);
  } catch {
    return jsonError("CSRF_ORIGIN_INVALID", 403);
  }

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
  const { bookingId } = await params;

  try {
    const result = await withRedisLock("meeting:end:" + bookingId, 10_000, async () => {
      const meeting = await Meeting.findOne({
        bookingRequestId: bookingId,
        companyId: session.companyId
      });

      if (!meeting) throw new Error("MEETING_NOT_FOUND");
      if (["COMPLETED", "CANCELLED", "FAILED"].includes(meeting.status)) {
        throw new Error("MEETING_ALREADY_ENDED");
      }
      if (!["READY", "LIVE"].includes(meeting.status)) {
        throw new Error("MEETING_NOT_READY");
      }

      const isAssignedEmployee = String(meeting.employeeId) === session.userId;
      const isManager = ["COMPANY_OWNER", "COMPANY_ADMIN", "PLATFORM_ADMIN"].includes(session.role);
      if (!isAssignedEmployee && !isManager) throw new Error("FORBIDDEN");

      const endedAt = new Date();
      meeting.status = "COMPLETED";
      meeting.endedAt = endedAt;
      meeting.endedByUserId = session.userId;
      meeting.endReason = "MANUAL";
      await meeting.save();

      await BookingRequest.updateOne(
        {
          _id: bookingId,
          companyId: session.companyId,
          status: { $in: ["CONFIRMED", "IN_PROGRESS"] }
        },
        { $set: { status: "COMPLETED" } }
      );

      let calendarDeleteFailed = false;
      if (meeting.googleCalendarEventId) {
        try {
          await deleteCalendarEvent(String(meeting.employeeId), meeting.googleCalendarEventId);
        } catch {
          calendarDeleteFailed = true;
        }
      }

      if (calendarDeleteFailed) {
        await Meeting.updateOne(
          { _id: meeting._id, status: "COMPLETED" },
          { $set: { calendarSyncStatus: "FAILED" } }
        );
      }

      return {
        bookingId: String(bookingId),
        status: "COMPLETED",
        calendarEventRemoved: !calendarDeleteFailed
      };
    });

    return jsonOk(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "MEETING_END_FAILED";
    const status =
      code === "MEETING_NOT_FOUND" ? 404 :
      ["FORBIDDEN", "MEETING_ALREADY_ENDED", "MEETING_NOT_READY"].includes(code) ? 409 :
      500;
    return jsonError(code, status);
  }
}
