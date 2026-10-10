"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageCircle, UsersRound, MessagesSquare, RefreshCw, LoaderCircle, ShieldCheck } from "lucide-react";

type UsageRow = {
  companyId: string; companyName: string; companySlug: string; planId: string; planName: string;
  enabled: boolean; monthlyChats: number; uniqueCustomers: number; openChats: number;
  monthlyChatLimit: number; customerLimit: number; agentLimit: number; retentionDays: number; cooldownSeconds: number;
};
type Payload = {
  periodStart: string;
  totals: { companiesUsingChat: number; totalChats: number; totalUniqueCustomers: number; totalOpenChats: number };
  companies: UsageRow[];
};
export default function AdminLiveChatUsage() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/live-chat/usage", { cache: "no-store" });
      const body = await response.json() as { ok?: boolean; data?: Payload; error?: string };
      if (!response.ok || !body.ok || !body.data) throw new Error(body.error ?? "LIVE_CHAT_USAGE_FAILED");
      setPayload(body.data); setError("");
    } catch (cause) { setError((cause as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return <div className="space-y-6">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700">Platform monitoring</p><h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Live Chat usage</h1><p className="mt-1 text-sm text-slate-500">Company-level volume and plan limits. Customer message content and personal contact details are not exposed here.</p></div><button onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50"><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Refresh</button></div>
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error.replaceAll("_"," ").toLowerCase()}</div>}
    {payload && <><p className="text-xs text-slate-500">Usage period starts {new Date(payload.periodStart).toLocaleDateString("en-IN")} (UTC).</p><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        { label: "Companies using chat", value: payload.totals.companiesUsingChat, icon: UsersRound },
        { label: "Chats this month", value: payload.totals.totalChats, icon: MessageCircle },
        { label: "Unique customers", value: payload.totals.totalUniqueCustomers, icon: MessagesSquare },
        { label: "Open conversations", value: payload.totals.totalOpenChats, icon: ShieldCheck }
      ].map((card) => <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><card.icon className="size-4 text-blue-600" /><p className="mt-3 text-xs text-slate-500">{card.label}</p><p className="mt-1 text-2xl font-semibold text-slate-950">{card.value.toLocaleString("en-IN")}</p></div>)}
    </div>
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-semibold text-slate-900">Company usage and plan configuration</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-[0.1em] text-slate-500"><tr><th className="px-4 py-3">Company</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Chats used</th><th className="px-4 py-3">Unique customers</th><th className="px-4 py-3">Open</th><th className="px-4 py-3">Agents</th><th className="px-4 py-3">Retention</th><th className="px-4 py-3">Cooldown</th></tr></thead><tbody className="divide-y divide-slate-100">{payload.companies.map((row) => <tr key={row.companyId} className="hover:bg-slate-50/80"><td className="px-4 py-4"><p className="font-semibold text-slate-900">{row.companyName}</p><p className="mt-1 text-[10px] text-slate-400">/{row.companySlug}</p></td><td className="px-4 py-4"><span className="font-semibold text-slate-800">{row.planName}</span><p className="mt-1 text-[10px] text-slate-400">{row.planId}</p></td><td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${row.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{row.enabled ? "Enabled" : "Disabled"}</span></td><td className="px-4 py-4 font-semibold tabular-nums text-slate-800">{row.monthlyChats.toLocaleString("en-IN")} / {row.monthlyChatLimit.toLocaleString("en-IN")}</td><td className="px-4 py-4 tabular-nums text-slate-700">{row.uniqueCustomers.toLocaleString("en-IN")} / {row.customerLimit.toLocaleString("en-IN")}</td><td className="px-4 py-4 tabular-nums text-slate-700">{row.openChats}</td><td className="px-4 py-4 text-slate-700">{row.agentLimit}</td><td className="px-4 py-4 text-slate-700">{row.retentionDays} days</td><td className="px-4 py-4 text-slate-700">{row.cooldownSeconds}s</td></tr>)}{payload.companies.length === 0 && <tr><td colSpan={9} className="px-4 py-12 text-center text-sm text-slate-500">No conversations have been started this month.</td></tr>}</tbody></table></div></section></>}
    {!payload && loading && <div className="grid min-h-52 place-items-center rounded-3xl border border-slate-200 bg-white"><LoaderCircle className="size-6 animate-spin text-blue-600" /></div>}
  </div>;
}
