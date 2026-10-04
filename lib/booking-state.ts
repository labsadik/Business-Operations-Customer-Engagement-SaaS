export const BOOKING_STATUSES = [
  "REQUESTED",
  "ASSIGNED",
  "CREATING_MEETING",
  "CONFIRMED",
  "IN_PROGRESS",
  "COMPLETED",
  "DECLINED",
  "RETRYING",
  "EXPIRED",
  "CANCELLED",
  "FAILED"
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

const TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  REQUESTED: ["ASSIGNED", "CREATING_MEETING", "RETRYING", "EXPIRED", "CANCELLED"],
  ASSIGNED: ["CREATING_MEETING", "RETRYING", "EXPIRED", "CANCELLED"],
  CREATING_MEETING: ["CONFIRMED", "RETRYING", "FAILED", "CANCELLED"],
  CONFIRMED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "FAILED"],
  COMPLETED: [],
  DECLINED: ["RETRYING"],
  RETRYING: ["ASSIGNED", "CREATING_MEETING", "EXPIRED", "CANCELLED"],
  EXPIRED: [],
  CANCELLED: [],
  FAILED: ["RETRYING"]
};

export function canTransition(from: BookingStatus, to: BookingStatus) {
  return TRANSITIONS[from].includes(to);
}