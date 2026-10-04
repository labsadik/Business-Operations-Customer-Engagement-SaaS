import { Schema, model, models } from "mongoose";

const feedbackSchema = new Schema(
  {
    source: {
      type: String,
      enum: ["CUSTOMER_BOOKING", "COMPANY_PLATFORM"],
      required: true,
      index: true
    },
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
      immutable: true
    },
    submitterUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
      immutable: true
    },
    bookingRequestId: {
      type: Schema.Types.ObjectId,
      ref: "BookingRequest",
      index: true,
      immutable: true
    },
    rating: { type: Number, required: true, min: 1, max: 5, immutable: true },
    description: { type: String, trim: true, maxlength: 300, default: "", immutable: true },
    reviewStatus: {
      type: String,
      enum: ["NEW", "REVIEWED", "RESOLVED"],
      default: "NEW",
      required: true,
      index: true
    },
    reviewStatusChangedAt: { type: Date },
    reviewStatusChangedByUserId: { type: Schema.Types.ObjectId, ref: "User", index: true }
  },
  { timestamps: true }
);

feedbackSchema.index({ source: 1, companyId: 1, reviewStatus: 1, createdAt: -1 });
feedbackSchema.index({ source: 1, companyId: 1, createdAt: -1 });
feedbackSchema.index({ source: 1, submitterUserId: 1, createdAt: -1 });

export const Feedback = models.Feedback ?? model("Feedback", feedbackSchema);
