"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { clientApi } from "@/lib/client-api";

const ENABLED_STORAGE_PREFIX = "conventus:desktop-alerts:enabled:";
const SEEN_STORAGE_PREFIX = "conventus:desktop-alerts:seen:";
const TASK_POLL_VISIBLE_MS = 60_000;
const TASK_POLL_HIDDEN_MS = 120_000;

export type DesktopNotificationEvent = {
  id: string;
  title: string;
  message: string;
  type?: string;
  createdAt?: string;
};

type MeetingAlert = {
  id: string;
  status: string;
  startAt: string;
  createdAt: string;
  assignedEmployeeId: string | null;
};

function enabledStorageKey(userId: string) {
  return ENABLED_STORAGE_PREFIX + userId;
}

export function isDesktopNotificationsEnabled(userId: string) {
  if (typeof window === "undefined" || typeof Notification === "undefined") return false;
  try {
    return (
      window.localStorage.getItem(enabledStorageKey(userId)) === "1" &&
      Notification.permission === "granted"
    );
  } catch {
    return false;
  }
}

function dispatchPreferenceChanged() {
  window.dispatchEvent(new Event("conventus:desktop-alerts-changed"));
}

type PushSetupResult = "enabled" | "not-configured" | "failed";

async function ensureWebPushSubscription(): Promise<PushSetupResult> {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return "not-configured";
  await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
    updateViaCache: "none"
  });
  const registration = await navigator.serviceWorker.ready;
  const pushConfig = await clientApi<{ enabled: boolean; publicKey: string | null }>(
    "/api/notifications/push"
  );
  if (!pushConfig.enabled || !pushConfig.publicKey) return "not-configured";

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    const paddedKey = pushConfig.publicKey.replace(/-/g, "+").replace(/_/g, "/");
    const binaryKey = window.atob(paddedKey);
    const applicationServerKey = Uint8Array.from(binaryKey, (character) => character.charCodeAt(0));
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey
    });
  }

  await clientApi("/api/notifications/push", {
    method: "POST",
    body: JSON.stringify(subscription.toJSON())
  });
  return "enabled";
}

export function getUnseenDesktopNotificationIds(
  userId: string,
  channel: "tasks" | "meetings",
  ids: string[]
) {
  const key = SEEN_STORAGE_PREFIX + userId + ":" + channel;
  const uniqueIds = [...new Set(ids.filter(Boolean))].slice(-30);
  try {
    const raw = window.localStorage.getItem(key);
    const prior = raw ? JSON.parse(raw) as unknown : null;
    const seen = new Set(
      Array.isArray(prior)
        ? prior.filter((value): value is string => typeof value === "string")
        : []
    );

    // First check establishes a baseline so old items don't arrive as new alerts
    // after enabling notifications or opening the app in another tab.
    if (raw === null) {
      window.localStorage.setItem(key, JSON.stringify(uniqueIds));
      return [];
    }

    const unseen = uniqueIds.filter((id) => !seen.has(id));
    for (const id of uniqueIds) seen.add(id);
    window.localStorage.setItem(key, JSON.stringify([...seen].slice(-100)));
    return unseen;
  } catch {
    return [];
  }
}

export function sendDesktopNotification(
  userId: string,
  event: { title: string; body: string; url: string; tag: string }
) {
  if (!isDesktopNotificationsEnabled(userId)) return;
  void (async () => {
    try {
      if ("serviceWorker" in navigator && window.isSecureContext) {
        try {
          const registration = await navigator.serviceWorker.ready;
          await registration.showNotification(event.title, {
            body: event.body,
            icon: "/favicon.svg",
            badge: "/favicon.svg",
            tag: event.tag,
            data: { url: event.url }
          });
          return;
        } catch {
          // Fall through to Notification if the worker can't display an alert.
        }
      }

      const notification = new Notification(event.title, {
        body: event.body,
        icon: "/favicon.svg",
        tag: event.tag
      });
      notification.onclick = () => {
        window.focus();
        if (event.url.startsWith("/") && !event.url.startsWith("//")) {
          window.location.assign(event.url);
        }
        notification.close();
      };
    } catch {
      // Browser/OS notification settings may reject delivery; app work continues.
    }
  })();
}

