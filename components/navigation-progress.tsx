"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const MAX_WAIT_MS = 8000;

function isModifiedClick(event: MouseEvent) {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

function isInternalNavigation(anchor: HTMLAnchorElement) {
  if (!anchor.href || anchor.target === "_blank" || anchor.hasAttribute("download")) return false;

  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return false;

  const current = new URL(window.location.href);
  url.hash = "";
  current.hash = "";

  return url.href !== current.href;
}

export default function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const finishTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const bar = document.querySelector<HTMLElement>("[data-conventus-nav-progress]");
    const status = document.querySelector<HTMLElement>("[data-conventus-nav-status]");
    if (!bar) return;

    const stopTimers = () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      if (finishTimerRef.current !== null) window.clearTimeout(finishTimerRef.current);
      timerRef.current = null;
      finishTimerRef.current = null;
    };

    const finish = () => {
      if (!activeRef.current) return;
      stopTimers();
      activeRef.current = false;
      bar.style.transform = "scaleX(1)";
      finishTimerRef.current = window.setTimeout(() => {
        bar.style.opacity = "0";
        bar.dataset.active = "false";
        if (status) status.textContent = "";
      }, 220);
    };

    const start = () => {
      stopTimers();
      activeRef.current = true;
      bar.style.transform = "scaleX(0.18)";
      bar.style.opacity = "1";
      bar.dataset.active = "true";
      if (status) status.textContent = "Loading next page";

      requestAnimationFrame(() => {
        if (activeRef.current) bar.style.transform = "scaleX(0.72)";
      });

      timerRef.current = window.setTimeout(finish, MAX_WAIT_MS);
    };

    const onClick = (event: MouseEvent) => {
      if (isModifiedClick(event)) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (anchor instanceof HTMLAnchorElement && isInternalNavigation(anchor)) start();
    };

    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    window.history.pushState = function patchedPushState(
      ...args: Parameters<History["pushState"]>
    ) {
      start();
      return originalPushState.apply(this, args);
    };

    window.history.replaceState = function patchedReplaceState(
      ...args: Parameters<History["replaceState"]>
    ) {
      start();
      return originalReplaceState.apply(this, args);
    };

    window.addEventListener("click", onClick, true);
    window.addEventListener("popstate", start);

    return () => {
      stopTimers();
      activeRef.current = false;
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", start);
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
    };
  }, []);

  useEffect(() => {
    const bar = document.querySelector<HTMLElement>("[data-conventus-nav-progress]");
    if (!bar || !activeRef.current) return;

    activeRef.current = false;
    bar.style.transform = "scaleX(1)";
    const timer = window.setTimeout(() => {
      bar.style.opacity = "0";
      bar.dataset.active = "false";
      const status = document.querySelector<HTMLElement>("[data-conventus-nav-status]");
      if (status) status.textContent = "";
    }, 220);

    return () => window.clearTimeout(timer);
  }, [pathname, searchParams]);

  return null;
}