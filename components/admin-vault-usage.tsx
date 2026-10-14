"use client";

import Link from "next/link";
import type { Route } from "next";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, HardDrive, LoaderCircle, RefreshCw, Search, ShieldCheck } from "lucide-react";

const PAGE_SIZE = 10;

type UsageItem = {
  companyId: string;
  companyName: string;
  companySlug: string;
  storagePrefix: string;
  planId: string;
  planName: string;
  subscriptionStatus: "ACTIVE" | "PAST_DUE" | "CANCELLED" | "EXPIRED" | "NONE";
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

type UsageTotals = {
  companies: number;
  enabledCompanies: number;
  disabledCompanies: number;
  usedBytes: number;
  quotaBytes: number;
  availableBytes: number;
  usedItems: number;
  maxItems: number;
  fileCount: number;
  pendingUploadCount: number;
  pendingUploadBytes: number;
  overQuotaCompanies: number;
};

type UsagePage = { items: UsageItem[]; nextCursor: string | null };
type Envelope<T> = { ok: boolean; data?: T; error?: string };

type PageLoadOptions = {
  cursor?: string | null;
  append?: boolean;
  refreshing?: boolean;
  searchTerm?: string;
  signal?: AbortSignal;
};

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

function errorMessage(reason: unknown, fallback: string) {
  if (!(reason instanceof Error)) return fallback;
  return reason.message.replaceAll("_", " ").toLowerCase();
}

export default function AdminVaultUsage() {
  const [items, setItems] = useState<UsageItem[]>([]);
  const [totals, setTotals] = useState<UsageTotals | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [totalsLoading, setTotalsLoading] = useState(true);
  const [error, setError] = useState("");
  const [totalsError, setTotalsError] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const pageRequestId = useRef(0);
  const totalsRequestId = useRef(0);

  useEffect(() => {
    const debounce = window.setTimeout(() => setQuery(search.trim()), 250);
    return () => window.clearTimeout(debounce);
  }, [search]);

  const loadPage = useCallback(async ({
    cursor = null,
    append = false,
    refreshing: isRefresh = false,
    searchTerm = query,
    signal
  }: PageLoadOptions = {}) => {
    const requestId = append ? pageRequestId.current : ++pageRequestId.current;
    if (append) setLoadingMore(true);
    else if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    if (!append && !isRefresh) setItems([]);

    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (cursor) params.set("cursor", cursor);
      if (searchTerm) params.set("search", searchTerm);
      const response = await fetch("/api/admin/vault-usage?" + params.toString(), {
        cache: "no-store",
        signal
      });
      const body = await response.json().catch(() => null) as Envelope<UsagePage> | null;
      if (!response.ok || !body?.ok || !body.data) {
        throw new Error(body?.error || "ADMIN_VAULT_USAGE_FAILED");
      }
      if (signal?.aborted || requestId !== pageRequestId.current) return;
      setItems((current) => append ? [...current, ...body.data!.items] : body.data!.items);
      setNextCursor(body.data.nextCursor ?? null);
    } catch (reason) {
      if (signal?.aborted || requestId !== pageRequestId.current || (reason instanceof Error && reason.name === "AbortError")) return;
      setError(errorMessage(reason, "Could not load company vault usage."));
    } finally {
      if (signal?.aborted || requestId !== pageRequestId.current) return;
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [query]);

  const loadTotals = useCallback(async (signal?: AbortSignal) => {
    const requestId = ++totalsRequestId.current;
    setTotalsLoading(true);
    setTotalsError("");
    try {
      const response = await fetch("/api/admin/vault-usage/summary", { cache: "no-store", signal });
      const body = await response.json().catch(() => null) as Envelope<{ totals: UsageTotals }> | null;
      if (!response.ok || !body?.ok || !body.data?.totals) {
        throw new Error(body?.error || "ADMIN_VAULT_USAGE_SUMMARY_FAILED");
      }
      if (signal?.aborted || requestId !== totalsRequestId.current) return;
      setTotals(body.data.totals);
    } catch (reason) {
      if (signal?.aborted || requestId !== totalsRequestId.current || (reason instanceof Error && reason.name === "AbortError")) return;
      setTotalsError(errorMessage(reason, "Could not load live storage totals."));
    } finally {
      if (!signal?.aborted && requestId === totalsRequestId.current) setTotalsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // Loading state is intentionally owned by the async request helper.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPage({ cursor: null, append: false, searchTerm: query, signal: controller.signal });
    return () => controller.abort();
  }, [query, loadPage]);

  useEffect(() => {
    const controller = new AbortController();
    // Loading state is intentionally owned by the async request helper.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTotals(controller.signal);
    return () => controller.abort();
  }, [loadTotals]);

  function refresh() {
    void loadPage({ cursor: null, append: false, refreshing: true });
    void loadTotals();
  }

  const metricItems = [
    { label: "Total companies", value: totals ? totals.companies.toLocaleString("en-IN") : "—", detail: "All companies including disabled vaults" },
    { label: "Vaults enabled", value: totals ? totals.enabledCompanies.toLocaleString("en-IN") : "—", detail: totals ? totals.disabledCompanies.toLocaleString("en-IN") + " disabled by plan" : "Live summary" },
    { label: "Storage in use", value: totals ? formatBytes(totals.usedBytes) : "—", detail: totals ? formatBytes(totals.pendingUploadBytes) + " active upload reservations" : "Live summary" },
    { label: "Assigned quota", value: totals ? formatBytes(totals.quotaBytes) : "—", detail: totals ? formatBytes(totals.availableBytes) + " available in aggregate" : "Live summary" },
    { label: "Stored files", value: totals ? totals.fileCount.toLocaleString("en-IN") : "—", detail: "Committed vault file records" },
    { label: "Active uploads", value: totals ? totals.pendingUploadCount.toLocaleString("en-IN") : "—", detail: totals ? totals.usedItems.toLocaleString("en-IN") + " total items including files" : "Live summary" },
    { label: "Over-quota companies", value: totals ? totals.overQuotaCompanies.toLocaleString("en-IN") : "—", detail: "Includes storage with no active entitlement" }
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-600">Storage governance</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Company vault usage</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Fresh storage usage by company. The company table loads {PAGE_SIZE} records at a time; summary totals update independently.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading || loadingMore || refreshing}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={"size-4 " + (refreshing ? "animate-spin" : "")} /> Refresh
        </button>
      </header>

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertCircle className="mt-0.5 size-4 shrink-0" /> {error}
          <button type="button" onClick={() => void loadPage({ cursor: null })} className="ml-auto shrink-0 font-semibold underline">Retry</button>
        </div>
      )}
      {totalsError && (
        <div role="status" className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertCircle className="mt-0.5 size-4 shrink-0" /> Summary is temporarily unavailable: {totalsError}
          <button type="button" onClick={() => void loadTotals()} className="ml-auto shrink-0 font-semibold underline">Retry summary</button>
        </div>
      )}

      {totalsLoading && !totals && (
        <div role="status" className="flex items-center gap-2 text-xs font-medium text-slate-500">
          <LoaderCircle className="size-4 animate-spin" /> Calculating current platform-wide storage totals…
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Vault usage summary">
        {metricItems.map((item) => (
          <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">{item.label}</p>
            <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 tabular-nums">{item.value}</p>
            <p className="mt-1 text-[10px] leading-4 text-slate-500">{item.detail}</p>
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <h2 className="text-base font-semibold text-slate-950">Company-by-company breakdown · A–Z</h2>
            <p className="mt-1 text-xs text-slate-500">
              {query ? "Search results" : "Showing companies alphabetically"} · {items.length.toLocaleString("en-IN")} loaded
              {totals ? " of " + totals.companies.toLocaleString("en-IN") + " companies" : ""}
              {search !== query ? " · Applying search…" : ""}
            </p>
          </div>
          <label className="flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2.5 sm:w-80">
            <Search className="size-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search company, ID, or slug"
              aria-label="Search all companies by name, ID, or slug"
              className="min-w-0 flex-1 text-sm outline-none"
            />
          </label>
        </div>

        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center gap-3 p-12 text-sm text-slate-500" role="status">
            <LoaderCircle className="size-5 animate-spin" /> Loading company usage…
          </div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            {query ? "No companies match this search." : error ? "Company usage could not be loaded." : "No company vault data found."}
            {error && <button type="button" onClick={() => void loadPage({ cursor: null })} className="ml-2 font-semibold text-blue-700 underline">Try again</button>}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map((item) => {
              const percentage = item.quotaBytes > 0 ? Math.min(100, (item.usedBytes / item.quotaBytes) * 100) : 0;
              return (
                <article key={item.companyId} className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(220px,1.2fr)_minmax(220px,1fr)_minmax(210px,1fr)]">
                  <div className="min-w-0">
                    <div className="flex items-start gap-3">
                      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600"><HardDrive className="size-4.5" /></div>
                      <div className="min-w-0">
                        <Link href={("/admin/companies/" + item.companyId) as Route} className="inline-flex max-w-full items-center gap-1.5 truncate text-sm font-semibold text-slate-950 hover:text-blue-700">
                          {item.companyName}<span aria-hidden="true">↗</span>
                        </Link>
                        <p className="mt-1 truncate text-xs text-slate-500">{item.companySlug} · {item.planName}</p>
                        <p className="mt-1 text-[10px] text-slate-500">Subscription: {item.subscriptionStatus.replaceAll("_", " ").toLowerCase()}</p>
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
                        <p className="mt-1 text-lg font-semibold tabular-nums text-slate-950">
                          {formatBytes(item.usedBytes)} <span className="text-xs font-medium text-slate-400">/ {item.vaultEnabled ? formatBytes(item.quotaBytes) : "No quota"}</span>
                        </p>
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

        {nextCursor && (
          <div className="flex flex-col items-center gap-2 border-t border-slate-200 p-5">
            <button
              type="button"
              onClick={() => void loadPage({ cursor: nextCursor, append: true })}
              disabled={loadingMore || loading || refreshing || search !== query}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingMore && <LoaderCircle className="size-4 animate-spin" />}
              {loadingMore ? "Loading companies…" : "Load 10 more companies"}
            </button>
            <p className="text-xs text-slate-500">Rows load in pages of {PAGE_SIZE}; the remaining companies are fetched only when requested.</p>
          </div>
        )}
        {!nextCursor && items.length > 0 && !loading && (
          <p className="border-t border-slate-200 p-4 text-center text-xs text-slate-500">You’ve reached the end of this list.</p>
        )}
      </section>
    </div>
  );
}
