import { Schema, model, models } from "mongoose";
import { TASK_NOTIFICATION_TYPES } from "@/features/task-management/shared/constants";

const taskNotificationSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true, immutable: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true, immutable: true },
    taskId: { type: Schema.Types.ObjectId, ref: "Task", required: true, index: true, immutable: true },
    recipientUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true, immutable: true },
    actorUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
    type: {
      type: String,
      enum: [...TASK_NOTIFICATION_TYPES],
      required: true,
      index: true
    },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    message: { type: String, required: true, trim: true, maxlength: 400 },
    eventKey: { type: String, required: true, maxlength: 240 },
    readAt: { type: Date, default: null }
  },
  { timestamps: true }
);

taskNotificationSchema.index({ eventKey: 1 }, { unique: true });
taskNotificationSchema.index({ companyId: 1, workspaceId: 1, recipientUserId: 1, createdAt: -1, _id: -1 });
taskNotificationSchema.index({ recipientUserId: 1, readAt: 1, createdAt: -1 });

export const TaskNotification =
  models.TaskNotification ?? model("TaskNotification", taskNotificationSchema);
