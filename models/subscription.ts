import { Schema, model, models } from "mongoose";
import { planEntitlementSnapshotSchema } from "@/models/plan-entitlement-snapshot";

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
    entitlementSnapshot: { type: planEntitlementSnapshotSchema, required: true }
  },
  { timestamps: true }
);

export const Subscription =
  models.Subscription ?? model("Subscription", subscriptionSchema);