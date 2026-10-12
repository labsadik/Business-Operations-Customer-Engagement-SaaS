"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "canvas:workspace-sidebar-collapsed";
const listeners = new Set<() => void>();

function getCollapsedSnapshot() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function subscribeToCollapsed(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getServerCollapsedSnapshot() {
  return false;
}

function writeCollapsedSnapshot(collapsed: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(collapsed));
  } catch {
    // Persisting the preference is optional and must never block navigation.
  }
  // The storage event doesn't fire in the tab that made the change.
  listeners.forEach((listener) => listener());
}

/** Keeps the desktop sidebar width consistent when navigating between workspace pages. */
export function useWorkspaceSidebarState() {
  const collapsed = useSyncExternalStore(
    subscribeToCollapsed,
    getCollapsedSnapshot,
    getServerCollapsedSnapshot
  );

  const toggle = useCallback(() => {
    writeCollapsedSnapshot(!getCollapsedSnapshot());
  }, []);

  return { collapsed, toggle };
}
