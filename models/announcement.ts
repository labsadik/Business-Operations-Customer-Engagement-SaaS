import { Schema, model, models } from "mongoose";

const announcementSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    title: { type: String, trim: true, maxlength: 120, default: "Announcement" },
    message: { type: String, trim: true, required: true, maxlength: 500 },
    active: { type: Boolean, default: true, index: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true }
  },
  { timestamps: true }
);

announcementSchema.index({ companyId: 1, active: 1, createdAt: -1 });

export const Announcement =
  models.Announcement ?? model("Announcement", announcementSchema);
