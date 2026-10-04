import type { ClientSession } from "mongoose";
import { BookingActivity } from "@/models/booking-activity";

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

export function errorCodeFromUnknown(error: unknown) {
  const raw = error instanceof Error ? error.message : "";
  if (!raw) return "UNKNOWN_ERROR";
  if (raw.startsWith("GOOGLE_API_")) return raw.split(":")[0].slice(0, 100);
  return raw.slice(0, 100);
}
