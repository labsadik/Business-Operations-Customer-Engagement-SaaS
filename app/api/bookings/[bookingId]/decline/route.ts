import { getMongo } from "@/lib/mongodb";
import { BookingRequest } from "@/models/booking-request";
import { requireCompanyMember } from "@/lib/authz";
import { withRedisLock } from "@/lib/redis-lock";
import { jsonOk } from "@/lib/http";
import { bookingJsonError, bookingErrorCode } from "@/lib/booking-errors";
import { recordBookingActivity, releaseMeetingUsage } from "@/lib/booking-history";
import { assertSameOrigin } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Session = { userId: string; companyId?: string; role: string };

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
      "COMPANY_OWNER",
      "COMPANY_ADMIN"
    ]);
    session = result.session;
  } catch (error) {
    const code = bookingErrorCode(error);
    return bookingJsonError(code, code === "UNAUTHENTICATED" ? 401 : 403);
  }

  if (!session.companyId) {
    return bookingJsonError("COMPANY_NOT_CONFIGURED", 403);
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

        const alreadyDeclined = current.declinedBy?.some(
          (id) => String(id) === session.userId
        );

        if (
          alreadyDeclined &&
          ["REQUESTED", "RETRYING"].includes(current.status) &&
          current.expiresAt.getTime() > Date.now()
        ) {
          return {
            bookingId,
            status: current.status,
            nextRetryAt: current.nextRetryAt ?? null
          };
        }

        if (
          current.expiresAt.getTime() <= Date.now() &&
          [
            "REQUESTED",
            "RETRYING",
            "ASSIGNED",
            "CREATING_MEETING"
          ].includes(current.status)
        ) {
          const db = await getMongo();
          const tx = await db.startSession();
          try {
            await tx.withTransaction(async () => {
              const expired = await BookingRequest.findOneAndUpdate(
                {
                  _id: bookingId,
                  companyId: session.companyId,
                  status: {
                    $in: [
                      "REQUESTED",
                      "RETRYING",
                      "ASSIGNED",
                      "CREATING_MEETING"
                    ]
                  },
                  expiresAt: { $lte: new Date() }
                },
                {
                  $set: {
                    status: "EXPIRED",
                    assignedEmployeeId: null,
                    nextRetryAt: null
                  }
                },
                { new: true, session: tx }
              );

              if (expired) {
                const fromStatus = current.status;
                await releaseMeetingUsage({
                  bookingId,
                  companyId: session.companyId!,
                  session: tx
                });
                await recordBookingActivity({
                  companyId: session.companyId!,
                  bookingRequestId: bookingId,
                  eventType: "REQUEST_EXPIRED",
                  fromStatus,
                  toStatus: "EXPIRED",
                  outcome: "EXPIRED",
                  actorId: session.userId,
                  actorRole: session.role,
                  employeeId: session.userId,
                  session: tx
                });
              }
            });
          } finally {
            await tx.endSession();
          }
          throw new Error("BOOKING_EXPIRED");
        }

        if (current.declinedBy?.some((id) => String(id) === session.userId)) {
          if (["ASSIGNED", "CREATING_MEETING", "CONFIRMED", "IN_PROGRESS"].includes(current.status)) {
            throw new Error(
              String(current.assignedEmployeeId ?? "") === session.userId
                ? "BOOKING_ALREADY_CONFIRMED"
                : "BOOKING_ALREADY_ASSIGNED"
            );
          }
          if (["COMPLETED", "CANCELLED", "FAILED", "EXPIRED"].includes(current.status)) {
            throw new Error(
              current.status === "EXPIRED"
                ? "BOOKING_EXPIRED"
                : current.status === "FAILED"
                  ? "BOOKING_FAILED"
                  : current.status === "CANCELLED"
                    ? "BOOKING_CANCELLED"
                    : "BOOKING_ALREADY_COMPLETED"
            );
          }
        }

        if (["ASSIGNED", "CREATING_MEETING"].includes(current.status)) {
          throw new Error(
            String(current.assignedEmployeeId ?? "") === session.userId
              ? "BOOKING_ALREADY_CONFIRMED"
              : "BOOKING_ALREADY_ASSIGNED"
          );
        }
        if (["CONFIRMED", "IN_PROGRESS"].includes(current.status)) {
          throw new Error("BOOKING_ALREADY_CONFIRMED");
        }
        if (current.status === "COMPLETED") throw new Error("BOOKING_ALREADY_COMPLETED");
        if (current.status === "CANCELLED") throw new Error("BOOKING_CANCELLED");
        if (current.status === "FAILED") throw new Error("BOOKING_FAILED");
        if (current.status === "EXPIRED") throw new Error("BOOKING_EXPIRED");

        if (!["REQUESTED", "RETRYING"].includes(current.status)) {
          throw new Error("BOOKING_NO_LONGER_AVAILABLE");
        }

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
              { new: true, session: tx }
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
        current?.declinedBy?.some((id) => String(id) === session.userId) &&
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
