import { Schema, model, models } from "mongoose";

const companySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    slug: { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },
    email: { type: String, lowercase: true, trim: true, maxlength: 254 },
    phone: { type: String, trim: true, maxlength: 32 },
    logoUrl: { type: String, trim: true, maxlength: 2000 },
    websiteUrl: { type: String, trim: true, maxlength: 500 },
    description: { type: String, maxlength: 1200 },
    address: {
      line1: { type: String, trim: true, maxlength: 200 },
      line2: { type: String, trim: true, maxlength: 200 },
      city: { type: String, trim: true, maxlength: 100 },
      state: { type: String, trim: true, maxlength: 100 },
      postalCode: { type: String, trim: true, maxlength: 30 },
      country: { type: String, trim: true, maxlength: 100 }
    },
    taxId: { type: String, trim: true, maxlength: 80 },
    publicBookingEnabled: { type: Boolean, default: false, index: true },
    planSuspended: { type: Boolean, default: false, index: true },
    planSuspendedAt: { type: Date },
    planSuspendedByUserId: { type: Schema.Types.ObjectId, ref: "User" },
    // Initialized from the real company name and immutable database ID on first vault access.
    vaultStorageRoot: { type: String, trim: true, maxlength: 140 },
    ownerUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true }
  },
  { timestamps: true }
);

export const Company = models.Company ?? model("Company", companySchema);
