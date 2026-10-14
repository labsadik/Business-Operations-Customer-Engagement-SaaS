import { Schema, model, models } from "mongoose";

const taskCanvasSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, immutable: true, index: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, immutable: true, index: true },
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true, index: true },
    memberUserIds: { type: [Schema.Types.ObjectId], ref: "User", required: true, default: [] },
    // Legacy uncompressed scenes remain readable during the gradual migration.
    scene: { type: Schema.Types.Mixed, required: false, default: undefined },
    // New scenes are gzip-compressed before persistence to keep large vector
    // diagrams compact and avoid repeatedly storing verbose JSON in MongoDB.
    sceneGzip: { type: Buffer, required: false },
    version: { type: Number, required: true, default: 1, min: 1 },
    lastEditorUserId: { type: Schema.Types.ObjectId, ref: "User", required: true }
  },
  { timestamps: true, minimize: false }
);

taskCanvasSchema.index({ companyId: 1, workspaceId: 1, updatedAt: -1 });
taskCanvasSchema.index({ companyId: 1, workspaceId: 1, memberUserIds: 1 });
export const TaskCanvas = models.TaskCanvas ?? model("TaskCanvas", taskCanvasSchema);
