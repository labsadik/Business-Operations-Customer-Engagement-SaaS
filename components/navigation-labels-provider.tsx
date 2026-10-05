"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_NAVIGATION_LABELS,
  normalizeNavigationLabels,
  type NavigationLabels
} from "@/lib/navigation-labels";

type NavigationLabelsContextValue = {
  labels: NavigationLabels;
  refresh: () => Promise<void>;
  updateLabels: (value: unknown) => void;
};

const NavigationLabelsContext = createContext<NavigationLabelsContextValue | null>(null);

export default function NavigationLabelsProvider({
  children
}: {
  children: React.ReactNode;
}) {
  const [labels, setLabels] = useState<NavigationLabels>(DEFAULT_NAVIGATION_LABELS);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/navigation-settings", {
        cache: "no-store",
        headers: { accept: "application/json" }
      });
      if (!response.ok) return;
      const body = await response.json().catch(() => null);
      if (body?.data) setLabels(normalizeNavigationLabels(body.data));
    } catch {
      // Keep the current labels during transient network/database failures.
    }
  }, []);

  const updateLabels = useCallback((value: unknown) => {
    const next = normalizeNavigationLabels(value);
    setLabels(next);

    try {
      window.localStorage.setItem("conventus-navigation-labels", JSON.stringify(next));
      if ("BroadcastChannel" in window) {
        const channel = new BroadcastChannel("conventus-navigation");
        channel.postMessage(next);
        channel.close();
      }
    } catch {
      // Local browser sync is best-effort.
    }
  }, []);

  useEffect(() => {
    let timer: number | null = null;

    void refresh();

    const poll = () => {
      if (document.visibilityState === "visible") void refresh();
    };

    timer = window.setInterval(poll, 2500);

    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== "conventus-navigation-labels" || !event.newValue) return;
      try {
        setLabels(normalizeNavigationLabels(JSON.parse(event.newValue)));
      } catch {
        // Ignore malformed local state.
      }
    };

    let channel: BroadcastChannel | null = null;
    if ("BroadcastChannel" in window) {
      channel = new BroadcastChannel("conventus-navigation");
      channel.onmessage = (event) => setLabels(normalizeNavigationLabels(event.data));
    }

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("storage", onStorage);

    return () => {
      if (timer !== null) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("storage", onStorage);
      channel?.close();
    };
  }, [refresh]);

  const value = useMemo(
    () => ({ labels, refresh, updateLabels }),
    [labels, refresh, updateLabels]
  );

  return (
    <NavigationLabelsContext.Provider value={value}>
      {children}
    </NavigationLabelsContext.Provider>
  );
}

export function useNavigationLabels() {
  const context = useContext(NavigationLabelsContext);
  if (!context) {
    throw new Error("useNavigationLabels must be used inside NavigationLabelsProvider");
  }
  return context;
}
