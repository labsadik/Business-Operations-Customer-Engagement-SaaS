"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { clientFetch } from "@/lib/client-api";
import { ChevronDown, Megaphone, RefreshCw, X } from "lucide-react";
import {
  parsePlatformAnnouncementResponse,
  type PlatformAnnouncementClientItem
} from "@/lib/platform-announcement-client";

type Announcement = PlatformAnnouncementClientItem;

const STORAGE_PREFIX = "canvas:dismissed-platform-announcements:v1";

function getDismissed(scope: string) {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}:${scope}`);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((value) => typeof value === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function storeDismissed(scope: string, ids: Set<string>) {
  try {
    window.localStorage.setItem(
      `${STORAGE_PREFIX}:${scope}`,
      JSON.stringify([...ids].slice(-100))
    );
  } catch {
    // Dismissal is a convenience; storage failure must not affect core use.
  }
}

export default function PlatformAnnouncementBanner({
  initialAnnouncements = [],
  endpoint = "/api/company/platform-announcements",
  scope = "company",
  surface = "dashboard"
}: {
  initialAnnouncements?: Announcement[];
  endpoint?: string;
  scope?: string;
  surface?: "landing" | "dashboard";
}) {
  const [items, setItems] = useState<Announcement[]>(initialAnnouncements);
  const [loadState, setLoadState] = useState<"ready" | "loading" | "error">(
    !initialAnnouncements.length && Boolean(endpoint) ? "loading" : "ready"
  );
  const [dismissed, setDismissed] = useState<Set<string>>(() =>
    surface === "landing" ? new Set<string>() : getDismissed(scope)
  );

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const loadAnnouncements = useCallback(async () => {
    if (!endpoint) {
      setLoadState("ready");
      return;
    }

    const controller = new AbortController();

    try {
      const response = await clientFetch(endpoint, {
        signal: controller.signal
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error("ANNOUNCEMENTS_UNAVAILABLE");

      const next = parsePlatformAnnouncementResponse(body);
      setItems(next);
      setLoadState("ready");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setLoadState("error");
      if (process.env.NODE_ENV !== "production") {
        console.warn("[platform-announcement] read failed", { status: error instanceof Error ? error.name : "UNKNOWN" });
      }
    } finally {
      controller.abort();
    }
  }, [endpoint]);

  useEffect(() => {
    if (initialAnnouncements.length || !endpoint) return;
    const timer = window.setTimeout(() => {
      void loadAnnouncements();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [endpoint, initialAnnouncements.length, loadAnnouncements]);

  function retryAnnouncements() {
    setLoadState("loading");
    void loadAnnouncements();
  }

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" && loadState === "ready") {
      console.debug("[platform-announcement] state", {
        surface,
        loaded: items.length,
        dismissed: items.reduce((count, item) => count + (dismissed.has(item.id) ? 1 : 0), 0)
      });
    }
  }, [dismissed, items, loadState, surface]);

  const visible = useMemo(
    () => items.filter((item) => !dismissed.has(item.id)),
    [dismissed, items]
  );

  function dismiss(id: string) {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    if (surface !== "landing") {
      storeDismissed(scope, next);
    }
  }

  if (loadState === "loading") return null;

  if (loadState === "error" && surface === "dashboard") {
    return (
      <aside className="w-full border-b border-amber-200/80 bg-amber-50/90 text-amber-950">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 py-2.5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800" aria-hidden="true">
              <Megaphone className="size-4 animate-bounce" />
            </span>
            <p className="truncate text-sm font-medium tracking-tight">
              Platform announcements are temporarily unavailable.
            </p>
          </div>
          <button
            type="button"
            onClick={retryAnnouncements}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-300 bg-white/90 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <RefreshCw className="size-3.5" />
            Retry
          </button>
        </div>
      </aside>
    );
  }

  if (!visible.length) return null;

  const isLanding = surface === "landing";

  return (
    <aside
      className={
        isLanding
          ? "w-full border-b border-amber-200/80 bg-[#fff8e6] bg-gradient-to-r from-amber-50/90 via-white to-amber-50/90 text-slate-900"
          : "w-full border-b border-blue-200/80 bg-gradient-to-r from-blue-50/80 via-white to-blue-50/80 text-slate-900"
      }
      aria-label="Platform announcements"
    >
      <div className="mx-auto max-w-7xl px-5 py-2 sm:px-6 lg:px-8">
        <div className="divide-y divide-amber-200/40">
          {visible.slice(0, 5).map((item) => {
            const isExpanded = expandedIds.has(item.id);

            return (
              <div key={item.id} className="py-1.5 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-3">
                  {/* Left Side: Animated Megaphone Icon, Title & Chevron */}
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span
                      className={
                        isLanding
                          ? "relative flex size-7 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white shadow-xs"
                          : "relative flex size-7 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-xs"
                      }
                      aria-hidden="true"
                    >
                      <Megaphone className="size-4 animate-bounce [animation-duration:2s]" />
                    </span>

                    <button
                      type="button"
                      onClick={() => toggleExpand(item.id)}
                      className="group flex min-w-0 flex-1 items-center gap-2 text-left rounded-md py-0.5 px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                      aria-expanded={isExpanded}
                    >
                      <span className="truncate text-sm font-semibold tracking-tight text-slate-900 group-hover:text-amber-900 transition-colors">
                        {item.title}
                      </span>

                      <ChevronDown
                        className={`size-4 shrink-0 text-amber-700/80 transition-transform duration-200 ease-in-out group-hover:text-amber-950 ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                  </div>

                  {/* Right Side: Dismiss Button */}
                  <button
                    type="button"
                    onClick={() => dismiss(item.id)}
                    className={
                      isLanding
                        ? "flex size-7 shrink-0 items-center justify-center rounded-md text-amber-800/80 hover:bg-amber-200/50 hover:text-amber-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                        : "flex size-7 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-blue-100/80 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    }
                    aria-label={`Dismiss announcement: ${item.title}`}
                  >
                    <X className="size-4" />
                  </button>
                </div>

                {/* Smooth CSS Grid expander for Description */}
                <div
                  className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                    isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="mt-2 ml-10 pr-8 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap border-l-2 border-amber-300/80 pl-3 py-1 sm:text-base">
                      {item.message}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}