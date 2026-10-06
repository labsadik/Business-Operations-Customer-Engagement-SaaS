"use client";

import { useEffect, useMemo, useState } from "react";
import { Megaphone, X } from "lucide-react";

type Announcement = {
  id: string;
  title: string;
  message: string;
  audience?: string;
  publishedAt?: string | null;
  createdAt?: string;
};

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
    // A dismissed banner is a convenience; storage failure must not affect core use.
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
  const [loading, setLoading] = useState(!initialAnnouncements.length && Boolean(endpoint));
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDismissed(getDismissed(scope));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [scope]);

  useEffect(() => {
    if (initialAnnouncements.length) return;
    let active = true;
    const controller = new AbortController();

    void fetch(endpoint, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("ANNOUNCEMENTS_UNAVAILABLE");
        const body = await response.json();
        return Array.isArray(body.data) ? body.data as Announcement[] : [];
      })
      .then((next) => {
        if (active) setItems(next);
      })
      .catch(() => {
        if (active) setItems([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [endpoint, initialAnnouncements.length]);

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

  if (loading || !visible.length) return null;

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
                  <span className={isLanding ? "text-[10px] text-slate-400" : "text-[10px] text-slate-400"}>
                    Announcement
                  </span>
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
