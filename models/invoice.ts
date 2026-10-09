import { Schema, model, models } from "mongoose";

const addressSchema = new Schema(
  {
    line1: String,
    line2: String,
    city: String,
    state: String,
    postalCode: String,
    country: String
  },
  { _id: false }
);

const invoiceSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    paymentId: { type: Schema.Types.ObjectId, ref: "Payment", unique: true, sparse: true, index: true },
    source: {
      type: String,
      enum: ["PAID", "FREE", "ADMIN_GRANTED"],
      required: true,
      default: "PAID",
      index: true
    },
    invoiceNumber: { type: String, required: true, unique: true, index: true },
    planId: { type: String, required: true, index: true, match: /^[a-z][a-z0-9_-]{1,63}$/ },
    providerOrderId: { type: String, default: "", index: true },
    providerPaymentId: { type: String, default: "", index: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: "INR" },
    issuedAt: { type: Date, required: true },
    billingPeriodStart: { type: Date },
    billingPeriodEnd: { type: Date },
    serviceDescription: { type: String, required: true, default: "Conventus monthly scheduling service" },
    discountType: { type: String, enum: ["NONE", "PERCENTAGE", "FIXED_AMOUNT"], default: "NONE" },
    discountValue: { type: Number, min: 0, default: 0 },
    discountAmount: { type: Number, min: 0, default: 0 },
    planSnapshot: {
      id: { type: String, required: true, default: "" },
      name: { type: String, required: true, default: "" },
      priceInr: { type: Number, required: true, default: 0 },
      maxWorkspaces: { type: Number, required: true, default: 1 },
      maxCompanies: { type: Number, required: true, default: 1 },
      maxEmployees: { type: Number, required: true, default: 0 },
      monthlyMeetingLimit: { type: Number, required: true, default: 0 },
      maxMeetingDurationMinutes: { type: Number, required: true, default: 0 },
      maxConcurrentMeetings: { type: Number, required: true, default: 0 },
      taskManagementEnabled: { type: Boolean, required: true, default: false },
      validityDays: { type: Number, required: true, default: 30 },
      freeFeatureDays: { type: Number, default: null },
      requiresPayment: { type: Boolean, required: true, default: false }
    },
    merchantSnapshot: {
      name: { type: String, required: true },
      description: { type: String, required: true },
      logoUrl: { type: String, required: true },
      websiteUrl: { type: String, default: "" },
      email: { type: String, default: "" },
      phone: { type: String, default: "" },
      taxId: { type: String, default: "" },
      gstin: { type: String, default: "" },
      sacCode: { type: String, default: "" },
      address: { type: addressSchema, default: () => ({}) }
    },
    companySnapshot: {
      name: { type: String, required: true },
      email: { type: String, required: true },
      phone: { type: String, required: true },
      address: { type: addressSchema, default: () => ({}) },
      taxId: { type: String, default: "" }
    },
    taxSnapshot: {
      enabled: { type: Boolean, default: false },
      ratePercent: { type: Number, default: 0, min: 0, max: 100 },
      inclusive: { type: Boolean, default: false },
      taxableAmount: { type: Number, required: true, min: 0, default: 0 },
      gstAmount: { type: Number, required: true, min: 0, default: 0 }
    }
  },
  { timestamps: true }
);

invoiceSchema.index({ companyId: 1, issuedAt: -1 });
invoiceSchema.index({ planId: 1, issuedAt: -1 });

export const Invoice = models.Invoice ?? model("Invoice", invoiceSchema);
