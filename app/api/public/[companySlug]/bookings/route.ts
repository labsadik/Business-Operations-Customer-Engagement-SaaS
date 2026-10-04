import { getMongo } from "@/lib/mongodb";
import { Company } from "@/models/company";
import { Workspace } from "@/models/workspace";
import { MeetingType } from "@/models/meeting-type";
import { BookingRequest } from "@/models/booking-request";
import { getSession } from "@/lib/session";
import {
  assertMeetingCapacity,
  getCompanyEntitlements
} from "@/lib/plans-server";
import { resolveMeetingDuration } from "@/lib/plans";
import { eligibleEmployees } from "@/lib/routing";
import { withRedisLock } from "@/lib/redis-lock";
import { jsonError, jsonOk } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security";
import { Types } from "mongoose";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ companySlug: string }> }
) {
  try {
    assertSameOrigin(request);
  } catch {
    return jsonError("CSRF_ORIGIN_INVALID", 403);
  }

  const session = await getSession();
  if (!session || session.role !== "CUSTOMER") {
    return jsonError("CUSTOMER_LOGIN_REQUIRED", 401);
  }

  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (!idempotencyKey || idempotencyKey.length < 12) {
    return jsonError("IDEMPOTENCY_KEY_REQUIRED", 400);
  }

  await getMongo();
  const { companySlug } = await params;

  const company = await Company.findOne({
    slug: companySlug.toLowerCase(),
    publicBookingEnabled: true
  }).lean();

  if (!company) return jsonError("COMPANY_NOT_FOUND", 404);

  const body = await request.json().catch(() => null) as {
    meetingTypeId?: string;
    startAt?: string;
    endAt?: string;
    durationMinutes?: number;
  } | null;

  const durationMinutes = body?.durationMinutes;
  if (
    !body?.meetingTypeId ||
    !Types.ObjectId.isValid(body.meetingTypeId) ||
    !body.startAt ||
    !body.endAt ||
    typeof durationMinutes !== "number" ||
    !Number.isInteger(durationMinutes)
  ) {
    return jsonError("INVALID_BOOKING");
  }

  const startAt = new Date(body.startAt);
  const endAt = new Date(body.endAt);
  if (
    Number.isNaN(startAt.getTime()) ||
    Number.isNaN(endAt.getTime()) ||
    endAt <= startAt
  ) {
    return jsonError("INVALID_TIME_RANGE");
  }

  const workspace = await Workspace.findOne({
    companyId: company._id,
    active: true
  })
    .select("_id timezone")
    .lean();

  if (!workspace) return jsonError("WORKSPACE_NOT_FOUND", 404);

  const type = await MeetingType.findOne({
    _id: body.meetingTypeId,
    companyId: company._id,
    workspaceId: workspace._id,
    active: true
  }).lean();

  if (!type) return jsonError("MEETING_TYPE_NOT_FOUND", 404);

  const existing = await BookingRequest.findOne({
    idempotencyKey,
    companyId: company._id,
    customerId: session.userId
  }).lean();
  if (existing) {
    return jsonOk({
      bookingId: String(existing._id),
      status: existing.status,
      expiresAt: existing.expiresAt
    });
  }

  try {
    const plan = await getCompanyEntitlements(String(company._id));
    const resolved = resolveMeetingDuration(
      plan.maxMeetingDurationMinutes,
      type.durationOptionsMinutes,
      durationMinutes
    );

    if (
      endAt.getTime() - startAt.getTime() !==
      resolved.durationMinutes * 60_000
    ) {
      throw new Error("INVALID_TIME_RANGE");
    }

    if (startAt.getTime() <= Date.now()) {
      throw new Error("BOOKING_TIME_IN_PAST");
    }

    await assertMeetingCapacity(String(company._id), resolved.durationMinutes);

    const busyForCompany = await BookingRequest.countDocuments({
      companyId: company._id,
      status: {
        $in: ["ASSIGNED", "CREATING_MEETING", "CONFIRMED", "IN_PROGRESS"]
      },
      requestedStartAt: { $lt: endAt },
      requestedEndAt: { $gt: startAt }
    });

    if (busyForCompany >= plan.maxConcurrentMeetings) {
      throw new Error("CONCURRENT_MEETING_LIMIT");
    }

    const eligible = await eligibleEmployees(
      String(company._id),
      startAt,
      endAt,
      [],
      {
        bufferBeforeMinutes: type.bufferBeforeMinutes,
        bufferAfterMinutes: type.bufferAfterMinutes
      }
    );

    if (eligible.length === 0) {
      throw new Error("NO_EMPLOYEE_AVAILABLE");
    }

    const booking = await withRedisLock(
      `booking:create:${company._id}:${startAt.toISOString()}`,
      5000,
      async () =>
        BookingRequest.create({
          companyId: company._id,
          workspaceId: workspace._id,
          customerId: session.userId,
          meetingTypeId: type._id,
          requestedStartAt: startAt,
          requestedEndAt: endAt,
          requestedDurationMinutes: resolved.durationMinutes,
          status: "REQUESTED",
          expiresAt: new Date(Date.now() + 5 * 60_000),
          idempotencyKey,
          declinedBy: []
        })
    );

    return jsonOk(
      {
        bookingId: String(booking._id),
        status: booking.status,
        expiresAt: booking.expiresAt
      },
      201
    );
  } catch (error) {
    const code =
      error instanceof Error ? error.message : "BOOKING_CREATE_FAILED";
    const status = [
      "NO_EMPLOYEE_AVAILABLE",
      "CONCURRENT_MEETING_LIMIT",
      "MONTHLY_MEETING_LIMIT",
      "MEETING_DURATION_LIMIT",
      "INVALID_DURATION",
      "MEETING_DURATION_NOT_CONFIGURED",
      "FREE_FEATURE_DAYS_EXHAUSTED"
    ].includes(code)
      ? 409
      : 400;

    return jsonError(code, status);
  }
}
