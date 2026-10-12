import { Schema, model, models } from "mongoose";

const taskSchema = new Schema(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
      immutable: true
    },
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
      immutable: true
    },
    createdByUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
      immutable: true
    },
    title: { type: String, required: true, trim: true, minlength: 1, maxlength: 160 },
    description: { type: String, default: "", trim: true, maxlength: 5000 },
    priority: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "URGENT"],
      default: "MEDIUM",
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ["TODO", "IN_PROGRESS", "BLOCKED", "IN_REVIEW", "COMPLETED", "CANCELLED"],
      default: "TODO",
      required: true,
      index: true
    },
    dueAt: { type: Date, default: null, index: true },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null }
  },
  { timestamps: true }
);

taskSchema.index({ companyId: 1, workspaceId: 1, createdAt: -1, _id: -1 });
taskSchema.index({ companyId: 1, workspaceId: 1, status: 1, createdAt: -1, _id: -1 });
taskSchema.index({ companyId: 1, workspaceId: 1, createdByUserId: 1, createdAt: -1, _id: -1 });

export const Task = models.Task ?? model("Task", taskSchema);
