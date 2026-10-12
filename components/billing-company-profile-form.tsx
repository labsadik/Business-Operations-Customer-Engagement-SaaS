"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type Props = {
  initialName: string;
  initialEmail: string;
  initialPhone: string;
  planId: string;
};

export default function BillingCompanyProfileForm({
  initialName,
  initialEmail,
  initialPhone,
  planId
}: Props) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [phone, setPhone] = useState(initialPhone);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/billing/company-profile", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ name, email, phone })
      });
      const body = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !body?.ok) {
        throw new Error(body?.error || "BILLING_PROFILE_UPDATE_FAILED");
      }
      router.push(planId
        ? "/billing/checkout?plan=" + encodeURIComponent(planId)
        : "/billing/renew");
      router.refresh();
    } catch (value) {
      setError(value instanceof Error ? value.message : "BILLING_PROFILE_UPDATE_FAILED");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <label className="block text-sm font-semibold text-slate-800">
        Company name
        <input required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} className="mt-2 block min-h-11 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal outline-none focus:border-slate-500" />
      </label>
      <label className="block text-sm font-semibold text-slate-800">
        Billing email
        <input required type="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 block min-h-11 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal outline-none focus:border-slate-500" />
      </label>
      <label className="block text-sm font-semibold text-slate-800">
        Billing phone
        <input required type="tel" maxLength={32} value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-2 block min-h-11 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal outline-none focus:border-slate-500" />
      </label>
      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      <button type="submit" disabled={saving} className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
        {saving ? "Saving billing details…" : "Save and return to checkout"}
      </button>
    </form>
  );
}
