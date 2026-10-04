"use client";

import { useEffect, useRef, useState } from "react";
import { Cookie, ShieldCheck, X } from "lucide-react";
import { usePathname } from "next/navigation";

const STORAGE_KEY = "conventus_cookie_consent";
const CONSENT_VERSION = "2026-10-04";

type ConsentChoice = "accept-all" | "reject-optional" | "custom";

type ConsentRecord = {
  version: string;
  timestamp: string;
  choice: ConsentChoice;
  essential: true;
};

const RESERVED_ROOT_SEGMENTS = new Set([
  "admin",
  "api",
  "dashboard",
  "billing",
  "settings",
  "docs"
]);

function isPublicPath(pathname: string | null) {
  if (!pathname) return false;

  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return true;

  if (segments.length === 1 && ["login", "terms", "privacy"].includes(segments[0])) {
    return true;
  }

  if (segments.length === 2 && segments[1] === "login") {
    return !RESERVED_ROOT_SEGMENTS.has(segments[0]);
  }

  return segments.length === 1 && !RESERVED_ROOT_SEGMENTS.has(segments[0]);
}

function readConsent(): ConsentRecord | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<ConsentRecord>;
    if (
      parsed.version !== CONSENT_VERSION ||
      typeof parsed.timestamp !== "string" ||
      !["accept-all", "reject-optional", "custom"].includes(String(parsed.choice))
    ) {
      return null;
    }

    return {
      version: CONSENT_VERSION,
      timestamp: parsed.timestamp,
      choice: parsed.choice as ConsentChoice,
      essential: true
    };
  } catch {
    return null;
  }
}

function saveConsent(choice: ConsentChoice): ConsentRecord {
  const record: ConsentRecord = {
    version: CONSENT_VERSION,
    timestamp: new Date().toISOString(),
    choice,
    essential: true
  };

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Browser storage can be unavailable. The banner remains usable for the
    // current visit and will simply appear again later.
  }

  return record;
}

export default function CookieConsent() {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [consent, setConsent] = useState<ConsentRecord | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFocusableRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setConsent(readConsent());
    setReady(true);

    const openSettings = () => setSettingsOpen(true);
    window.addEventListener("conventus:open-cookie-settings", openSettings);

    return () => {
      window.removeEventListener("conventus:open-cookie-settings", openSettings);
    };
  }, []);

  useEffect(() => {
    if (!settingsOpen) return;

    firstFocusableRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSettingsOpen(false);
        return;
      }

      if (event.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => element.offsetParent !== null);

      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [settingsOpen]);

  if (!ready || !isPublicPath(pathname)) return null;

  const hasCurrentConsent = consent?.version === CONSENT_VERSION;

  const commitChoice = (choice: ConsentChoice) => {
    setConsent(saveConsent(choice));
    setSettingsOpen(false);
  };

  const settings = (
    <div
      className="fixed inset-0 z-[10000] grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm"
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cookie-settings-title"
        aria-describedby="cookie-settings-description"
        className="max-h-[min(760px,calc(100svh-2rem))] w-full max-w-2xl overflow-y-auto rounded-[2rem] border border-slate-200 bg-white p-5 shadow-2xl sm:p-7 motion-reduce:transition-none"
      >
        <div className="flex items-start justify-between gap-5">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
              <Cookie className="size-3.5" aria-hidden="true" />
              Cookie & browser storage
            </div>
            <h2 id="cookie-settings-title" className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
              Your privacy preferences
            </h2>
            <p id="cookie-settings-description" className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
              Conventus currently has no analytics or marketing tracking category to switch on. Essential authentication and security storage is always required for the service.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setSettingsOpen(false)}
            className="grid size-10 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            aria-label="Close cookie settings"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-6 space-y-3">
          <section className="rounded-2xl border border-slate-200 bg-[#faf9f1] p-4 sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-slate-950 shadow-sm">
                  <ShieldCheck className="size-5" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-950">Essential authentication & security storage</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    Required. This supports sign-in sessions, OAuth hand-offs, and company/security scope checks. It cannot be disabled from this panel.
                  </p>
                </div>
              </div>
              <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
                Always on
              </span>
            </div>
          </section>

          <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 sm:p-5">
            <h3 className="text-sm font-semibold text-slate-950">Optional categories</h3>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              None are currently configured in the application. Conventus does not add an analytics, advertising, or marketing tracker through this consent flow.
            </p>
          </section>
        </div>

        <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={firstFocusableRef}
            type="button"
            onClick={() => commitChoice("reject-optional")}
            className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            Reject optional
          </button>
          <button
            type="button"
            onClick={() => commitChoice("custom")}
            className="min-h-11 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-800 transition hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            Save preferences
          </button>
          <button
            type="button"
            onClick={() => commitChoice("accept-all")}
            className="min-h-11 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          >
            Accept all
          </button>
        </div>

        <p className="mt-4 text-[11px] leading-5 text-slate-400">
          Choice version {CONSENT_VERSION}. The preference record contains only the consent choice, version, and timestamp.
        </p>
      </div>
    </div>
  );

  return (
    <>
      {!hasCurrentConsent && !settingsOpen && (
        <aside
          aria-label="Cookie consent"
          className="fixed inset-x-3 bottom-3 z-[9999] max-h-[80svh] overflow-y-auto rounded-[1.5rem] border border-slate-200 bg-white/95 p-4 shadow-[0_20px_70px_rgba(15,23,42,0.2)] backdrop-blur-xl sm:inset-x-5 sm:bottom-5 sm:p-5 motion-reduce:transition-none"
        >
          <div className="mx-auto flex max-w-6xl flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700">
                <Cookie className="size-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-950">Cookie & browser storage choices</p>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600 sm:text-sm">
                  Conventus needs essential authentication and security storage for sign-in and protected service flows. There are currently no optional analytics or marketing categories in the app.
                </p>
              </div>
            </div>

            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => commitChoice("reject-optional")}
                className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                Reject optional
              </button>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="min-h-11 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-800 transition hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                Customize
              </button>
              <button
                type="button"
                onClick={() => commitChoice("accept-all")}
                className="min-h-11 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
              >
                Accept all
              </button>
            </div>
          </div>
        </aside>
      )}

      {settingsOpen && settings}
    </>
  );
}
