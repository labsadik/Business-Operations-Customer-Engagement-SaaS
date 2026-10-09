import { Schema, model, models } from "mongoose";

const bookingRequestSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    meetingTypeId: { type: Schema.Types.ObjectId, required: true, index: true },
    requestedStartAt: { type: Date, required: true, index: true },
    requestedEndAt: { type: Date, required: true, index: true },
    requestedDurationMinutes: { type: Number, required: true, min: 1, max: 240 },
    status: {
      type: String,
      enum: [
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
      ],
      default: "REQUESTED",
      index: true
    },
    expiresAt: { type: Date, required: true, index: true },
    assignedEmployeeId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    acceptedAt: { type: Date },
    confirmedAt: { type: Date },
    idempotencyKey: { type: String, required: true, unique: true },
    declinedBy: [{ type: Schema.Types.ObjectId, ref: "User" }],
    nextRetryAt: { type: Date, index: true },
    meetingCreationAttempts: { type: Number, default: 0, min: 0 },
    meetingCreationStartedAt: { type: Date },
    lastMeetingErrorCode: { type: String, maxlength: 100 },
    usageReservedAt: { type: Date },
    usageReservationPeriodStart: { type: Date },
    usageReleasedAt: { type: Date }
  },
  { timestamps: true }
);

bookingRequestSchema.index({ companyId: 1, status: 1, expiresAt: 1 });
bookingRequestSchema.index({ companyId: 1, status: 1, createdAt: -1 });
bookingRequestSchema.index({ assignedEmployeeId: 1, requestedStartAt: 1 });

export const BookingRequest =
  models.BookingRequest ?? model("BookingRequest", bookingRequestSchema);