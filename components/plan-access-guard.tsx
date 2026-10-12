"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, ShieldAlert } from "lucide-react";

type PlanAccessState = {
  locked: boolean;
  reason: "ACTIVE" | "SUSPENDED" | "EXPIRED";
  planSuspended: boolean;
  planExpired: boolean;
  planExpiryTestActive: boolean;
  planAccessExpiresAt: Date | string | null;
  planSuspendedAt: Date | string | null;
  planExpiredAt: Date | string | null;
};

type PlanAccessGuardProps = {
  initialState: PlanAccessState | null;
  canManageBilling: boolean;
  bypass?: boolean;
  children?: ReactNode;
};

type ApiEnvelope<T> = { ok?: boolean; data?: T; error?: string };

function dateFrom(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function formatDate(value: Date | string | null | undefined) {
  const date = dateFrom(value);
  if (!date) return "the end of your current plan period";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "long",
    timeStyle: "short"
  }).format(date);
}

export default function PlanAccessGuard({
  initialState,
  canManageBilling,
  bypass = false,
  children
}: PlanAccessGuardProps) {
  const router = useRouter();
  const [state, setState] = useState<PlanAccessState | null>(initialState);
  const [warningDismissed, setWarningDismissed] = useState(false);
  const lockedRef = useRef(Boolean(initialState?.locked));

  useEffect(() => {
    setState(initialState);
    setWarningDismissed(false);
    lockedRef.current = Boolean(initialState?.locked);
  }, [initialState]);

  useEffect(() => {
    if (bypass) return;

    let cancelled = false;
    async function refreshAccess() {
      try {
        const response = await fetch("/api/company/plan-access", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          headers: { accept: "application/json" }
        });
        const envelope = await response.json().catch(() => null) as ApiEnvelope<PlanAccessState> | null;
        if (cancelled || !response.ok || !envelope?.ok || !envelope.data) return;

        const next = envelope.data;
        const wasLocked = lockedRef.current;
        lockedRef.current = Boolean(next.locked);
        setState((current) => {
          if (
            current &&
            current.locked === next.locked &&
            current.reason === next.reason &&
            (dateFrom(current.planAccessExpiresAt)?.getTime() ?? 0) === (dateFrom(next.planAccessExpiresAt)?.getTime() ?? 0) &&
            (dateFrom(current.planSuspendedAt)?.getTime() ?? 0) === (dateFrom(next.planSuspendedAt)?.getTime() ?? 0) &&
            (dateFrom(current.planExpiredAt)?.getTime() ?? 0) === (dateFrom(next.planExpiredAt)?.getTime() ?? 0)
          ) return current;
          return next;
        });

        if (wasLocked !== Boolean(next.locked)) {
          setWarningDismissed(false);
          router.refresh();
        }
      } catch {
        // A temporary status request failure must not grant access or hide a lock.
      }
    }

    void refreshAccess();
    const interval = window.setInterval(() => void refreshAccess(), 15000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [bypass, router]);

  const locked = !bypass && Boolean(state?.locked);
  const expiryDate = dateFrom(state?.planAccessExpiresAt);
  const daysRemaining = expiryDate
    ? Math.ceil((expiryDate.getTime() - Date.now()) / 86400000)
    : null;
  const expiringSoon = !locked &&
    state?.reason === "ACTIVE" &&
    daysRemaining !== null &&
    daysRemaining >= 0 &&
    daysRemaining <= 7;
  const showExpiryWarning = !bypass && expiringSoon && !warningDismissed;

  if (locked) {
    const suspended = state?.reason === "SUSPENDED" || state?.planSuspended;
    return (
      <main className="flex min-h-[70vh] items-center justify-center bg-slate-50 px-4 py-12">
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="plan-access-title"
          className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-7 shadow-xl sm:p-9"
        >
          <div className={"grid size-14 place-items-center rounded-2xl " + (suspended ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800")}>
            {suspended ? <ShieldAlert className="size-7" /> : <AlertTriangle className="size-7" />}
          </div>
          <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
            Company plan access
          </p>
          <h1 id="plan-access-title" className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
            {suspended ? "Plan access is suspended" : "Your plan has expired"}
          </h1>
          {suspended ? (
            <p className="mt-3 text-sm leading-6 text-slate-600">
              A platform administrator has suspended this company’s plan. Task Management, Cloud Vault, Live Chat, and other protected features remain locked until the administrator restores access. Paying for a renewal does not override a separate administrative suspension.
            </p>
          ) : (
            <p className="mt-3 text-sm leading-6 text-slate-600">
              This company’s plan expired{state?.planExpiredAt ? " on " + formatDate(state.planExpiredAt) : ""}. Protected features are locked until the company renews its plan. Once payment is successfully verified, access is restored automatically if there is no separate administrative suspension.
            </p>
          )}
          {state?.planExpiryTestActive && (
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
              An administrator has enabled an expiry test. Ask the platform administrator to restore the test before using plan features.
            </p>
          )}
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            {!suspended && canManageBilling ? (
              <Link
                href="/dashboard?billing=1"
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Renew plan
              </Link>
            ) : suspended ? (
              <Link
                href="/dashboard"
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Return to overview
              </Link>
            ) : (
              <p className="flex-1 rounded-xl bg-amber-50 px-4 py-3 text-sm leading-5 text-amber-900">
                Ask your company administrator to renew the plan.
              </p>
            )}
            <Link
              href="/dashboard"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Overview
            </Link>
          </div>
          <p className="mt-5 text-xs leading-5 text-slate-400">
            Access status is checked with the server automatically. This screen will update after an administrator restores access or a renewal is confirmed.
          </p>
        </section>
      </main>
    );
  }

  return (
    <>
      {children}
      {showExpiryWarning && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="plan-expiring-title"
            className="w-full max-w-lg rounded-3xl border border-amber-200 bg-white p-7 shadow-2xl sm:p-8"
          >
            <div className="grid size-12 place-items-center rounded-2xl bg-amber-50 text-amber-800">
              <CalendarClock className="size-6" />
            </div>
            <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-amber-800">
              Plan renewal reminder
            </p>
            <h2 id="plan-expiring-title" className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
              Your plan expires {daysRemaining === 0 ? "today" : "in " + daysRemaining + (daysRemaining === 1 ? " day" : " days")}
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Current access is active until {formatDate(state?.planAccessExpiresAt)}. Renew before this date to keep Task Management, Cloud Vault, Live Chat, and your other included features available without interruption.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              {canManageBilling ? (
                <Link
                  href="/dashboard?billing=1"
                  className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Review plans and renew
                </Link>
              ) : (
                <p className="flex-1 rounded-xl bg-amber-50 px-4 py-3 text-sm leading-5 text-amber-900">
                  Ask your company administrator to renew before the expiry date.
                </p>
              )}
              <button
                type="button"
                onClick={() => setWarningDismissed(true)}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Continue to feature
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
