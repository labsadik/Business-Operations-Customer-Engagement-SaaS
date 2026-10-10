import { Schema, model, models } from "mongoose";

const vaultUploadSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, immutable: true, index: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, immutable: true, index: true },
    folderId: { type: Schema.Types.ObjectId, ref: "VaultFolder", default: null },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
    originalName: { type: String, required: true, trim: true, maxlength: 240 },
    mimeType: { type: String, required: true, default: "application/octet-stream", maxlength: 160 },
    sizeBytes: { type: Number, required: true, min: 1 },
    originalSizeBytes: { type: Number, min: 1 },
    contentEncoding: { type: String, enum: ["identity", "gzip"], default: "identity" },
    chunkSizeBytes: { type: Number, required: true, min: 1 },
    expectedChunks: { type: Number, required: true, min: 1 },
    receivedChunks: { type: [Number], default: [] },
    storageRoot: { type: String, required: true },
    storageBaseKey: { type: String, required: true },
    status: { type: String, enum: ["OPEN", "COMPLETING", "COMPLETED"], default: "OPEN", required: true, index: true },
    expiresAt: { type: Date, required: true, index: true }
  },
  { timestamps: true }
);

vaultUploadSchema.index({ companyId: 1, workspaceId: 1, expiresAt: 1 });

export const VaultUpload = models.VaultUpload ?? model("VaultUpload", vaultUploadSchema);
