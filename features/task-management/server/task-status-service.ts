import { Types } from "mongoose";
import { Task } from "@/models/task";
import { TaskAssignment } from "@/models/task-assignment";
import type { TaskStatus } from "../shared/constants";

export async function recomputeTaskAggregate(input: {
  taskId: string;
  companyId: string;
  workspaceId: string;
}) {
  const assignments = await TaskAssignment.find({
    taskId: new Types.ObjectId(input.taskId),
    companyId: new Types.ObjectId(input.companyId),
    workspaceId: new Types.ObjectId(input.workspaceId)
  }).select("status startedAt completedAt").lean();

  const statuses = assignments.map((item) => item.status as TaskStatus);
  let status: TaskStatus = "TODO";
  if (statuses.length > 0 && statuses.every((item) => item === "COMPLETED")) {
    status = "COMPLETED";
  } else if (statuses.length > 0 && statuses.every((item) => item === "CANCELLED")) {
    status = "CANCELLED";
  } else if (statuses.includes("IN_PROGRESS")) {
    status = "IN_PROGRESS";
  } else if (statuses.includes("BLOCKED")) {
    status = "BLOCKED";
  } else if (statuses.includes("IN_REVIEW")) {
    status = "IN_REVIEW";
  } else if (statuses.length > 0 && statuses.every((item) => item === "COMPLETED" || item === "CANCELLED")) {
    status = statuses.includes("CANCELLED") ? "CANCELLED" : "COMPLETED";
  }

  const startedTimes = assignments.map((item) => item.startedAt?.getTime()).filter((time): time is number => typeof time === "number");
  const completedTimes = assignments.map((item) => item.completedAt?.getTime()).filter((time): time is number => typeof time === "number");
  const startedAt = startedTimes.length ? new Date(Math.min(...startedTimes)) : null;
  const completedAt = status === "COMPLETED" && completedTimes.length
    ? new Date(Math.max(...completedTimes))
    : null;
  const cancelledAt = status === "CANCELLED" ? new Date() : null;

  await Task.updateOne(
    {
      _id: new Types.ObjectId(input.taskId),
      companyId: new Types.ObjectId(input.companyId),
      workspaceId: new Types.ObjectId(input.workspaceId)
    },
    { $set: { status, startedAt, completedAt, cancelledAt } }
  );

  return { status, startedAt, completedAt, assignmentCount: assignments.length };
}
