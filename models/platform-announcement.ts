import { Schema, model, models } from "mongoose";

const platformAnnouncementSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    message: { type: String, required: true, trim: true, maxlength: 500 },
    audience: {
      type: String,
      enum: ["LANDING_PAGE", "ALL_COMPANIES", "SELECTED_COMPANIES"],
      required: true,
      index: true
    },
    targetCompanyIds: [{
      type: Schema.Types.ObjectId,
      ref: "Company",
      index: true
    }],
    status: {
      type: String,
      enum: ["DRAFT", "PUBLISHED"],
      default: "DRAFT",
      required: true,
      index: true
    },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    publishedAt: { type: Date, index: true }
  },
  { timestamps: true }
);

platformAnnouncementSchema.index({ status: 1, audience: 1, publishedAt: -1 });
platformAnnouncementSchema.index({ status: 1, audience: 1, targetCompanyIds: 1, publishedAt: -1 });

export const PlatformAnnouncement =
  models.PlatformAnnouncement ?? model("PlatformAnnouncement", platformAnnouncementSchema);
