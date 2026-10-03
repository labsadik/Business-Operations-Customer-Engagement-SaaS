import { Schema, model, models } from "mongoose";

const meetingSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    bookingRequestId: { type: Schema.Types.ObjectId, ref: "BookingRequest", required: true, unique: true },
    employeeId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    startAt: { type: Date, required: true, index: true },
    endAt: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ["CREATING", "READY", "LIVE", "COMPLETED", "CANCELLED", "FAILED"],
      default: "CREATING",
      index: true
    },
    googleMeetSpaceName: { type: String, unique: true, sparse: true },
    googleMeetingUri: { type: String },
    googleCalendarEventId: { type: String },
    calendarSyncStatus: {
      type: String,
      enum: ["PENDING", "SYNCED", "FAILED"],
      default: "PENDING"
    }
  },
  { timestamps: true }
);

meetingSchema.index({ companyId: 1, startAt: 1 });
meetingSchema.index({ employeeId: 1, startAt: 1, endAt: 1 });

export const Meeting = models.Meeting ?? model("Meeting", meetingSchema);