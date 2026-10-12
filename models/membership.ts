import { Schema, model, models } from "mongoose";
import { COMPANY_MEMBER_ROLES, EMPLOYMENT_STATUSES } from "@/types/domain";

const membershipSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    role: {
      type: String,
      enum: [...COMPANY_MEMBER_ROLES],
      required: true
    },
    active: { type: Boolean, default: true, index: true },
    employmentStatus: { type: String, enum: [...EMPLOYMENT_STATUSES], default: "ACTIVE" }
  },
  { timestamps: true }
);

membershipSchema.index({ companyId: 1, userId: 1 }, { unique: true });
membershipSchema.index({ companyId: 1, workspaceId: 1, active: 1, employmentStatus: 1, userId: 1 });

export const Membership = models.Membership ?? model("Membership", membershipSchema);