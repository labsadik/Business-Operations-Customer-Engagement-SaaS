import { Schema, model, models } from "mongoose";
import { BOOKING_ACTIVITY_ACTOR_ROLES, BOOKING_ACTIVITY_EVENT_TYPES, BOOKING_OUTCOMES } from "@/lib/booking-state";

const bookingActivitySchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    bookingRequestId: { type: Schema.Types.ObjectId, ref: "BookingRequest", required: true, index: true },
    eventType: {
      type: String,
      enum: [...BOOKING_ACTIVITY_EVENT_TYPES],
      required: true,
      index: true
    },
    fromStatus: { type: String, required: true },
    toStatus: { type: String, required: true },
    outcome: {
      type: String,
      enum: [...BOOKING_OUTCOMES],
      required: true,
      index: true
    },
    actorId: { type: Schema.Types.ObjectId, ref: "User" },
    actorRole: {
      type: String,
      enum: [...BOOKING_ACTIVITY_ACTOR_ROLES]
    },
    employeeId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    reasonCode: { type: String, maxlength: 100 },
    occurredAt: { type: Date, required: true, default: Date.now, index: true }
  },
  { timestamps: true }
);

bookingActivitySchema.index({ companyId: 1, occurredAt: -1, _id: -1 });
bookingActivitySchema.index({ companyId: 1, actorId: 1, occurredAt: -1, _id: -1 });
bookingActivitySchema.index({ companyId: 1, employeeId: 1, occurredAt: -1, _id: -1 });
bookingActivitySchema.index({ companyId: 1, bookingRequestId: 1, occurredAt: 1 });

export const BookingActivity =
  models.BookingActivity ?? model("BookingActivity", bookingActivitySchema);
