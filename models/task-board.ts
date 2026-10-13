import { Schema, model, models } from "mongoose";
import { TASK_SPRINT_STATUSES } from "@/features/task-management/shared/constants";

const taskBoardSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, immutable: true, index: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, immutable: true, index: true },
    sprintName: { type: String, required: true, trim: true, minlength: 1, maxlength: 80, default: "Sprint 1" },
    sprintGoal: { type: String, trim: true, maxlength: 500, default: "" },
    sprintStartsAt: { type: Date, default: null },
    sprintEndsAt: { type: Date, default: null },
    sprintStatus: { type: String, enum: [...TASK_SPRINT_STATUSES], default: "PLANNING", required: true },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true }
  },
  { timestamps: true }
);
taskBoardSchema.index({ companyId: 1, workspaceId: 1 }, { unique: true });
export const TaskBoard = models.TaskBoard ?? model("TaskBoard", taskBoardSchema);
