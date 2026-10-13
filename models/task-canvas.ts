import { Schema, model, models } from "mongoose";

const taskCanvasSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, immutable: true, index: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, immutable: true, index: true },
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true, index: true },
    memberUserIds: { type: [Schema.Types.ObjectId], ref: "User", required: true, default: [] },
    scene: { type: Schema.Types.Mixed, required: true, default: () => ({ elements: [], appState: {}, files: {} }) },
    version: { type: Number, required: true, default: 1, min: 1 },
    lastEditorUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    lastHistoryAt: { type: Date, default: null }
  },
  { timestamps: true, minimize: false }
);

taskCanvasSchema.index({ companyId: 1, workspaceId: 1, updatedAt: -1 });
taskCanvasSchema.index({ companyId: 1, workspaceId: 1, memberUserIds: 1 });
export const TaskCanvas = models.TaskCanvas ?? model("TaskCanvas", taskCanvasSchema);
