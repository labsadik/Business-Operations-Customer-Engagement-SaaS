import { Schema, model, models } from "mongoose";
import { TASK_ACTIVITY_EVENT_TYPES } from "@/features/task-management/shared/constants";

const taskActivitySchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true, immutable: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true, immutable: true },
    taskId: { type: Schema.Types.ObjectId, ref: "Task", required: true, index: true, immutable: true },
    actorUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    subjectUserId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    eventType: {
      type: String,
      enum: [...TASK_ACTIVITY_EVENT_TYPES],
      required: true,
      index: true
    },
    fromStatus: { type: String, default: null },
    toStatus: { type: String, default: null },
    details: { type: Schema.Types.Mixed, default: () => ({}) },
    occurredAt: { type: Date, required: true, default: Date.now, index: true }
  },
  { timestamps: true }
);

taskActivitySchema.index({ companyId: 1, workspaceId: 1, taskId: 1, occurredAt: -1, _id: -1 });
taskActivitySchema.index({ companyId: 1, workspaceId: 1, occurredAt: -1, _id: -1 });

export const TaskActivity = models.TaskActivity ?? model("TaskActivity", taskActivitySchema);
