"use client";

import { useState } from "react";
import { Check, Loader2, ShieldCheck } from "lucide-react";

export default function AdminGrantPlanButton({
  companyId,
  planId,
  currentPlanId
}: {
  companyId: string;
  planId: string;
  currentPlanId: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const isCurrent = currentPlanId === planId;

  async function grant() {
    if (busy || isCurrent) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/companies/${companyId}/plan`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planId })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "PLAN_GRANT_FAILED");
      window.location.reload();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "PLAN_GRANT_FAILED");
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void grant()}
      disabled={busy || isCurrent}
      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-[10px] font-semibold text-violet-700 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : isCurrent ? <Check className="size-3.5" /> : <ShieldCheck className="size-3.5" />}
      {isCurrent ? "Current" : "Grant"}
    </button>
  );
}