export default function DesktopNotificationCenter({
  userId,
  taskManagementEnabled
}: {
  userId: string;
  taskManagementEnabled: boolean;
}) {
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported" | "unknown">("unknown");
  const [message, setMessage] = useState("");

  const syncPreference = useCallback(() => {
    const supported = typeof window !== "undefined" && "Notification" in window;
    setPermission(supported ? Notification.permission : "unsupported");
    setEnabled(isDesktopNotificationsEnabled(userId));
  }, [userId]);

  useEffect(() => {
    if ("serviceWorker" in navigator && window.isSecureContext) {
      void navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none"
      }).then(async () => {
        // Existing users who already opted in are enrolled automatically when VAPID
        // is configured, rather than having to discover and toggle alerts again.
        if (isDesktopNotificationsEnabled(userId)) {
          await ensureWebPushSubscription();
        }
      }).catch(() => {
        if (isDesktopNotificationsEnabled(userId)) {
          setMessage("Desktop alerts still work while this tab is open, but background push could not be registered. Toggle alerts off/on to retry.");
        }
      });
    }
    const initialSync = window.setTimeout(syncPreference, 0);
    window.addEventListener("conventus:desktop-alerts-changed", syncPreference);
    return () => {
      window.clearTimeout(initialSync);
      window.removeEventListener("conventus:desktop-alerts-changed", syncPreference);
    };
  }, [syncPreference]);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    let timer: number | undefined;

    async function poll() {
      if (!active || inFlight || !isDesktopNotificationsEnabled(userId)) return;
      inFlight = true;
      try {
        const taskRequest = taskManagementEnabled
          ? clientApi<{ items: DesktopNotificationEvent[] }>(
              "/api/tasks/notifications?desktop=1&limit=10"
            )
          : Promise.resolve({ items: [] as DesktopNotificationEvent[] });
        const [taskResult, meetingResult] = await Promise.allSettled([
          taskRequest,
          clientApi<{ items: MeetingAlert[] }>(
            "/api/employee/requests?notifications=true&limit=10"
          )
        ]);

        if (!active) return;

        if (taskResult.status === "fulfilled") {
          const items = taskResult.value.items ?? [];
          const unseen = new Set(getUnseenDesktopNotificationIds(
            userId,
            "tasks",
            items.map((item) => item.id)
          ));
          for (const item of items) {
            if (item.type !== "TASK_ASSIGNED" || !unseen.has(item.id)) continue;
            sendDesktopNotification(userId, {
              title: item.title || "New task assigned",
              body: item.message || "A teammate assigned you a new task.",
              url: "/dashboard/tasks",
              tag: "conventus-task-" + item.id
            });
          }
        }

        if (meetingResult.status === "fulfilled") {
          const items = meetingResult.value.items ?? [];
          const unseen = new Set(getUnseenDesktopNotificationIds(
            userId,
            "meetings",
            items.map((item) => item.id)
          ));
          for (const item of items) {
            if (!unseen.has(item.id)) continue;
            const assignedToMe = item.assignedEmployeeId === userId;
            const start = new Date(item.startAt);
            const when = Number.isNaN(start.getTime())
              ? ""
              : " Starts " + start.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) + ".";
            sendDesktopNotification(userId, {
              title: assignedToMe ? "A meeting was assigned to you" : "New public meeting request",
              body: assignedToMe
                ? "A public booking is now assigned to you." + when
                : "A new public meeting request is available for your team." + when,
              url: "/dashboard?panel=meetings",
              tag: "conventus-meeting-" + item.id
            });
          }
        }
      } catch {
        // Notification polling is best-effort and must never interrupt the workspace.
      } finally {
        inFlight = false;
      }
    }

    const schedule = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      const delay = document.visibilityState === "visible"
        ? TASK_POLL_VISIBLE_MS
        : TASK_POLL_HIDDEN_MS;
      timer = window.setTimeout(async () => {
        await poll();
        if (active) schedule();
      }, delay);
    };
    const refreshWhenAvailable = () => {
      if (document.visibilityState === "visible" && isDesktopNotificationsEnabled(userId)) {
        void poll();
      }
      schedule();
    };
    const onPreferenceChanged = () => {
      if (isDesktopNotificationsEnabled(userId)) void poll();
      schedule();
    };

    if (isDesktopNotificationsEnabled(userId)) void poll();
    schedule();
    document.addEventListener("visibilitychange", refreshWhenAvailable);
    window.addEventListener("focus", refreshWhenAvailable);
    window.addEventListener("conventus:desktop-alerts-changed", onPreferenceChanged);

    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", refreshWhenAvailable);
      window.removeEventListener("focus", refreshWhenAvailable);
      window.removeEventListener("conventus:desktop-alerts-changed", onPreferenceChanged);
    };
  }, [taskManagementEnabled, userId]);

  async function toggle() {
    setMessage("");
    if (enabled) {
      try { window.localStorage.removeItem(enabledStorageKey(userId)); } catch { /* storage may be disabled */ }
      setEnabled(false);
      if ("serviceWorker" in navigator) {
        try {
          const registration = await navigator.serviceWorker.ready;
          const subscription = await registration.pushManager.getSubscription();
          if (subscription) {
            await clientApi("/api/notifications/push", {
              method: "DELETE",
              body: JSON.stringify({ endpoint: subscription.endpoint })
            }).catch(() => null);
            await subscription.unsubscribe();
          }
        } catch {
          // The account preference is off even if a stale push subscription cannot be removed.
        }
      }
      setMessage("Desktop alerts are off for this account.");
      dispatchPreferenceChanged();
      return;
    }

    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermission("unsupported");
      setMessage("This browser does not support desktop notifications.");
      return;
    }

    let result: NotificationPermission = Notification.permission;
    if (result === "default") {
      try {
        result = await Notification.requestPermission();
      } catch {
        result = "denied";
      }
    }
    setPermission(result);
    if (result !== "granted") {
      setMessage(result === "denied"
        ? "Notifications are blocked by browser settings. Allow them for this site, then try again."
        : "Desktop notification permission was not granted.");
      return;
    }

    let pushSetup: PushSetupResult = "not-configured";
    try {
      if ("serviceWorker" in navigator && window.isSecureContext) {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none"
        });
        // Start subscription while still handling this click, then show immediate feedback.
        const pushSetupPromise = ensureWebPushSubscription().catch(() => "failed" as const);
        try {
          await registration.showNotification("Conventus desktop alerts are on", {
            body: "You’ll receive new task assignment and public meeting alerts here.",
            icon: "/favicon.svg",
            badge: "/favicon.svg",
            tag: "conventus-notifications-test",
            data: { url: "/dashboard" }
          });
        } catch {
          new Notification("Conventus desktop alerts are on", {
            body: "You’ll receive task assignment and public meeting alerts here.",
            icon: "/favicon.svg"
          });
        }
        // Push enrollment is best-effort; open-tab alerts still work without VAPID keys.
        pushSetup = await pushSetupPromise;
      } else {
        try {
          new Notification("Conventus desktop alerts are on", {
            body: "Alerts are enabled for this open browser.",
            icon: "/favicon.svg"
          });
        } catch {
          // Browser/OS notification settings may reject the test notification.
        }
      }
    } catch {
      setMessage("Browser permission is granted, but this browser could not display a test notification. Check the site's notification and operating-system settings.");
      return;
    }

    try { window.localStorage.setItem(enabledStorageKey(userId), "1"); } catch { /* storage may be disabled */ }
    setEnabled(true);
    setMessage(pushSetup === "enabled"
      ? "Desktop push is enabled for new task assignments and public meeting requests."
      : pushSetup === "failed"
        ? "Desktop alerts are on, but background push registration failed. Check the connection and toggle alerts off/on to retry."
        : "Desktop alerts are on. Background push is not configured on the server yet.");
    dispatchPreferenceChanged();
  }

  const supported = permission !== "unsupported";
  const label = enabled
    ? "Desktop alerts on"
    : permission === "denied"
      ? "Notifications blocked"
      : "Enable desktop alerts";

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void toggle()}
        aria-pressed={enabled}
        title={enabled
          ? "Turn off desktop notifications"
          : permission === "denied"
            ? "Allow notifications in your browser's site settings"
            : "Enable desktop notifications for task assignments and meeting requests"}
        className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        {enabled ? <Bell className="size-4 text-blue-600" aria-hidden="true" /> : <BellOff className="size-4 text-slate-500" aria-hidden="true" />}
        <span className="hidden xl:inline">{label}</span>
        <span className="sr-only xl:hidden">{label}</span>
      </button>
      {message && <p aria-live="polite" className="max-w-60 text-right text-[10px] text-slate-500">{message}</p>}
      {!supported && <p className="sr-only">Desktop notifications are unsupported in this browser.</p>}
    </div>
  );
}
