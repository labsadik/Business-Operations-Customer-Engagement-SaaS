import { Schema, model, models } from "mongoose";

const planSchema = new Schema(
  {
    identifier: {
      type: String,
      required: true,
      unique: true,
      index: true,
      immutable: true,
      trim: true,
      lowercase: true,
      match: /^[a-z][a-z0-9_-]{1,63}$/
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: "", trim: true, maxlength: 1200 },
    status: {
      type: String,
      enum: ["PUBLIC", "COMING_SOON", "PRIVATE"],
      default: "PRIVATE",
      index: true
    },
    popular: { type: Boolean, default: false },
    recommended: { type: Boolean, default: false },
    priceInr: { type: Number, required: true, min: 0, max: 10000000 },
    discountType: {
      type: String,
      enum: ["NONE", "PERCENTAGE", "FIXED_AMOUNT"],
      default: "NONE"
    },
    discountValue: { type: Number, default: 0, min: 0, max: 10000000 },
    maxWorkspaces: { type: Number, required: true, min: 1, max: 1000000 },
    maxCompanies: { type: Number, required: true, min: 1, max: 1000000 },
    maxEmployees: { type: Number, required: true, min: 1, max: 1000000 },
    monthlyMeetingLimit: { type: Number, required: true, min: 1, max: 10000000 },
    maxMeetingDurationMinutes: { type: Number, required: true, min: 1, max: 1440 },
    maxConcurrentMeetings: { type: Number, required: true, min: 1, max: 1000000 },
    taskManagementEnabled: { type: Boolean, required: true, default: false, index: true },
    validityDays: { type: Number, required: true, min: 1, max: 3650 },
    freeFeatureDays: { type: Number, default: null, min: 0, max: 3650 },
    requiresPayment: { type: Boolean, required: true },
    revision: { type: Number, required: true, default: 1, min: 1 },
    sortOrder: { type: Number, default: 1000, min: 0, max: 1000000 },
    archivedAt: { type: Date, default: null, index: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: "User", index: true }
  },
  { timestamps: true }
);

planSchema.index({ status: 1, archivedAt: 1, sortOrder: 1, createdAt: 1 });
planSchema.index({ identifier: 1, revision: 1 });

export const Plan = models.Plan ?? model("Plan", planSchema);
