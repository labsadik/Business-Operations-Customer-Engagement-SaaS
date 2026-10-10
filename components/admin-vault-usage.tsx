"use client";

import { useEffect, useState } from "react";
import { AlertCircle, HardDrive, RefreshCw, Search, ShieldCheck } from "lucide-react";

type UsageItem = {
  companyId: string;
  companyName: string;
  companySlug: string;
  storagePrefix: string;
  planId: string;
  planName: string;
  vaultEnabled: boolean;
  usedBytes: number;
  quotaBytes: number;
  availableBytes: number;
  usedItems: number;
  maxItems: number;
  maxFileBytes: number;
  fileCount: number;
  pendingUploadCount: number;
  pendingUploadBytes: number;
  quotaExceeded: boolean;
};
type UsageResponse = {
  items: UsageItem[];
  totals: {
    companies: number;
    enabledCompanies: number;
    usedBytes: number;
    quotaBytes: number;
    fileCount: number;
    pendingUploadCount: number;
  };
};
type Envelope<T> = { ok: boolean; data?: T; error?: string };

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let amount = value;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }
  return (amount >= 100 || index === 0 ? amount.toFixed(0) : amount >= 10 ? amount.toFixed(1) : amount.toFixed(2)) + " " + units[index];
}

export default function AdminVaultUsage() {
  const [data, setData] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/vault-usage", { cache: "no-store" });
      const result = await response.json().catch(() => null) as Envelope<UsageResponse> | null;
      if (!response.ok || !result?.ok || !result.data) throw new Error(result?.error || "ADMIN_VAULT_USAGE_FAILED");
      setData(result.data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message.replaceAll("_", " ").toLowerCase() : "Could not load vault usage.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initial);
  }, []);

  const filtered = (data?.items ?? []).filter((item) =>
    [item.companyName, item.companySlug, item.companyId, item.planName, item.storagePrefix]
      .some((value) => value.toLowerCase().includes(search.toLowerCase().trim()))
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-600">Storage governance</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Company vault usage</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Inspect each company’s plan quota, actual bytes, stored items, active uploads, and entitlement status. Limits are configured in Plans.</p>
        </div>
        <button type="button" onClick={() => void load(true)} disabled={loading || refreshing} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw className={"size-4 " + (refreshing ? "animate-spin" : "")} /> Refresh
        </button>
      </header>

      {error && <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"><AlertCircle className="mt-0.5 size-4 shrink-0" /> {error}</div>}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Companies", value: (data?.totals.companies ?? 0).toLocaleString("en-IN") },
          { label: "Vaults enabled", value: (data?.totals.enabledCompanies ?? 0).toLocaleString("en-IN") },
          { label: "Company storage used", value: formatBytes(data?.totals.usedBytes ?? 0) },
          { label: "Stored files", value: (data?.totals.fileCount ?? 0).toLocaleString("en-IN") }
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">{item.label}</p>
            <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{item.value}</p>
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <h2 className="text-base font-semibold text-slate-950">Company-by-company breakdown</h2>
            <p className="mt-1 text-xs text-slate-500">Usage includes completed files and active-upload reservations.</p>
          </div>
          <label className="flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2.5 sm:w-80">
            <Search className="size-4 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search company, ID, or plan" className="min-w-0 flex-1 text-sm outline-none" />
          </label>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">Loading company usage…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">No companies match this search.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((item) => {
              const percentage = item.quotaBytes > 0 ? Math.min(100, (item.usedBytes / item.quotaBytes) * 100) : 0;
              return (
                <article key={item.companyId} className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(220px,1.2fr)_minmax(220px,1fr)_minmax(210px,1fr)]">
                  <div className="min-w-0">
                    <div className="flex items-start gap-3">
                      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600"><HardDrive className="size-4.5" /></div>
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-slate-950">{item.companyName}</h3>
                        <p className="mt-1 truncate text-xs text-slate-500">{item.companySlug} · {item.planName}</p>
                        <p className="mt-1 truncate font-mono text-[10px] text-slate-400" title={item.storagePrefix}>Bunny path: {item.storagePrefix}</p>
                        <p className="mt-1 break-all text-[10px] text-slate-400">{item.companyId}</p>
                      </div>
                    </div>
                    <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold">
                      <ShieldCheck className={"size-3.5 " + (item.vaultEnabled ? "text-emerald-600" : "text-slate-400")} />
                      <span className={item.vaultEnabled ? "text-emerald-700" : "text-slate-500"}>{item.vaultEnabled ? "Cloud vault included" : "Not included in plan"}</span>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="text-xs text-slate-500">Used / assigned quota</p>
                        <p className="mt-1 text-lg font-semibold tabular-nums text-slate-950">{formatBytes(item.usedBytes)} <span className="text-xs font-medium text-slate-400">/ {item.vaultEnabled ? formatBytes(item.quotaBytes) : "No quota"}</span></p>
                      </div>
                      {item.quotaExceeded && <span className="rounded-lg bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-700">Over quota</span>}
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className={"h-full rounded-full " + (item.quotaExceeded ? "bg-rose-500" : "bg-blue-600")} style={{ width: percentage + "%" }} />
                    </div>
                    <p className="mt-2 text-[11px] text-slate-500">{item.vaultEnabled ? formatBytes(item.availableBytes) + " remaining" : "Uploads blocked without vault entitlement"}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-[10px] uppercase tracking-[0.1em] text-slate-400">Items / limit</p>
                      <p className="mt-1 text-sm font-semibold text-slate-800">{item.usedItems.toLocaleString("en-IN")} / {item.vaultEnabled ? item.maxItems.toLocaleString("en-IN") : "—"}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-[10px] uppercase tracking-[0.1em] text-slate-400">Max file size</p>
                      <p className="mt-1 text-sm font-semibold text-slate-800">{item.vaultEnabled ? formatBytes(item.maxFileBytes) : "—"}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-[10px] uppercase tracking-[0.1em] text-slate-400">Stored files</p>
                      <p className="mt-1 text-sm font-semibold text-slate-800">{item.fileCount.toLocaleString("en-IN")}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-[10px] uppercase tracking-[0.1em] text-slate-400">Active uploads</p>
                      <p className="mt-1 text-sm font-semibold text-slate-800">{item.pendingUploadCount.toLocaleString("en-IN")}</p>
                      {item.pendingUploadBytes > 0 && <p className="mt-1 text-[10px] text-slate-500">{formatBytes(item.pendingUploadBytes)} reserved</p>}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
