import { getMongo } from "@/lib/mongodb";
import { BookingRequest } from "@/models/booking-request";
import { Meeting } from "@/models/meeting";
import { MeetingType } from "@/models/meeting-type";
import { Workspace } from "@/models/workspace";
import { requireCompanyMember } from "@/lib/authz";
import { withRedisLock } from "@/lib/redis-lock";
import { eligibleEmployees } from "@/lib/routing";
import { getCompanyEntitlements, assertFeatureAccess } from "@/lib/plans-server";
import { resolveMeetingDuration } from "@/lib/plans";
import { createMeetingForBooking } from "@/lib/meeting-service";
import { jsonOk } from "@/lib/http";
import { bookingJsonError, bookingErrorCode } from "@/lib/booking-errors";
import { recordBookingActivity, reserveMeetingUsage, releaseMeetingUsage } from "@/lib/booking-history";
import { assertSameOrigin } from "@/lib/security";
import { after } from "next/server";
import { classifyAccept } from "@/lib/booking-action-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Session = { userId: string; companyId?: string; role: string };

function responseForCurrentState(
  booking: {
    _id: unknown;
    status: string;
    assignedEmployeeId?: unknown;
  },
  meeting: { status?: string; googleMeetingUri?: string } | null,
  userId: string
) {
  const assignedToCurrent = String(booking.assignedEmployeeId ?? "") === userId;

  if (booking.status === "CONFIRMED" && assignedToCurrent) {
    return {
      bookingId: String(booking._id),
      status: booking.status,
      meetingUri: meeting?.googleMeetingUri ?? null
    };
  }

  if (
    ["ASSIGNED", "CREATING_MEETING"].includes(booking.status) &&
    assignedToCurrent
  ) {
    return {
      bookingId: String(booking._id),
      status: booking.status,
      meetingUri: meeting?.googleMeetingUri ?? null
    };
  }

  return null;
}

function acceptDecisionError(decision: ReturnType<typeof classifyAccept>) {
  switch (decision.kind) {
    case "ALREADY_ASSIGNED":
      return "BOOKING_ALREADY_ASSIGNED";
    case "ALREADY_CONFIRMED":
      return "BOOKING_ALREADY_CONFIRMED";
    case "DECLINED_BY_EMPLOYEE":
      return "BOOKING_DECLINED_BY_EMPLOYEE";
    case "EXPIRED":
      return "BOOKING_EXPIRED";
    case "COMPLETED":
      return "BOOKING_ALREADY_COMPLETED";
    case "CANCELLED":
      return "BOOKING_CANCELLED";
    case "FAILED":
      return "BOOKING_FAILED";
    case "IDEMPOTENT_PROCESSING":
      return "BOOKING_PROCESSING";
    case "NO_LONGER_AVAILABLE":
      return "BOOKING_NO_LONGER_AVAILABLE";
    case "ELIGIBLE":
    case "IDEMPOTENT_CONFIRMED":
      return null;
  }
}

async function currentIdempotentResponse(
  bookingId: string,
  companyId: string,
  userId: string
) {
  const [booking, meeting] = await Promise.all([
    BookingRequest.findOne({ _id: bookingId, companyId }).lean(),
    Meeting.findOne({ bookingRequestId: bookingId, companyId })
      .select("status googleMeetingUri")
      .lean()
  ]);
  if (!booking) return null;
  return responseForCurrentState(booking, meeting, userId);
}

