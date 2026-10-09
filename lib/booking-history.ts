import type { ClientSession } from "mongoose";
import { BookingActivity } from "@/models/booking-activity";
import { BookingRequest } from "@/models/booking-request";
import { Subscription } from "@/models/subscription";
import type { PlanEntitlements } from "@/lib/plans";

export type BookingActivityEventType =
  | "REQUEST_CREATED"
  | "EMPLOYEE_ACCEPTED"
  | "EMPLOYEE_DECLINED"
  | "RETRY_SCHEDULED"
  | "MEETING_CREATING"
  | "MEETING_CONFIRMED"
  | "MEETING_CREATION_FAILED"
  | "REQUEST_EXPIRED"
  | "MEETING_COMPLETED"
  | "MEETING_CANCELLED";

export type BookingOutcome =
  | "PENDING"
  | "ACCEPTED"
  | "DECLINED"
  | "RETRYING"
  | "CONFIRMED"
  | "FAILED"
  | "EXPIRED"
  | "COMPLETED"
  | "CANCELLED";

export async function recordBookingActivity(input: {
  companyId: string;
  bookingRequestId: string;
  eventType: BookingActivityEventType;
  fromStatus: string;
  toStatus: string;
  outcome: BookingOutcome;
  actorId?: string | null;
  actorRole?: string | null;
  employeeId?: string | null;
  reasonCode?: string | null;
  occurredAt?: Date;
  session?: ClientSession;
}) {
  const payload = {
    companyId: input.companyId,
    bookingRequestId: input.bookingRequestId,
    eventType: input.eventType,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    outcome: input.outcome,
    ...(input.actorId ? { actorId: input.actorId } : {}),
    ...(input.actorRole ? { actorRole: input.actorRole } : {}),
    ...(input.employeeId ? { employeeId: input.employeeId } : {}),
    ...(input.reasonCode ? { reasonCode: input.reasonCode.slice(0, 100) } : {}),
    occurredAt: input.occurredAt ?? new Date()
  };

  if (input.session) {
    await BookingActivity.create([payload], { session: input.session });
  } else {
    await BookingActivity.create([payload]);
  }
}

export async function reserveMeetingUsage(input: {
  bookingId: string;
  companyId: string;
  plan: PlanEntitlements;
  session: ClientSession;
}) {
  const now = new Date();
  const booking = await BookingRequest.findOne({
    _id: input.bookingId,
    companyId: input.companyId
  }).session(input.session);
  if (!booking) throw new Error("BOOKING_NOT_FOUND");

  if (booking.usageReservedAt && !booking.usageReleasedAt) {
    return booking;
  }

  const subscription = await Subscription.findOneAndUpdate(
    {
      companyId: input.companyId,
      planId: input.plan.id,
      status: "ACTIVE",
      currentPeriodEnd: { $gt: now },
      monthlyMeetingsUsed: { $lt: input.plan.monthlyMeetingLimit }
    },
    { $inc: { monthlyMeetingsUsed: 1 } },
    { returnDocument: "after", session: input.session }
  );

  if (!subscription) throw new Error("MONTHLY_MEETING_LIMIT");

  booking.usageReservedAt = now;
  booking.usageReservationPeriodStart = subscription.currentPeriodStart;
  booking.usageReleasedAt = undefined;
  await booking.save({ session: input.session });
  return booking;
}

export async function releaseMeetingUsage(input: {
  bookingId: string;
  companyId: string;
  session?: ClientSession;
}) {
  const now = new Date();
  const options = input.session ? { session: input.session } : undefined;
  const booking = await BookingRequest.findOneAndUpdate(
    {
      _id: input.bookingId,
      companyId: input.companyId,
      usageReservedAt: { $exists: true, $ne: null },
      usageReleasedAt: { $exists: false }
    },
    { $set: { usageReleasedAt: now } },
    { returnDocument: "after", ...(options ?? {}) }
  );

  if (!booking || !booking.usageReservationPeriodStart) return false;

  await Subscription.updateOne(
    {
      companyId: input.companyId,
      currentPeriodStart: booking.usageReservationPeriodStart,
      monthlyMeetingsUsed: { $gt: 0 }
    },
    { $inc: { monthlyMeetingsUsed: -1 } },
    options
  );
  return true;
}


