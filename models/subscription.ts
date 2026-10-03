import { Schema, model, models } from "mongoose";

const subscriptionSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, unique: true, index: true },
    planId: { type: String, enum: ["starter", "business"], required: true },
    status: { type: String, enum: ["ACTIVE", "PAST_DUE", "CANCELLED"], default: "ACTIVE", index: true },
    currentPeriodStart: { type: Date, required: true },
    currentPeriodEnd: { type: Date, required: true },
    monthlyMeetingsUsed: { type: Number, default: 0, min: 0 },
    providerCustomerId: { type: String, index: true, sparse: true },
    providerSubscriptionId: { type: String, index: true, sparse: true }
  },
  { timestamps: true }
);

export const Subscription =
  models.Subscription ?? model("Subscription", subscriptionSchema);