async function safeStateDetails(bookingId: string, companyId: string, userId: string) {
  const booking = await BookingRequest.findOne({ _id: bookingId, companyId })
    .select("status assignedEmployeeId expiresAt")
    .lean();

  if (!booking) return undefined;

  return {
    status: booking.status,
    assignedToCurrentEmployee:
      String(booking.assignedEmployeeId ?? "") === userId,
    expired: booking.expiresAt.getTime() <= Date.now()
  };
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
      "COMPANY_OWNER",
      "COMPANY_ADMIN"
    ]);
    session = result.session;
  } catch (error) {
    const code = bookingErrorCode(error);
    return bookingJsonError(code, code === "UNAUTHENTICATED" ? 401 : 403);
  }

  if (!companyId) {
    return bookingJsonError("COMPANY_NOT_CONFIGURED", 403);
  }
  const companyId = companyId;

  if (session.role === "PLATFORM_ADMIN") {
    return bookingJsonError("PLATFORM_ADMIN_CANNOT_ACCEPT_AS_EMPLOYEE", 403);
  }

  await getMongo();
  const { bookingId } = await params;

  try {
    const result = await withRedisLock(
      `booking:accept:${companyId}:${bookingId}`,
      10_000,
      async () => {
        const scoped = await BookingRequest.findOne({
          _id: bookingId,
          companyId: companyId
        }).lean();

        if (!scoped) throw new Error("BOOKING_NOT_FOUND");

        const currentMeeting = await Meeting.findOne({
          bookingRequestId: bookingId,
          companyId: companyId
        })
          .select("status googleMeetingUri employeeId")
          .lean();

        const decision = classifyAccept({
          status: scoped.status,
          assignedEmployeeId: scoped.assignedEmployeeId,
          declinedBy: scoped.declinedBy,
          expiresAt: scoped.expiresAt,
          userId: session.userId
        });

        if (
          decision.kind === "IDEMPOTENT_PROCESSING" ||
          decision.kind === "IDEMPOTENT_CONFIRMED"
        ) {
          return responseForCurrentState(scoped, currentMeeting, session.userId);
        }

        const decisionError = acceptDecisionError(decision);
        if (decisionError) throw new Error(decisionError);

        if (scoped.status === "EXPIRED") throw new Error("BOOKING_EXPIRED");
        if (scoped.expiresAt.getTime() <= Date.now()) {
          const db = await getMongo();
          const tx = await db.startSession();
          try {
            await tx.withTransaction(async () => {
              const beforeExpiry = await BookingRequest.findOne({
                _id: bookingId,
                companyId: companyId,
                status: {
                  $in: [
                    "REQUESTED",
                    "RETRYING",
                    "ASSIGNED",
                    "CREATING_MEETING"
                  ]
                },
                expiresAt: { $lte: new Date() }
              }).session(tx);

              const expired = beforeExpiry
                ? await BookingRequest.findOneAndUpdate(
                {
                  _id: bookingId,
                  companyId: companyId,
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
                  )
                : null;

              if (expired) {
                await releaseMeetingUsage({
                  bookingId,
                  companyId: companyId!,
                  session: tx
                });
                await recordBookingActivity({
                  companyId: companyId!,
                  bookingRequestId: bookingId,
                  eventType: "REQUEST_EXPIRED",
                  fromStatus: beforeExpiry?.status ?? "REQUESTED",
                  toStatus: "EXPIRED",
                  outcome: "EXPIRED",
                  actorRole: "SYSTEM",
                  session: tx
                });
              }
            });
          } finally {
            await tx.endSession();
          }
          throw new Error("BOOKING_EXPIRED");
        }

        if (!["REQUESTED", "RETRYING"].includes(scoped.status)) {
          throw new Error("BOOKING_NO_LONGER_AVAILABLE");
        }

        await assertFeatureAccess(companyId);
        const plan = await getCompanyEntitlements(companyId);

        const [workspace, type, activeMeeting] = await Promise.all([
          Workspace.findOne({
            _id: scoped.workspaceId,
            companyId: companyId,
            active: true
          }).select("_id timezone").lean(),
          MeetingType.findOne({
            _id: scoped.meetingTypeId,
            companyId: companyId,
            workspaceId: scoped.workspaceId,
            active: true
          }).lean(),
          Meeting.findOne({ bookingRequestId: bookingId, companyId: companyId })
            .select("status googleCalendarEventId employeeId")
            .lean()
        ]);

        if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");
        if (!type) throw new Error("MEETING_TYPE_NOT_FOUND");

        const resolved = resolveMeetingDuration(
          plan.maxMeetingDurationMinutes,
          type.durationOptionsMinutes,
          scoped.requestedDurationMinutes
        );

        if (
          scoped.requestedEndAt.getTime() - scoped.requestedStartAt.getTime() !==
          resolved.durationMinutes * 60_000
        ) {
          throw new Error("INVALID_TIME_RANGE");
        }

        const eligible = await eligibleEmployees(
          companyId,
          scoped.requestedStartAt,
          scoped.requestedEndAt,
          scoped.declinedBy?.map(String) ?? [],
          {
            bufferBeforeMinutes: type.bufferBeforeMinutes,
            bufferAfterMinutes: type.bufferAfterMinutes,
            excludeBookingId: bookingId,
            requiredEmployeeId: session.userId
          }
        );

        if (!eligible.includes(session.userId)) {
          throw new Error("EMPLOYEE_NOT_AVAILABLE");
        }

        const db = await getMongo();
        const tx = await db.startSession();

        let acceptedAt = new Date();
        try {
          let response;
          await tx.withTransaction(async () => {
            const latest = await BookingRequest.findOne({
              _id: bookingId,
              companyId: companyId,
              status: { $in: ["REQUESTED", "RETRYING"] },
              expiresAt: { $gt: new Date() },
              declinedBy: { $ne: session.userId },
              $or: [
                { assignedEmployeeId: { $exists: false } },
                { assignedEmployeeId: null }
              ]
            }).session(tx);

            if (!latest) {
              const afterRace = await BookingRequest.findOne({
                _id: bookingId,
                companyId: companyId
              })
                .session(tx)
                .lean();

              if (!afterRace) throw new Error("BOOKING_NOT_FOUND");

              const afterRaceDecision = classifyAccept({
                status: afterRace.status,
                assignedEmployeeId: afterRace.assignedEmployeeId,
                declinedBy: afterRace.declinedBy,
                expiresAt: afterRace.expiresAt,
                userId: session.userId
              });

              if (
                afterRaceDecision.kind === "IDEMPOTENT_PROCESSING" ||
                afterRaceDecision.kind === "IDEMPOTENT_CONFIRMED"
              ) {
                const same = responseForCurrentState(
                  afterRace,
                  activeMeeting,
                  session.userId
                );
                if (same) {
                  response = same;
                  return;
                }
              }

              const afterRaceError = acceptDecisionError(afterRaceDecision);
              throw new Error(afterRaceError ?? "BOOKING_NO_LONGER_AVAILABLE");
            }

            const concurrent = await BookingRequest.countDocuments({
              _id: { $ne: latest._id },
              companyId: companyId,
              status: {
                $in: [
                  "ASSIGNED",
                  "CREATING_MEETING",
                  "CONFIRMED",
                  "IN_PROGRESS"
                ]
              },
              requestedStartAt: { $lt: latest.requestedEndAt },
              requestedEndAt: { $gt: latest.requestedStartAt }
            }).session(tx);

            if (concurrent >= plan.maxConcurrentMeetings) {
              throw new Error("CONCURRENT_MEETING_LIMIT");
            }

            acceptedAt = new Date();
            latest.assignedEmployeeId = session.userId;
            latest.status = "CREATING_MEETING";
            latest.acceptedAt = acceptedAt;
            latest.confirmedAt = undefined;
            latest.nextRetryAt = new Date(Date.now() + 15_000);
            latest.meetingCreationStartedAt = acceptedAt;
            latest.lastMeetingErrorCode = undefined;

            await latest.save({ session: tx });

            await reserveMeetingUsage({
              bookingId,
              companyId: companyId!,
              plan,
              session: tx
            });

            await recordBookingActivity({
              companyId: companyId!,
              bookingRequestId: bookingId,
              eventType: "EMPLOYEE_ACCEPTED",
              fromStatus: scoped.status,
              toStatus: "CREATING_MEETING",
              outcome: "ACCEPTED",
              actorId: session.userId,
              actorRole: session.role,
              employeeId: session.userId,
              occurredAt: acceptedAt,
              session: tx
            });

            response = {
              bookingId,
              status: "CREATING_MEETING",
              meetingUri: null
            };
          });

          return response ?? {
            bookingId,
            status: "CREATING_MEETING",
            meetingUri: null
          };
        } finally {
          await tx.endSession();
        }
      }
    );

    after(async () => {
      try {
        await withRedisLock(
          `meeting:finalize:${companyId}:${bookingId}`,
          60_000,
          async () => {
            await createMeetingForBooking(bookingId);
          }
        );
      } catch (error) {
        const code = bookingErrorCode(error);
        if (!["GOOGLE_MEET_PENDING", "RESOURCE_BUSY"].includes(code)) {
          console.warn("[Conventus] meeting finalization failed", { code });
        }
      }
    });

    return jsonOk(result);
  } catch (error) {
    let code = bookingErrorCode(error);

    if (code === "RESOURCE_BUSY") {
      const current = await currentIdempotentResponse(
        bookingId,
        companyId!,
        session.userId
      ).catch(() => null);

      if (current) return jsonOk(current);

      const busyState = await safeStateDetails(
        bookingId,
        companyId!,
        session.userId
      ).catch(() => undefined);

      code =
        busyState?.status === "ASSIGNED" ||
        busyState?.status === "CREATING_MEETING"
          ? "BOOKING_ALREADY_ASSIGNED"
          : "BOOKING_PROCESSING";
    }

    const status =
      ["BOOKING_NOT_FOUND"].includes(code)
        ? 404
        : [
            "BOOKING_ALREADY_ASSIGNED",
            "BOOKING_ALREADY_CONFIRMED",
            "BOOKING_DECLINED_BY_EMPLOYEE",
            "BOOKING_EXPIRED",
            "BOOKING_PROCESSING",
            "BOOKING_NO_LONGER_AVAILABLE",
            "EMPLOYEE_NOT_AVAILABLE",
            "CONCURRENT_MEETING_LIMIT",
            "MONTHLY_MEETING_LIMIT",
            "MEETING_DURATION_LIMIT",
            "INVALID_DURATION",
            "MEETING_DURATION_NOT_CONFIGURED",
            "INVALID_TIME_RANGE",
            "WORKSPACE_NOT_FOUND",
            "MEETING_TYPE_NOT_FOUND",
            "RESOURCE_BUSY",
            "BOOKING_ALREADY_COMPLETED",
            "BOOKING_CANCELLED",
            "BOOKING_FAILED",
            "FREE_FEATURE_DAYS_EXHAUSTED"
          ].includes(code)
        ? 409
        : code.startsWith("GOOGLE_API_") || code.startsWith("GOOGLE_")
          ? 502
          : 500;

    const details =
      status === 409
        ? await safeStateDetails(bookingId, companyId!, session.userId).catch(
            () => undefined
          )
        : undefined;

    console.warn("[Conventus] booking accept rejected", {
      code,
      status,
      role: session.role,
      hasStateDetails: Boolean(details)
    });

    return bookingJsonError(code, status, details);
  }
}
