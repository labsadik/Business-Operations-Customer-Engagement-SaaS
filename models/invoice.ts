import { Schema, model, models } from "mongoose";

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
    merchantSnapshot: {
      name: { type: String, required: true },
      description: { type: String, required: true },
      logoUrl: { type: String, required: true }
    },
    companySnapshot: {
      name: { type: String, required: true },
      email: { type: String, required: true },
      phone: { type: String, required: true },
      address: {
        line1: String,
        line2: String,
        city: String,
        state: String,
        postalCode: String,
        country: String
      },
      taxId: String
    }
  },
  { timestamps: true }
);

invoiceSchema.index({ companyId: 1, issuedAt: -1 });

export const Invoice = models.Invoice ?? model("Invoice", invoiceSchema);
