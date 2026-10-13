import { Schema, model, models } from "mongoose";

const taskCanvasRevisionSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, immutable: true, index: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, immutable: true, index: true },
    canvasId: { type: Schema.Types.ObjectId, ref: "TaskCanvas", required: true, immutable: true, index: true },
    version: { type: Number, required: true, min: 1 },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    scene: { type: Schema.Types.Mixed, required: true, select: false },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true }
  },
  { timestamps: true, minimize: false }
);

taskCanvasRevisionSchema.index({ canvasId: 1, companyId: 1, workspaceId: 1, createdAt: -1 });
taskCanvasRevisionSchema.index({ companyId: 1, createdAt: -1, _id: -1 });
export const TaskCanvasRevision = models.TaskCanvasRevision ?? model("TaskCanvasRevision", taskCanvasRevisionSchema);
