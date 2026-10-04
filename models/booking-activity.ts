import { Schema, model, models } from "mongoose";

const bookingActivitySchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    bookingRequestId: { type: Schema.Types.ObjectId, ref: "BookingRequest", required: true, index: true },
    eventType: {
      type: String,
      enum: [
        "REQUEST_CREATED",
        "EMPLOYEE_ACCEPTED",
        "EMPLOYEE_DECLINED",
        "RETRY_SCHEDULED",
        "MEETING_CREATING",
        "MEETING_CONFIRMED",
        "MEETING_CREATION_FAILED",
        "REQUEST_EXPIRED",
        "MEETING_COMPLETED",
        "MEETING_CANCELLED"
      ],
      required: true,
      index: true
    },
    fromStatus: { type: String, required: true },
    toStatus: { type: String, required: true },
    outcome: {
      type: String,
      enum: [
        "PENDING",
        "ACCEPTED",
        "DECLINED",
        "RETRYING",
        "CONFIRMED",
        "FAILED",
        "EXPIRED",
        "COMPLETED",
        "CANCELLED"
      ],
      required: true,
      index: true
    },
    actorId: { type: Schema.Types.ObjectId, ref: "User" },
    actorRole: {
      type: String,
      enum: [
        "CUSTOMER",
        "COMPANY_OWNER",
        "COMPANY_ADMIN",
        "EMPLOYEE",
        "PLATFORM_ADMIN",
        "SYSTEM"
      ]
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
