import { Schema, model, models } from "mongoose";

const paymentSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    planId: { type: String, enum: ["starter", "business"], required: true },
    merchantAccount: { type: String, enum: ["CONVENTUS"], default: "CONVENTUS", immutable: true },
    providerOrderId: { type: String, required: true, unique: true, index: true },
    providerPaymentId: { type: String, index: true, sparse: true },
    amount: { type: Number, required: true, min: 1 },
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
