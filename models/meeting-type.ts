import { Schema, model, models } from "mongoose";

const meetingTypeSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, trim: true, lowercase: true },
    description: { type: String, maxlength: 500 },
    durationOptionsMinutes: { type: [Number], required: true, default: [20] },
    bufferBeforeMinutes: { type: Number, default: 0, min: 0, max: 120 },
    bufferAfterMinutes: { type: Number, default: 0, min: 0, max: 120 },
    active: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);

meetingTypeSchema.index({ companyId: 1, slug: 1 }, { unique: true });

export const MeetingType = models.MeetingType ?? model("MeetingType", meetingTypeSchema);