import { Schema, model, models, type InferSchemaType } from "mongoose";

const addressSchema = new Schema(
  {
    line1: { type: String, trim: true, maxlength: 200, default: "" },
    line2: { type: String, trim: true, maxlength: 200, default: "" },
    city: { type: String, trim: true, maxlength: 100, default: "" },
    state: { type: String, trim: true, maxlength: 100, default: "" },
    postalCode: { type: String, trim: true, maxlength: 30, default: "" },
    country: { type: String, trim: true, maxlength: 100, default: "India" }
  },
  { _id: false }
);

const platformSettingsSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: "default"
    },
    legalName: { type: String, required: true, trim: true, maxlength: 200, default: "Conventus" },
    description: { type: String, trim: true, maxlength: 1200, default: "Company scheduling infrastructure for customer meetings." },
    websiteUrl: { type: String, trim: true, maxlength: 500, default: "" },
    billingEmail: { type: String, trim: true, lowercase: true, maxlength: 254, default: "" },
    phone: { type: String, trim: true, maxlength: 32, default: "" },
    logoUrl: { type: String, trim: true, maxlength: 2000, default: "" },
    taxId: { type: String, trim: true, maxlength: 80, default: "" },
    gstin: { type: String, trim: true, maxlength: 80, default: "" },
    sacCode: { type: String, trim: true, maxlength: 40, default: "" },
    address: { type: addressSchema, default: () => ({}) },
    gst: {
      enabled: { type: Boolean, default: true },
      ratePercent: { type: Number, min: 0, max: 100, default: 18 },
      inclusive: { type: Boolean, default: false }
    },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

export type PlatformSettingsDocument = InferSchemaType<typeof platformSettingsSchema>;
export const PlatformSettings = models.PlatformSettings ?? model("PlatformSettings", platformSettingsSchema);
