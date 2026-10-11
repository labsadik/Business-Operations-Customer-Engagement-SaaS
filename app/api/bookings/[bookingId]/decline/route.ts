import { getMongo } from "@/lib/mongodb";
import { BookingRequest } from "@/models/booking-request";
import { requireCompanyMember } from "@/lib/authz";
import { withRedisLock } from "@/lib/redis-lock";
import { jsonOk } from "@/lib/http";
import { bookingJsonError, bookingErrorCode } from "@/lib/booking-errors";
import { recordBookingActivity, releaseMeetingUsage } from "@/lib/booking-history";
import { assertSameOrigin } from "@/lib/security";
import { classifyDecline } from "@/lib/booking-action-policy";
import { isCompanyPlanSuspended } from "@/lib/plans-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Session = { userId: string; companyId?: string; role: string };


function declineDecisionError(decision: ReturnType<typeof classifyDecline>) {
  switch (decision.kind) {
    case "ALREADY_ASSIGNED":
      return "BOOKING_ALREADY_ASSIGNED";
    case "ALREADY_CONFIRMED":
      return "BOOKING_ALREADY_CONFIRMED";
    case "EXPIRED":
      return "BOOKING_EXPIRED";
    case "COMPLETED":
      return "BOOKING_ALREADY_COMPLETED";
    case "CANCELLED":
      return "BOOKING_CANCELLED";
    case "FAILED":
      return "BOOKING_FAILED";
    case "IDEMPOTENT_PROCESSING":
    case "ELIGIBLE":
      return null;
    case "NO_LONGER_AVAILABLE":
      return "BOOKING_NO_LONGER_AVAILABLE";
    case "DECLINED_BY_EMPLOYEE":
      return null;
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  try {
    assertSameOrigin(_request);
  } catch {
    return bookingJsonError("CSRF_ORIGIN_INVALID", 403);
  }

  let session: Session;
  try {
    const result = await requireCompanyMember([
      "EMPLOYEE",
      "COMPANY_ADMIN",
    "PLATFORM_ADMIN"
  ]);
    session = result.session;
  } catch (error) {
    const code = bookingErrorCode(error);
    return bookingJsonError(code, code === "UNAUTHENTICATED" ? 401 : 403);
  }

  if (!session.companyId) {
    return bookingJsonError("COMPANY_NOT_CONFIGURED", 403);
  }
  if (await isCompanyPlanSuspended(session.companyId)) {
    return bookingJsonError("PLAN_SUSPENDED", 423);
  }

  await getMongo();
  const { bookingId } = await params;

  try {
    const result = await withRedisLock(
      `booking:respond:${session.companyId}:${bookingId}`,
      10_000,
      async () => {
        const current = await BookingRequest.findOne({
          _id: bookingId,
          companyId: session.companyId
        }).lean();

        if (!current) throw new Error("BOOKING_NOT_FOUND");

        const decision = classifyDecline({
          status: current.status,
          assignedEmployeeId: current.assignedEmployeeId,
          declinedBy: current.declinedBy,
          expiresAt: current.expiresAt,
          userId: session.userId
        });

        if (decision.kind === "IDEMPOTENT_PROCESSING") {
          return {
            bookingId,
            status: current.status,
            nextRetryAt: current.nextRetryAt ?? null
          };
        }

        const decisionError = declineDecisionError(decision);
        if (decisionError) throw new Error(decisionError);

        const db = await getMongo();
        const tx = await db.startSession();
        try {
          let response;
          await tx.withTransaction(async () => {
            const latest = await BookingRequest.findOneAndUpdate(
              {
                _id: bookingId,
                companyId: session.companyId,
                status: { $in: ["REQUESTED", "RETRYING"] },
                expiresAt: { $gt: new Date() },
                $or: [
                  { assignedEmployeeId: { $exists: false } },
                  { assignedEmployeeId: null }
                ],
                declinedBy: { $ne: session.userId }
              },
              {
                $addToSet: { declinedBy: session.userId },
                $set: {
                  status: "RETRYING",
                  nextRetryAt: new Date(Date.now() + 20_000)
                }
              },
              { returnDocument: "after", session: tx }
            );

            if (!latest) throw new Error("BOOKING_NO_LONGER_AVAILABLE");

            await recordBookingActivity({
              companyId: session.companyId!,
              bookingRequestId: bookingId,
              eventType: "EMPLOYEE_DECLINED",
              fromStatus: current.status,
              toStatus: "RETRYING",
              outcome: "DECLINED",
              actorId: session.userId,
              actorRole: session.role,
              employeeId: session.userId,
              session: tx
            });

            response = {
              bookingId,
              status: latest.status,
              nextRetryAt: latest.nextRetryAt ?? null
            };
          });
          return response;
        } finally {
          await tx.endSession();
        }
      }
    );

    return jsonOk(result);
  } catch (error) {
    let code = bookingErrorCode(error);

    if (code === "RESOURCE_BUSY") {
      const current = await BookingRequest.findOne({
        _id: bookingId,
        companyId: session.companyId
      }).lean();

      if (
        current?.declinedBy?.some((id: unknown) => String(id) === session.userId) &&
        ["REQUESTED", "RETRYING"].includes(current.status) &&
        current.expiresAt.getTime() > Date.now()
      ) {
        return jsonOk({
          bookingId,
          status: current.status,
          nextRetryAt: current.nextRetryAt ?? null
        });
      }

      if (current?.status === "ASSIGNED" || current?.status === "CREATING_MEETING") {
        code =
          String(current.assignedEmployeeId ?? "") === session.userId
            ? "BOOKING_ALREADY_CONFIRMED"
            : "BOOKING_ALREADY_ASSIGNED";
      } else {
        code = "BOOKING_PROCESSING";
      }
    }

    const status =
      code === "BOOKING_NOT_FOUND"
        ? 404
        : [
            "BOOKING_ALREADY_ASSIGNED",
            "BOOKING_ALREADY_CONFIRMED",
            "BOOKING_EXPIRED",
            "BOOKING_FAILED",
            "BOOKING_CANCELLED",
            "BOOKING_ALREADY_COMPLETED",
            "BOOKING_NO_LONGER_AVAILABLE",
            "BOOKING_PROCESSING",
            "RESOURCE_BUSY"
          ].includes(code)
          ? 409
          : 500;

    return bookingJsonError(code, status);
  }
}
