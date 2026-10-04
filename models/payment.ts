import { Schema, model, models } from "mongoose";

const paymentSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    planId: { type: String, required: true, index: true, match: /^[a-z][a-z0-9_-]{1,63}$/ },
    merchantAccount: { type: String, enum: ["CONVENTUS"], default: "CONVENTUS", immutable: true },
    providerOrderId: { type: String, required: true, unique: true, index: true },
    // One live checkout/order per company. The field is removed once the
    // payment is captured or permanently failed, so a company cannot create
    // duplicate Razorpay orders by double-clicking or racing requests.
    checkoutKey: { type: String },
    providerPaymentId: { type: String },
    failurePaymentId: { type: String, sparse: true },
    amount: { type: Number, required: true, min: 0 },
    baseAmount: { type: Number, required: true, min: 0 },
    taxAmount: { type: Number, required: true, min: 0, default: 0 },
    taxRatePercent: { type: Number, min: 0, max: 100, default: 0 },
    taxInclusive: { type: Boolean, default: false },
    currency: { type: String, required: true, default: "INR" },
    status: { type: String, enum: ["PENDING", "CAPTURED", "FAILED", "REFUNDED"], default: "PENDING", index: true },
    paidAt: { type: Date },
    activatedAt: { type: Date, index: true },
    failureReason: { type: String, maxlength: 500 },
    planRevision: { type: Number, min: 1 },
    discountType: { type: String, enum: ["NONE", "PERCENTAGE", "FIXED_AMOUNT"], default: "NONE" },
    discountValue: { type: Number, min: 0, default: 0 },
    discountAmount: { type: Number, min: 0, default: 0 },
    checkoutPlanSnapshot: {
      _id: false,
      id: { type: String },
      name: { type: String },
      priceInr: { type: Number, min: 0 },
      maxWorkspaces: { type: Number, min: 1 },
      maxCompanies: { type: Number, min: 1 },
      maxEmployees: { type: Number, min: 1 },
      monthlyMeetingLimit: { type: Number, min: 1 },
      maxMeetingDurationMinutes: { type: Number, min: 1 },
      maxConcurrentMeetings: { type: Number, min: 1 },
      validityDays: { type: Number, min: 1 },
      freeFeatureDays: { type: Number, min: 0, default: null },
      requiresPayment: { type: Boolean }
    }
  },
  { timestamps: true }
);

paymentSchema.index({ companyId: 1, createdAt: -1 });
paymentSchema.index({
  companyId: 1,
  merchantAccount: 1,
  status: 1,
  paidAt: -1,
  activatedAt: -1,
  createdAt: -1
});
paymentSchema.index({ providerPaymentId: 1 }, { unique: true, sparse: true });
paymentSchema.index({ checkoutKey: 1 }, { unique: true, sparse: true });

export const Payment = models.Payment ?? model("Payment", paymentSchema);
