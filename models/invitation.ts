import { Schema, model, models } from "mongoose";

const invitationSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    invitedEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    role: { type: String, enum: ["EMPLOYEE"], default: "EMPLOYEE" },
    expiresAt: { type: Date, required: true, index: true },
    acceptedAt: { type: Date },
    acceptedUserId: { type: Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

export const Invitation = models.Invitation ?? model("Invitation", invitationSchema);