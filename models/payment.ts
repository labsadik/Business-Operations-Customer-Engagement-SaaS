import { Schema, model, models } from "mongoose";

const paymentSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    planId: { type: String, enum: ["free", "starter", "elite", "pro", "plus"], required: true },
    merchantAccount: { type: String, enum: ["CONVENTUS"], default: "CONVENTUS", immutable: true },
    providerOrderId: { type: String, required: true, unique: true, index: true },
    providerPaymentId: { type: String, index: true, sparse: true },
    amount: { type: Number, required: true, min: 0 },
    baseAmount: { type: Number, required: true, min: 0 },
    taxAmount: { type: Number, required: true, min: 0, default: 0 },
    taxRatePercent: { type: Number, min: 0, max: 100, default: 0 },
    taxInclusive: { type: Boolean, default: false },
    currency: { type: String, required: true, default: "INR" },
    status: { type: String, enum: ["PENDING", "CAPTURED", "FAILED"], default: "PENDING", index: true },
    paidAt: { type: Date },
    activatedAt: { type: Date, index: true },
    failureReason: { type: String, maxlength: 500 }
  },
  { timestamps: true }
);

paymentSchema.index({ companyId: 1, createdAt: -1 });
paymentSchema.index({ providerPaymentId: 1 }, { unique: true, sparse: true });

export const Payment = models.Payment ?? model("Payment", paymentSchema);
