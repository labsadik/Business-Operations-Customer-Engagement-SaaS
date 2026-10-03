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
    paymentId: { type: Schema.Types.ObjectId, ref: "Payment", required: true, unique: true, index: true },
    invoiceNumber: { type: String, required: true, unique: true, index: true },
    planId: { type: String, enum: ["starter", "business"], required: true },
    providerOrderId: { type: String, required: true, index: true },
    providerPaymentId: { type: String, required: true, index: true },
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, required: true, default: "INR" },
    issuedAt: { type: Date, required: true },
    billingPeriodStart: { type: Date },
    billingPeriodEnd: { type: Date },
    serviceDescription: { type: String, required: true, default: "Conventus monthly scheduling service" },
    planSnapshot: {
      name: { type: String, required: true, default: "" },
      priceInr: { type: Number, required: true, default: 0 },
      maxEmployees: { type: Number, required: true, default: 0 },
      monthlyMeetingLimit: { type: Number, required: true, default: 0 },
      maxMeetingDurationMinutes: { type: Number, required: true, default: 0 },
      maxConcurrentMeetings: { type: Number, required: true, default: 0 }
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
      inclusive: { type: Boolean, default: true },
      taxableAmount: { type: Number, required: true, min: 0, default: 0 },
      gstAmount: { type: Number, required: true, min: 0, default: 0 }
    }
  },
  { timestamps: true }
);

invoiceSchema.index({ companyId: 1, issuedAt: -1 });

export const Invoice = models.Invoice ?? model("Invoice", invoiceSchema);
