import { Schema, model, models } from "mongoose";

const companySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },
    logoUrl: { type: String },
    description: { type: String, maxlength: 1200 },
    publicBookingEnabled: { type: Boolean, default: false, index: true },
    ownerUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true }
  },
  { timestamps: true }
);

export const Company = models.Company ?? model("Company", companySchema);