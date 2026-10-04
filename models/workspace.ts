import { Schema, model, models } from "mongoose";

const workspaceSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    timezone: { type: String, required: true, default: "Asia/Kolkata" },
    planId: { type: String, default: "free", required: true, index: true, match: /^[a-z][a-z0-9_-]{1,63}$/ },
    active: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);

export const Workspace = models.Workspace ?? model("Workspace", workspaceSchema);