import { Schema, model, models } from "mongoose";
import { PLAN_DISCOUNT_TYPES, PLAN_STATUSES } from "@/lib/plan-rules";

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
      enum: [...PLAN_STATUSES],
      default: "PRIVATE",
      index: true
    },
    popular: { type: Boolean, default: false },
    recommended: { type: Boolean, default: false },
    priceInr: { type: Number, required: true, min: 0, max: 10000000 },
    discountType: {
      type: String,
      enum: [...PLAN_DISCOUNT_TYPES],
      default: "NONE"
    },
    discountValue: { type: Number, default: 0, min: 0, max: 10000000 },
    maxWorkspaces: { type: Number, required: true, min: 1, max: 1000000 },
    maxCompanies: { type: Number, required: true, min: 1, max: 1000000 },
    maxEmployees: { type: Number, required: true, min: 1, max: 1000000 },
    monthlyMeetingLimit: { type: Number, required: true, min: 1, max: 10000000 },
    maxMeetingDurationMinutes: { type: Number, required: true, min: 1, max: 1440 },
    maxConcurrentMeetings: { type: Number, required: true, min: 1, max: 1000000 },
    taskManagementEnabled: { type: Boolean, required: true, default: false },
    taskManagementDailyLimit: {
      type: Number,
      default: 10,
      min: 1,
      max: 1000000
    },
    taskCanvasEnabled: { type: Boolean, required: true, default: false },
    taskCanvasMaxCollaborators: { type: Number, required: true, default: 2, min: 2, max: 200 },
    taskCanvasHistoryLimit: { type: Number, required: true, default: 10, min: 1, max: 100 },
    vaultEnabled: { type: Boolean, required: true, default: false },
    vaultQuotaBytes: { type: Number, required: true, default: 5368709120, min: 1048576, max: Number.MAX_SAFE_INTEGER },
    vaultMaxFileBytes: { type: Number, required: true, default: 104857600, min: 1048576, max: 262144000 },
    vaultMaxItems: { type: Number, required: true, default: 1000, min: 1, max: 10000000 },
    liveChatEnabled: { type: Boolean, required: true, default: false },
    liveChatMonthlyLimit: { type: Number, required: true, default: 1000, min: 1, max: 10000000 },
    liveChatCustomerLimit: { type: Number, required: true, default: 500, min: 1, max: 10000000 },
    liveChatAgentLimit: { type: Number, required: true, default: 5, min: 1, max: 1000 },
    liveChatRetentionDays: { type: Number, required: true, default: 30, min: 1, max: 3650 },
    liveChatMessageCooldownSeconds: { type: Number, required: true, default: 15, min: 15, max: 600 },
    liveChatPdfExportEnabled: { type: Boolean, required: true, default: true },
    liveChatDeleteEnabled: { type: Boolean, required: true, default: true },
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
