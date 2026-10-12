import { NextResponse } from "next/server";
import { getMongo } from "@/lib/mongodb";
import { BookingRequest } from "@/models/booking-request";
import { withRedisLock } from "@/lib/redis-lock";
import { getRedis } from "@/lib/redis";
import { createMeetingForBooking } from "@/lib/meeting-service";
import { recordBookingActivity, releaseMeetingUsage } from "@/lib/booking-history";
import { bookingErrorCode } from "@/lib/booking-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPIRY_SWEEP_BATCH_LIMIT = 25;
const RETRY_SWEEP_BATCH_LIMIT = 25;
const MEETING_RETRY_SWEEP_BATCH_LIMIT = 5;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  if (process.env.NODE_ENV === "production") {
    try {
      const redis = await getRedis();
      if (!redis) throw new Error("REDIS_NOT_CONFIGURED");
      await redis.ping();
    } catch {
      return NextResponse.json({ ok: false, error: "REDIS_UNAVAILABLE" }, { status: 503 });
    }
  }

  await getMongo();
  const now = new Date();

  const expiring = await BookingRequest.find({
    status: { $in: ["REQUESTED", "RETRYING", "ASSIGNED", "CREATING_MEETING"] },
    expiresAt: { $lte: now }
  })
    .select("_id companyId status expiresAt assignedEmployeeId")
    .sort({ expiresAt: 1 })
    .limit(EXPIRY_SWEEP_BATCH_LIMIT)
    .lean();

  let expired = 0;
  for (const item of expiring) {
    try {
      await withRedisLock(
        `booking:sweep:expire:${String(item.companyId)}:${String(item._id)}`,
        10_000,
        async () => {
          const current = await BookingRequest.findOneAndUpdate(
            {
              _id: item._id,
              companyId: item.companyId,
              status: { $in: ["REQUESTED", "RETRYING", "ASSIGNED", "CREATING_MEETING"] },
              expiresAt: { $lte: new Date() }
            },
            {
              $set: {
                status: "EXPIRED",
                assignedEmployeeId: null,
                nextRetryAt: null
              }
            },
            { returnDocument: "after" }
          );

          if (!current) return;

          await releaseMeetingUsage({
            bookingId: String(item._id),
            companyId: String(item.companyId)
          });

          await recordBookingActivity({
            companyId: String(item.companyId),
            bookingRequestId: String(item._id),
            eventType: "REQUEST_EXPIRED",
            fromStatus: item.status,
            toStatus: "EXPIRED",
            outcome: "EXPIRED",
            actorRole: "SYSTEM",
            employeeId: item.assignedEmployeeId ? String(item.assignedEmployeeId) : null
          });

          expired += 1;
        }
      );
    } catch (error) {
      console.warn("[Canvas] booking expiry sweep failed", {
        code: bookingErrorCode(error)
      });
    }
  }

  const dueRetries = await BookingRequest.find({
    status: "RETRYING",
    expiresAt: { $gt: now },
    nextRetryAt: { $lte: now }
  })
    .select("_id companyId status")
    .sort({ nextRetryAt: 1 })
    .limit(RETRY_SWEEP_BATCH_LIMIT)
    .lean();

  let retried = 0;
  for (const item of dueRetries) {
    try {
      const updated = await BookingRequest.findOneAndUpdate(
        {
          _id: item._id,
          companyId: item.companyId,
          status: "RETRYING",
          expiresAt: { $gt: new Date() },
          nextRetryAt: { $lte: new Date() }
        },
        {
          $set: {
            status: "REQUESTED",
            nextRetryAt: null,
            assignedEmployeeId: null
          }
        },
        { returnDocument: "after" }
      );

      if (!updated) continue;

      await recordBookingActivity({
        companyId: String(item.companyId),
        bookingRequestId: String(item._id),
        eventType: "RETRY_SCHEDULED",
        fromStatus: "RETRYING",
        toStatus: "REQUESTED",
        outcome: "RETRYING",
        actorRole: "SYSTEM"
      });

      retried += 1;
    } catch (error) {
      console.warn("[Canvas] booking retry sweep failed", {
        code: bookingErrorCode(error)
      });
    }
  }

  const creating = await BookingRequest.find({
    status: "CREATING_MEETING",
    expiresAt: { $gt: now },
    nextRetryAt: { $lte: now }
  })
    .select("_id companyId assignedEmployeeId status")
    .sort({ nextRetryAt: 1 })
    .limit(MEETING_RETRY_SWEEP_BATCH_LIMIT)
    .lean();

  let meetingRetries = 0;
  for (const item of creating) {
    try {
      await withRedisLock(
        `meeting:finalize:${String(item.companyId)}:${String(item._id)}`,
        60_000,
        async () => {
          await createMeetingForBooking(String(item._id));
        }
      );
      meetingRetries += 1;
    } catch (error) {
      console.warn("[Canvas] meeting retry failed", {
        code: bookingErrorCode(error)
      });
    }
  }

  return NextResponse.json({
    ok: true,
    expired,
    retried,
    meetingRetries,
    hasMoreWork:
      expiring.length === EXPIRY_SWEEP_BATCH_LIMIT ||
      dueRetries.length === RETRY_SWEEP_BATCH_LIMIT ||
      creating.length === MEETING_RETRY_SWEEP_BATCH_LIMIT,
    timestamp: now.toISOString()
  });
}
