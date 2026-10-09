import { Types } from "mongoose";
import { after } from "next/server";
import { sendWebPushNotifications } from "@/lib/web-push";
import { TaskActivity } from "@/models/task-activity";
import { TaskNotification } from "@/models/task-notification";
import type { TaskNotificationType } from "../shared/constants";
import type { TaskScope } from "./task-authorization";

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
  eventType: "TASK_CREATED" | "TASK_UPDATED" | "ASSIGNEES_ADDED" | "ASSIGNEE_REMOVED" | "ASSIGNEE_STATUS_CHANGED";
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

  const [, createdNotifications] = await Promise.all([activityPromise, notificationPromise]);
  const pushEvents = createdNotifications
    .filter((item) => item.type === "TASK_ASSIGNED")
    .map((item) => ({
      userId: String(item.recipientUserId),
      payload: {
        id: String(item._id),
        type: "TASK_ASSIGNED" as const,
        title: item.title || "New task assigned",
        body: item.message || "A teammate assigned you a new task.",
        url: "/dashboard/tasks",
        tag: "conventus-task-" + String(item._id)
      }
    }));

  if (pushEvents.length) {
    after(async () => {
      try {
        await sendWebPushNotifications(pushEvents);
      } catch {
        // Push is best-effort and must not break task creation or assignment.
      }
    });
  }
}
