import { Schema, model, models } from "mongoose";

const membershipSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    role: {
      type: String,
      enum: ["COMPANY_OWNER", "COMPANY_ADMIN", "EMPLOYEE"],
      required: true
    },
    active: { type: Boolean, default: true, index: true },
    jobTitle: { type: String, trim: true, maxlength: 120, default: "" },
    department: { type: String, trim: true, maxlength: 100, default: "" },
    employmentStatus: { type: String, enum: ["ACTIVE", "ON_LEAVE", "INACTIVE"], default: "ACTIVE", index: true },
    googleConnectionStatus: {
      type: String,
      enum: ["CONNECTED", "REAUTH_REQUIRED", "DISCONNECTED"],
      default: "DISCONNECTED"
    }
  },
  { timestamps: true }
);

membershipSchema.index({ companyId: 1, userId: 1 }, { unique: true });

export const Membership = models.Membership ?? model("Membership", membershipSchema);