import { getMongo } from "@/lib/mongodb";
import { Company } from "@/models/company";
import { Workspace } from "@/models/workspace";
import { MeetingType } from "@/models/meeting-type";
import { BookingRequest } from "@/models/booking-request";
import { getSession } from "@/lib/session";
import { assertMeetingCapacity } from "@/lib/plans-server";
import { eligibleEmployees } from "@/lib/routing";
import { withRedisLock } from "@/lib/redis-lock";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ companySlug: string }> }
) {
  const session = await getSession();
  if (!session) return jsonError("CUSTOMER_LOGIN_REQUIRED", 401);

  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (!idempotencyKey || idempotencyKey.length < 12) return jsonError("IDEMPOTENCY_KEY_REQUIRED", 400);

  await getMongo();
  const { companySlug } = await params;
  const company = await Company.findOne({ slug: companySlug.toLowerCase(), publicBookingEnabled: true }).lean();
  if (!company) return jsonError("COMPANY_NOT_FOUND", 404);

  const existing = await BookingRequest.findOne({ idempotencyKey }).lean();
  if (existing) return jsonOk({ bookingId: String(existing._id), status: existing.status, expiresAt: existing.expiresAt });

  const body = await request.json().catch(() => null) as {
    meetingTypeId?: string;
    startAt?: string;
    endAt?: string;
    durationMinutes?: number;
  } | null;

  const durationMinutes = body?.durationMinutes;
  if (!body?.meetingTypeId || !body.startAt || !body.endAt || typeof durationMinutes !== "number" || !Number.isInteger(durationMinutes)) {
    return jsonError("INVALID_BOOKING");
  }

  const startAt = new Date(body.startAt);
  const endAt = new Date(body.endAt);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) return jsonError("INVALID_TIME_RANGE");

  try {
    const plan = await assertMeetingCapacity(String(company._id), durationMinutes);
    const type = await MeetingType.findOne({ _id: body.meetingTypeId, companyId: company._id, active: true }).lean();
    const workspace = await Workspace.findOne({ companyId: company._id, active: true }).lean();
    if (!type || !workspace) throw new Error("MEETING_TYPE_NOT_FOUND");
    if (!type.durationOptionsMinutes.includes(durationMinutes)) throw new Error("INVALID_DURATION");
    if (startAt.getTime() <= Date.now()) throw new Error("BOOKING_TIME_IN_PAST");

    const busyForCompany = await BookingRequest.countDocuments({
      companyId: company._id,
      status: { $in: ["ASSIGNED", "CREATING_MEETING", "CONFIRMED", "IN_PROGRESS"] },
      requestedStartAt: { $lt: endAt },
      requestedEndAt: { $gt: startAt }
    });
    if (busyForCompany >= plan.maxConcurrentMeetings) throw new Error("CONCURRENT_MEETING_LIMIT");

    const eligible = await eligibleEmployees(String(company._id), startAt, endAt);
    if (eligible.length === 0) throw new Error("NO_EMPLOYEE_AVAILABLE");

    const booking = await withRedisLock(
      `booking:create:${company._id}:${startAt.toISOString()}`,
      5000,
      async () => BookingRequest.create({
        companyId: company._id,
        workspaceId: workspace._id,
        customerId: session.userId,
        meetingTypeId: type._id,
        requestedStartAt: startAt,
        requestedEndAt: endAt,
        requestedDurationMinutes: durationMinutes,
        status: "REQUESTED",
        expiresAt: new Date(Date.now() + 5 * 60_000),
        idempotencyKey,
        declinedBy: [],
      })
    );

    return jsonOk({ bookingId: String(booking._id), status: booking.status, expiresAt: booking.expiresAt }, 201);
  } catch (error) {
    const code = error instanceof Error ? error.message : "BOOKING_CREATE_FAILED";
    const status = ["NO_EMPLOYEE_AVAILABLE", "CONCURRENT_MEETING_LIMIT", "MONTHLY_MEETING_LIMIT", "MEETING_DURATION_LIMIT"].includes(code) ? 409 : 400;
    return jsonError(code, status);
  }
}