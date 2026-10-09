import { Schema, model, models } from "mongoose";

const taskDailyUsageSchema = new Schema(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      immutable: true
    },
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      immutable: true
    },
    dayKey: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/
    },
    count: { type: Number, required: true, default: 0, min: 0 },
    expiresAt: { type: Date, required: true }
  },
  { timestamps: true }
);

taskDailyUsageSchema.index(
  { companyId: 1, workspaceId: 1, dayKey: 1 },
  { unique: true }
);
taskDailyUsageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const TaskDailyUsage =
  models.TaskDailyUsage ?? model("TaskDailyUsage", taskDailyUsageSchema);
