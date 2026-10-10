import { Schema, model, models } from "mongoose";

const vaultFileSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, immutable: true, index: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, immutable: true, index: true },
    folderId: { type: Schema.Types.ObjectId, ref: "VaultFolder", default: null, index: true },
    uploadId: { type: Schema.Types.ObjectId, ref: "VaultUpload", required: true, immutable: true, unique: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
    originalName: { type: String, required: true, trim: true, maxlength: 240 },
    storageKey: { type: String, required: true, unique: true, immutable: true },
    mimeType: { type: String, required: true, default: "application/octet-stream", maxlength: 160 },
    sizeBytes: { type: Number, required: true, min: 0 },
    // Logical/original file size and bytes stored in Bunny may differ after lossless compression.
    storageSizeBytes: { type: Number, min: 0 },
    contentEncoding: { type: String, enum: ["identity", "gzip"], default: "identity" },
    encryptionVersion: { type: String, enum: ["none", "aes-256-gcm-chunks-v1"], default: "none" }
  },
  { timestamps: true }
);

vaultFileSchema.index({ companyId: 1, workspaceId: 1, folderId: 1, createdAt: -1, _id: -1 });
vaultFileSchema.index({ companyId: 1, workspaceId: 1, folderId: 1, originalName: 1, _id: 1 });

export const VaultFile = models.VaultFile ?? model("VaultFile", vaultFileSchema);
