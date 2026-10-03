"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Settings2 } from "lucide-react";

export default function AdminManageCompanyButton({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function manage() {
    if (loading) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/companies/${encodeURIComponent(companyId)}/manage`, {
        method: "POST",
        headers: { "content-type": "application/json" }
      });
      if (!response.ok) throw new Error("ADMIN_COMPANY_MANAGE_FAILED");
      router.push("/dashboard");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void manage()}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Settings2 className="size-3.5" />}
      {loading ? "Opening workspace..." : "Manage workspace"}
    </button>
  );
}
