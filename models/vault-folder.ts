import { Schema, model, models } from "mongoose";

const vaultFolderSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, immutable: true, index: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, immutable: true, index: true },
    parentFolderId: { type: Schema.Types.ObjectId, ref: "VaultFolder", default: null, index: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 100 },
    nameKey: { type: String, required: true, trim: true, lowercase: true },
    // Stable storage keys make renaming a folder metadata-only; company names and
    // human-friendly folder names never become authorization inputs.
    storageKey: { type: String, required: true, unique: true, immutable: true }
  },
  { timestamps: true }
);

vaultFolderSchema.index({ companyId: 1, workspaceId: 1, parentFolderId: 1, nameKey: 1 }, { unique: true });
vaultFolderSchema.index({ companyId: 1, workspaceId: 1, parentFolderId: 1, name: 1 });

export const VaultFolder = models.VaultFolder ?? model("VaultFolder", vaultFolderSchema);
