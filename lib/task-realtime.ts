export type TaskRealtimeMessage = {
  type: "task.changed" | "board.changed";
  companyId: string;
  workspaceId: string;
  taskId?: string;
  eventType: string;
  occurredAt: string;
};
export type TaskRealtimeSubscriber = {
  companyId: string;
  workspaceId: string;
  send: (message: TaskRealtimeMessage) => void;
};
type HubState = { subscribers: Set<TaskRealtimeSubscriber> };
const HUB_KEY = Symbol.for("canvas.task.realtime.hub.v1");
function getHub(): HubState {
  const root = globalThis as unknown as Record<PropertyKey, unknown>;
  if (!root[HUB_KEY]) root[HUB_KEY] = { subscribers: new Set<TaskRealtimeSubscriber>() } satisfies HubState;
  return root[HUB_KEY] as HubState;
}
export function subscribeTaskRealtime(subscriber: TaskRealtimeSubscriber) {
  const hub = getHub();
  hub.subscribers.add(subscriber);
  return () => hub.subscribers.delete(subscriber);
}
export function publishTaskRealtime(input: {
  companyId: string;
  workspaceId: string;
  taskId?: string;
  eventType: string;
  board?: boolean;
  occurredAt?: string;
}) {
  const message: TaskRealtimeMessage = {
    type: input.board ? "board.changed" : "task.changed",
    companyId: input.companyId,
    workspaceId: input.workspaceId,
    ...(input.taskId ? { taskId: input.taskId } : {}),
    eventType: input.eventType,
    occurredAt: input.occurredAt ?? new Date().toISOString()
  };
  for (const subscriber of getHub().subscribers) {
    if (subscriber.companyId !== message.companyId || subscriber.workspaceId !== message.workspaceId) continue;
    try {
      subscriber.send(message);
    } catch {
      getHub().subscribers.delete(subscriber);
    }
  }
}
