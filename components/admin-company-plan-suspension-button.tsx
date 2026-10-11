"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PauseCircle, PlayCircle, RotateCcw, TimerOff } from "lucide-react";

type BusyAction = "suspension" | "expiry" | "";

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function AdminCompanyPlanSuspensionButton({
  companyId,
  suspended,
  suspendedAt,
  expired,
  expiredAt,
  expiryTestActive
}: {
  companyId: string;
  suspended: boolean;
  suspendedAt?: Date | string | null;
  expired: boolean;
  expiredAt?: Date | string | null;
  expiryTestActive: boolean;
}) {
  const router = useRouter();
  const [isSuspended, setIsSuspended] = useState(suspended);
  const [isExpired, setIsExpired] = useState(expired);
  const [isExpiryTestActive, setIsExpiryTestActive] = useState(expiryTestActive);
  const [suspensionDate, setSuspensionDate] = useState<Date | string | null>(suspendedAt ?? null);
  const [expiryDate, setExpiryDate] = useState<Date | string | null>(expiredAt ?? null);
  const [busy, setBusy] = useState<BusyAction>("");
  const [error, setError] = useState("");

  // Align with refreshed server state, but never wait for a heavy detail-page refresh
  // to update the controls immediately after a successful click.
  useEffect(() => {
    setIsSuspended(suspended);
    setIsExpired(expired);
    setIsExpiryTestActive(expiryTestActive);
    setSuspensionDate(suspendedAt ?? null);
    setExpiryDate(expiredAt ?? null);
  }, [suspended, suspendedAt, expired, expiredAt, expiryTestActive]);

  async function saveSuspension() {
    if (busy) return;
    const next = !isSuspended;
    const previousDate = suspensionDate;
    setIsSuspended(next);
    setSuspensionDate(next ? new Date().toISOString() : null);
    setBusy("suspension");
    setError("");

    try {
      const response = await fetch(
        "/api/admin/companies/" + encodeURIComponent(companyId) + "/plan-suspension",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          cache: "no-store",
          body: JSON.stringify({ suspended: next })
        }
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "PLAN_SUSPENSION_FAILED");
      setIsSuspended(Boolean(body.planSuspended));
      setSuspensionDate(body.planSuspendedAt ?? null);
      router.refresh();
    } catch (cause) {
      setIsSuspended(!next);
      setSuspensionDate(previousDate);
      setError(cause instanceof Error ? cause.message : "PLAN_SUSPENSION_FAILED");
    } finally {
      setBusy("");
    }
  }

  async function toggleExpiryTest() {
    if (busy) return;
    const action = isExpiryTestActive ? "restore" : "expire";
    const previousExpired = isExpired;
    const previousTestState = isExpiryTestActive;
    const previousDate = expiryDate;

    // Optimistic state change keeps the admin control responsive while the API
    // records the change; the real feature gates read the persisted server state.
    setIsExpired(action === "expire" ? true : false);
    setIsExpiryTestActive(action === "expire");
    setExpiryDate(action === "expire" ? new Date().toISOString() : null);
    setBusy("expiry");
    setError("");

    try {
      const response = await fetch(
        "/api/admin/companies/" + encodeURIComponent(companyId) + "/plan-expiry-test",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          cache: "no-store",
          body: JSON.stringify({ action })
        }
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "PLAN_EXPIRY_TEST_FAILED");
      setIsExpired(Boolean(body.planExpired));
      setIsExpiryTestActive(Boolean(body.planExpiryTestActive));
      setExpiryDate(body.planExpiredAt ?? null);
      router.refresh();
    } catch (cause) {
      setIsExpired(previousExpired);
      setIsExpiryTestActive(previousTestState);
      setExpiryDate(previousDate);
      setError(cause instanceof Error ? cause.message : "PLAN_EXPIRY_TEST_FAILED");
    } finally {
      setBusy("");
    }
  }

  const statusText = isSuspended
    ? "Plan access suspended"
    : isExpired ? "Plan access expired" : "Plan access active";
  const statusClass = isSuspended
    ? "bg-rose-50 text-rose-700"
    : isExpired ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700";
  const statusDate = isSuspended ? formatDate(suspensionDate) : formatDate(expiryDate);

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="space-y-2">
        <span className={"inline-flex rounded-full px-3 py-1.5 text-xs font-semibold " + statusClass}>
          {statusText}
        </span>
        {statusDate && <p className="text-[11px] text-slate-500">{isSuspended ? "Suspended " : "Plan expiry "}{statusDate}</p>}
        {isExpiryTestActive && (
          <p className="max-w-xl text-[11px] leading-5 text-amber-800">
            Expiry test is active. Billing dates are preserved; restore the test or complete a new paid checkout.
          </p>
        )}
      </div>
      <div className="flex flex-col items-start gap-2 sm:items-end">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void saveSuspension()}
            disabled={Boolean(busy)}
            className={"inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 " + (isSuspended ? "bg-emerald-700 hover:bg-emerald-800" : "bg-rose-600 hover:bg-rose-700")}
          >
            {busy === "suspension" ? <Loader2 className="size-3.5 animate-spin" /> : isSuspended ? <PlayCircle className="size-3.5" /> : <PauseCircle className="size-3.5" />}
            {busy === "suspension" ? "Saving…" : isSuspended ? "Unsuspend plan" : "Suspend plan"}
          </button>
          <button
            type="button"
            onClick={() => void toggleExpiryTest()}
            disabled={Boolean(busy) || (isExpired && !isExpiryTestActive)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === "expiry" ? <Loader2 className="size-3.5 animate-spin" /> : isExpiryTestActive ? <RotateCcw className="size-3.5" /> : <TimerOff className="size-3.5" />}
            {busy === "expiry" ? "Saving…" : isExpiryTestActive ? "Restore expiry test" : "Expire now (test)"}
          </button>
        </div>
        <p className="max-w-sm text-right text-[10px] leading-4 text-slate-500">
          Changes are enforced by server APIs. Expiry testing preserves the real billing period and can be undone.
        </p>
        {error && <p role="alert" className="text-[11px] text-rose-700">{error}</p>}
      </div>
    </div>
  );
}
