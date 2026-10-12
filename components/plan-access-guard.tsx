"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, ShieldAlert } from "lucide-react";

type PlanAccessState = {
  locked: boolean;
  reason: "ACTIVE" | "SUSPENDED" | "EXPIRED" | "INACTIVE";
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
  /** Only the dashboard-layout instance owns the global expiry warning. */
  globalGate?: boolean;
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
  globalGate = false,
  children
}: PlanAccessGuardProps) {
  const router = useRouter();
  const [state, setState] = useState<PlanAccessState | null>(initialState);
  const [warningDismissed, setWarningDismissed] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportSubject, setSupportSubject] = useState(() =>
    initialState?.reason === "SUSPENDED"
      ? "Plan suspension review"
      : initialState?.reason === "INACTIVE"
        ? "Inactive subscription review"
        : "Plan expiry and renewal access"
  );
  const [supportDescription, setSupportDescription] = useState(() => [
    `Access issue: ${initialState?.reason ?? "UNKNOWN"}.`,
    `Plan expiry date: ${formatDate(initialState?.planExpiredAt ?? initialState?.planAccessExpiresAt)}.`,
    "Please review this company’s access status and explain the next steps.",
    "Additional details: "
  ].join("\\n"));
  const [supportSaving, setSupportSaving] = useState(false);
  const [supportError, setSupportError] = useState("");
  const [supportTicketNumber, setSupportTicketNumber] = useState("");
  const [nowMs, setNowMs] = useState<number | null>(null);
  const lockedRef = useRef(Boolean(initialState?.locked));

  useEffect(() => {
    let cancelled = false;
    const updateClock = () => {
      if (!cancelled) setNowMs(Date.now());
    };
    const initialTick = window.setTimeout(updateClock, 0);
    const clockInterval = window.setInterval(updateClock, 60_000);
    return () => {
      cancelled = true;
      window.clearTimeout(initialTick);
      window.clearInterval(clockInterval);
    };
  }, []);

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
  const daysRemaining = expiryDate && nowMs !== null
    ? Math.ceil((expiryDate.getTime() - nowMs) / 86400000)
    : null;
  const expiringSoon = !locked &&
    state?.reason === "ACTIVE" &&
    daysRemaining !== null &&
    daysRemaining >= 0 &&
    daysRemaining <= 7;
  const showExpiryWarning = globalGate && !bypass && expiringSoon && !warningDismissed;

  async function submitSupportTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (supportSaving) return;
    setSupportSaving(true);
    setSupportError("");
    setSupportTicketNumber("");
    try {
      const response = await fetch("/api/company/support-tickets", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ subject: supportSubject, description: supportDescription })
      });
      const envelope = await response.json().catch(() => null) as ApiEnvelope<{ id?: string }> | null;
      if (!response.ok || !envelope?.ok || !envelope.data?.id) {
        throw new Error(envelope?.error || "SUPPORT_TICKET_CREATE_FAILED");
      }
      setSupportTicketNumber("SUP-" + envelope.data.id.slice(-8).toUpperCase());
    } catch (error) {
      setSupportError(error instanceof Error ? error.message : "SUPPORT_TICKET_CREATE_FAILED");
    } finally {
      setSupportSaving(false);
    }
  }

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
            {suspended ? "Plan access is suspended" : state?.reason === "INACTIVE" ? "Your plan is not active" : "Your plan has expired"}
          </h1>
          {suspended ? (
            <p className="mt-3 text-sm leading-6 text-slate-600">
              A platform administrator has suspended this company’s plan. Task Management, Cloud Vault, Live Chat, and other protected features remain locked until the administrator restores access. Paying for a renewal does not override a separate administrative suspension.
            </p>
          ) : state?.reason === "INACTIVE" ? (
            <p className="mt-3 text-sm leading-6 text-slate-600">
              This subscription is not currently active, even though its recorded service date may be in the future. Protected features stay locked until the subscription is active again. The company administrator should review renewal options or ask the platform administrator to check the subscription status.
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
            {canManageBilling ? (
              <Link
                href="/billing/renew"
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
              >
                {suspended ? "Review plan options" : "Renew plan"}
              </Link>
            ) : suspended ? (
              <p className="flex-1 rounded-xl bg-rose-50 px-4 py-3 text-sm leading-5 text-rose-900">
                Contact the platform administrator to restore suspended access. If the plan has expired too, ask your company administrator to review renewal options.
              </p>
            ) : (
              <p className="flex-1 rounded-xl bg-amber-50 px-4 py-3 text-sm leading-5 text-amber-900">
                Ask your company administrator to renew the plan.
              </p>
            )}
            <button
              type="button"
              onClick={() => setSupportOpen((open) => !open)}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              {supportOpen ? "Close support form" : "Contact support"}
            </button>
          </div>
          {supportOpen && (
            <form onSubmit={submitSupportTicket} className="mt-5 space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Report this access problem</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">Your request goes to the platform support inbox. Include what happened and what you need help with; support remains available while the dashboard is locked.</p>
              </div>
              <label className="block text-xs font-semibold text-slate-700">
                Issue subject
                <input
                  required
                  maxLength={120}
                  value={supportSubject}
                  onChange={(event) => setSupportSubject(event.target.value)}
                  className="mt-1.5 block min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-slate-500"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-700">
                Describe the problem
                <textarea
                  required
                  maxLength={2000}
                  rows={5}
                  value={supportDescription}
                  onChange={(event) => setSupportDescription(event.target.value)}
                  className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal leading-5 outline-none focus:border-slate-500"
                />
              </label>
              {supportError && <p role="alert" className="text-xs font-medium text-rose-700">{supportError}</p>}
              {supportTicketNumber && (
                <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-900">
                  Support request {supportTicketNumber} was submitted. The team can review the account status and the details you provided.
                </p>
              )}
              <button
                type="submit"
                disabled={supportSaving || !supportSubject.trim() || !supportDescription.trim()}
                className="inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {supportSaving ? "Sending request…" : "Send request to support"}
              </button>
            </form>
          )}
          <p className="mt-5 text-xs leading-5 text-slate-400">
            Access status is checked with the server automatically. This screen updates after a confirmed renewal or administrator action. A successful payment does not override a separate platform suspension.
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
                  href="/billing/renew"
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
