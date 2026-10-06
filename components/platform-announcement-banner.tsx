"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Megaphone, RefreshCw, X } from "lucide-react";
import {
  parsePlatformAnnouncementResponse,
  type PlatformAnnouncementClientItem
} from "@/lib/platform-announcement-client";

type Announcement = PlatformAnnouncementClientItem;

const STORAGE_PREFIX = "conventus:dismissed-platform-announcements:v1";

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
  const [dismissed, setDismissed] = useState<Set<string>>(() => getDismissed(scope));

  const loadAnnouncements = useCallback(async () => {
    if (!endpoint) {
      setLoadState("ready");
      return;
    }

    const controller = new AbortController();

    try {
      const response = await fetch(endpoint, {
        cache: "no-store",
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
    void loadAnnouncements();
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
    storeDismissed(scope, next);
  }

  if (loadState === "loading") return null;

  if (loadState === "error" && surface === "dashboard") {
    return (
      <section
        className="border-y border-amber-100 bg-amber-50/90"
        aria-label="Platform announcements unavailable"
      >
        <div className="mx-auto max-w-[1600px] px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-white px-4 py-3 shadow-sm">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700" aria-hidden="true">
              <Megaphone className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-900">Platform announcements are temporarily unavailable.</p>
              <p className="mt-0.5 text-[11px] leading-5 text-slate-500">Your workspace continues to work normally. Retry to check for published announcements.</p>
            </div>
            <button
              type="button"
              onClick={retryAnnouncements}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <RefreshCw className="size-3.5" />
              Retry
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (!visible.length) return null;

  const isLanding = surface === "landing";

  return (
    <section
      className={
        isLanding
          ? "border-y border-slate-800 bg-slate-950 text-white"
          : "border-y border-blue-100 bg-blue-50/80"
      }
      aria-label="Platform announcements"
    >
      <div className="mx-auto max-w-[1600px] px-4 py-3 sm:px-6 sm:py-3.5 lg:px-8">
        <div className="space-y-2">
          {visible.slice(0, 5).map((item) => (
            <div
              key={item.id}
              className={
                isLanding
                  ? "flex items-start gap-3 rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3.5 sm:px-5"
                  : "flex items-start gap-3 rounded-2xl border border-blue-100 bg-white px-4 py-3 shadow-sm sm:px-5"
              }
            >
              <span
                className={
                  isLanding
                    ? "grid size-9 shrink-0 place-items-center rounded-xl bg-blue-600 text-white"
                    : "grid size-9 shrink-0 place-items-center rounded-xl bg-blue-600 text-white shadow-sm"
                }
                aria-hidden="true"
              >
                <Megaphone className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span
                    className={
                      isLanding
                        ? "text-[10px] font-bold uppercase tracking-[0.16em] text-blue-300"
                        : "text-[10px] font-bold uppercase tracking-[0.16em] text-blue-700"
                    }
                  >
                    Conventus platform
                  </span>
                  <span className="text-[10px] text-slate-400">Announcement</span>
                </div>
                <h2 className={isLanding ? "mt-1 text-sm font-semibold text-white" : "mt-1 text-sm font-semibold text-slate-950"}>
                  {item.title}
                </h2>
                <p
                  className={
                    isLanding
                      ? "mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-300"
                      : "mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-600"
                  }
                >
                  {item.message}
                </p>
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className={
                  isLanding
                    ? "grid size-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                    : "grid size-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                }
                aria-label={`Dismiss announcement: ${item.title}`}
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
