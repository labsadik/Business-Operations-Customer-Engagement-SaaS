import { Schema, model, models } from "mongoose";
import { createAddressSchema } from "@/models/address-schema";

const companySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    // Stable tenant-facing identifier; MongoDB _id remains the internal foreign key.
    publicId: { type: Number, min: 100001, immutable: true },
    slug: { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },
    email: { type: String, lowercase: true, trim: true, maxlength: 254 },
    phone: { type: String, trim: true, maxlength: 32 },
    logoUrl: { type: String, trim: true, maxlength: 2000 },
    websiteUrl: { type: String, trim: true, maxlength: 500 },
    description: { type: String, maxlength: 1200 },
    address: { type: createAddressSchema({ trim: true, enforceMaxLength: true }) },
    taxId: { type: String, trim: true, maxlength: 80 },
    publicBookingEnabled: { type: Boolean, default: false, index: true },
    planSuspended: { type: Boolean, default: false, index: true },
    planSuspendedAt: { type: Date },
    planSuspendedByUserId: { type: Schema.Types.ObjectId, ref: "User" },
    planAccessExpiresAt: { type: Date },
    planExpired: { type: Boolean, default: false, index: true },
    planExpiredAt: { type: Date },
    planExpiredByUserId: { type: Schema.Types.ObjectId, ref: "User" },
    planExpiryTestActive: { type: Boolean, default: false },
    // Initialized from the real company name and immutable database ID on first vault access.
    vaultStorageRoot: { type: String, trim: true, maxlength: 140 },
    taskCanvasCount: { type: Number, min: 0 },
    ownerUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true }
  },
  { timestamps: true }
);

companySchema.index({ publicId: 1 }, { unique: true, sparse: true, name: "uniq_company_public_id" });
companySchema.index({ name: 1, _id: 1 }, { name: "idx_company_admin_name_id" });

export const Company = models.Company ?? model("Company", companySchema);
