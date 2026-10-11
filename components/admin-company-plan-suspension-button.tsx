"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PauseCircle, PlayCircle } from "lucide-react";

export default function AdminCompanyPlanSuspensionButton({
  companyId,
  suspended
}: {
  companyId: string;
  suspended: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function saveSuspension() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        "/api/admin/companies/" + encodeURIComponent(companyId) + "/plan-suspension",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          cache: "no-store",
          body: JSON.stringify({ suspended: !suspended })
        }
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "PLAN_SUSPENSION_FAILED");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "PLAN_SUSPENSION_FAILED");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <button
        type="button"
        onClick={() => void saveSuspension()}
        disabled={saving}
        className={"inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 " + (suspended ? "bg-emerald-700 hover:bg-emerald-800" : "bg-rose-600 hover:bg-rose-700")}
      >
        {saving ? <Loader2 className="size-3.5 animate-spin" /> : suspended ? <PlayCircle className="size-3.5" /> : <PauseCircle className="size-3.5" />}
        {saving ? "Saving…" : suspended ? "Unsuspend plan" : "Suspend plan"}
      </button>
      <p className="text-[10px] text-slate-500">Changes are saved immediately and enforced by server APIs.</p>
      {error && <p role="alert" className="text-[11px] text-rose-700">{error}</p>}
    </div>
  );
}
