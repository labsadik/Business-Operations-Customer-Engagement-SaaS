import { Schema, model, models } from "mongoose";
import { createAddressSchema } from "@/models/address-schema";
import { planEntitlementSnapshotSchema } from "@/models/plan-entitlement-snapshot";
import { PLAN_DISCOUNT_TYPES } from "@/lib/plan-rules";
import { BILLING_SOURCES } from "@/types/domain";

const addressSchema = createAddressSchema();

const invoiceSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    paymentId: { type: Schema.Types.ObjectId, ref: "Payment", unique: true, sparse: true, index: true },
    source: {
      type: String,
      enum: [...BILLING_SOURCES],
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
    discountType: { type: String, enum: [...PLAN_DISCOUNT_TYPES], default: "NONE" },
    discountValue: { type: Number, min: 0, default: 0 },
    discountAmount: { type: Number, min: 0, default: 0 },
    planSnapshot: { type: planEntitlementSnapshotSchema, required: true },
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
