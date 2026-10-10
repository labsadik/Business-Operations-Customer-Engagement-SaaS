import { Schema, model, models } from "mongoose";

const vaultUsageSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, immutable: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, immutable: true },
    usedBytes: { type: Number, required: true, default: 0, min: 0 },
    quotaBytes: { type: Number, required: true, min: 1 }
  },
  { timestamps: true }
);

vaultUsageSchema.index({ companyId: 1, workspaceId: 1 }, { unique: true });

export const VaultUsage = models.VaultUsage ?? model("VaultUsage", vaultUsageSchema);
