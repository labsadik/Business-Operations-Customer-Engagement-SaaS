import { Types } from "mongoose";
import { TaskActivity } from "@/models/task-activity";
import { TaskNotification } from "@/models/task-notification";
import type { TaskActivityEventType, TaskNotificationType } from "../shared/constants";
import type { TaskScope } from "./task-authorization";
import { publishTaskRealtime } from "@/lib/task-realtime";

export type TaskNotificationDraft = {
  recipientUserId: string;
  type: TaskNotificationType;
  title: string;
  message: string;
  eventKey: string;
};

export async function recordTaskEvent(input: {
  scope: TaskScope;
  taskId: string;
  eventType: TaskActivityEventType;
  actorUserId: string;
  subjectUserId?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  details?: Record<string, unknown>;
  notifications?: TaskNotificationDraft[];
}) {
  const now = new Date();
  const activityPromise = TaskActivity.create({
    companyId: new Types.ObjectId(input.scope.companyId),
    workspaceId: new Types.ObjectId(input.scope.workspaceId),
    taskId: new Types.ObjectId(input.taskId),
    actorUserId: new Types.ObjectId(input.actorUserId),
    subjectUserId: input.subjectUserId ? new Types.ObjectId(input.subjectUserId) : null,
    eventType: input.eventType,
    fromStatus: input.fromStatus ?? null,
    toStatus: input.toStatus ?? null,
    details: input.details ?? {},
    occurredAt: now
  });

  const notificationDrafts = (input.notifications ?? []).filter((item) => item.recipientUserId);
  const notificationPromise = notificationDrafts.length
    ? TaskNotification.insertMany(notificationDrafts.map((item) => ({
        companyId: new Types.ObjectId(input.scope.companyId),
        workspaceId: new Types.ObjectId(input.scope.workspaceId),
        taskId: new Types.ObjectId(input.taskId),
        recipientUserId: new Types.ObjectId(item.recipientUserId),
        actorUserId: new Types.ObjectId(input.actorUserId),
        type: item.type,
        title: item.title.slice(0, 160),
        message: item.message.slice(0, 400),
        eventKey: item.eventKey.slice(0, 240),
        readAt: null
      })), { ordered: true })
    : Promise.resolve([]);

  await Promise.all([activityPromise, notificationPromise]);
  publishTaskRealtime({
    companyId: input.scope.companyId,
    workspaceId: input.scope.workspaceId,
    taskId: input.taskId,
    eventType: input.eventType,
    occurredAt: now.toISOString()
  });
}
