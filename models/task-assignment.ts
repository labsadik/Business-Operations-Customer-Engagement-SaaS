import { Schema, model, models } from "mongoose";

const taskAssignmentSchema = new Schema(
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
    taskId: {
      type: Schema.Types.ObjectId,
      ref: "Task",
      required: true,
      index: true,
      immutable: true
    },
    assigneeUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
      immutable: true
    },
    assignedByUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true
    },
    status: {
      type: String,
      enum: ["TODO", "IN_PROGRESS", "BLOCKED", "IN_REVIEW", "COMPLETED", "CANCELLED"],
      default: "TODO",
      required: true,
      index: true
    },
    assignedAt: { type: Date, required: true, default: Date.now, immutable: true },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    statusChangedAt: { type: Date, required: true, default: Date.now }
  },
  { timestamps: true }
);

taskAssignmentSchema.index({ taskId: 1, assigneeUserId: 1 }, { unique: true });
taskAssignmentSchema.index({ companyId: 1, workspaceId: 1, assigneeUserId: 1, status: 1, updatedAt: -1 });
taskAssignmentSchema.index({ companyId: 1, workspaceId: 1, taskId: 1, assignedAt: 1 });

export const TaskAssignment =
  models.TaskAssignment ?? model("TaskAssignment", taskAssignmentSchema);
