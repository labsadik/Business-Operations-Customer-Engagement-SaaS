"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "conventus:workspace-sidebar-collapsed";

/** Keeps the desktop sidebar width consistent when navigating between workspace pages. */
export function useWorkspaceSidebarState() {
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "true");
    } catch {
      // Storage may be disabled by the browser; the sidebar still works for this session.
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, String(collapsed));
    } catch {
      // Persisting the preference is optional and must never block navigation.
    }
  }, [collapsed, ready]);

  return {
    collapsed,
    toggle: () => setCollapsed((value) => !value)
  };
}
