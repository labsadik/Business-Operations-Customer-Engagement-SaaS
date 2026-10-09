import { Schema, model, models } from "mongoose";

const subscriptionSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, unique: true, index: true },
    planId: { type: String, required: true, index: true, match: /^[a-z][a-z0-9_-]{1,63}$/ },
    status: { type: String, enum: ["ACTIVE", "PAST_DUE", "CANCELLED"], default: "ACTIVE", index: true },
    currentPeriodStart: { type: Date, required: true },
    currentPeriodEnd: { type: Date, required: true },
    monthlyMeetingsUsed: { type: Number, default: 0, min: 0 },
    source: {
      type: String,
      enum: ["FREE", "PAID", "ADMIN_GRANTED"],
      default: "FREE",
      index: true
    },
    freeUsageDates: { type: [String], default: [] },
    grantedByUserId: { type: Schema.Types.ObjectId, ref: "User" },
    grantedAt: { type: Date },
    providerCustomerId: { type: String, index: true, sparse: true },
    providerSubscriptionId: { type: String, index: true, sparse: true },
    entitlementSnapshot: {
      _id: false,
      id: { type: String, required: true },
      name: { type: String, required: true },
      priceInr: { type: Number, required: true, min: 0 },
      maxWorkspaces: { type: Number, required: true, min: 1 },
      maxCompanies: { type: Number, required: true, min: 1 },
      maxEmployees: { type: Number, required: true, min: 1 },
      monthlyMeetingLimit: { type: Number, required: true, min: 1 },
      maxMeetingDurationMinutes: { type: Number, required: true, min: 1 },
      maxConcurrentMeetings: { type: Number, required: true, min: 1 },
      taskManagementEnabled: { type: Boolean, required: true, default: false },
      validityDays: { type: Number, required: true, min: 1 },
      freeFeatureDays: { type: Number, default: null, min: 0 },
      requiresPayment: { type: Boolean, required: true }
    }
  },
  { timestamps: true }
);

export const Subscription =
  models.Subscription ?? model("Subscription", subscriptionSchema);