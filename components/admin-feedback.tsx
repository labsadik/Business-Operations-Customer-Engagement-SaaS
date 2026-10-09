"use client";

import { clientApi } from "@/lib/client-api";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, MessageSquareText } from "lucide-react";

type CompanyOption = { id: string; name: string; slug: string };
type FeedbackItem = {
  id: string;
  source: "CUSTOMER_BOOKING" | "COMPANY_PLATFORM";
  company: { id: string; name: string; slug: string } | null;
  rating: number;
  description: string;
  createdAt: string;
  reviewStatus: "NEW" | "REVIEWED" | "RESOLVED";
  submitter: { name: string } | null;
  booking: { id: string; startAt: string } | null;
};

async function request<T>(url: string, init?: RequestInit) {
  return clientApi<T>(url, init);
}

export default function AdminFeedback() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [source, setSource] = useState("");
  const [rating, setRating] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [reviewStatus, setReviewStatus] = useState("");
  const [date, setDate] = useState("");
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);

  const loadCompanies = useCallback(async function loadCompanies() {
    try {
      setCompanies(await request<CompanyOption[]>("/api/admin/companies/options?limit=25"));
    } catch {
      setCompanies([]);
    }
  }, []);

  const load = useCallback(async function load() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: "25" });
      if (source) params.set("source", source);
      if (rating) params.set("rating", rating);
      if (companyId) params.set("companyId", companyId);
      if (reviewStatus) params.set("reviewStatus", reviewStatus);
      if (date) {
        params.set("from", date);
        params.set("to", date);
      }
      const body = await request<{ items: FeedbackItem[]; page: number; hasNext: boolean }>(`/api/admin/feedback?${params.toString()}`);
      setItems(body.items);
      setHasNext(body.hasNext);
    } catch (e) {
      setError(e instanceof Error ? e.message : "FEEDBACK_LIST_FAILED");
    } finally {
      setLoading(false);
    }
  }, [page, source, rating, companyId, reviewStatus, date]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void loadCompanies(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadCompanies]);

  async function setStatus(id: string, next: FeedbackItem["reviewStatus"]) {
    if (savingId) return;
    setSavingId(id);
    setError("");
    try {
      await request(`/api/admin/feedback?id=${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ reviewStatus: next }) });
      setNotice("Feedback status saved.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "FEEDBACK_STATUS_UPDATE_FAILED");
    } finally {
      setSavingId("");
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div><div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-600"><MessageSquareText className="size-4" />Platform feedback inbox</div><h1 className="mt-2 text-3xl font-semibold tracking-tight">Feedback</h1><p className="mt-2 text-sm leading-6 text-slate-500">Customer feedback about company scheduling and private company feedback about Conventus are stored separately and shown here with clear source labels.</p></div>
        </div>
      </section>

      {(error || notice) && <div role={error ? "alert" : "status"} className={`rounded-2xl border px-4 py-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{error || notice}</div>}

      <section className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-xs font-semibold">Source<select value={source} onChange={(e) => { setPage(1); setSource(e.target.value); }} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal"><option value="">All sources</option><option value="CUSTOMER_BOOKING">Customer booking</option><option value="COMPANY_PLATFORM">Company → platform</option></select></label>
        <label className="text-xs font-semibold">Rating<select value={rating} onChange={(e) => { setPage(1); setRating(e.target.value); }} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal"><option value="">All ratings</option>{[1,2,3,4,5].map((n) => <option key={n} value={n}>{n} star{n > 1 ? "s" : ""}</option>)}</select></label>
        <label className="text-xs font-semibold">Company<select value={companyId} onChange={(e) => { setPage(1); setCompanyId(e.target.value); }} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal"><option value="">All companies</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="text-xs font-semibold">Date<input type="date" value={date} onChange={(e) => { setPage(1); setDate(e.target.value); }} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" /></label>
        <label className="text-xs font-semibold">Review status<select value={reviewStatus} onChange={(e) => { setPage(1); setReviewStatus(e.target.value); }} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal"><option value="">All statuses</option><option value="NEW">New</option><option value="REVIEWED">Reviewed</option><option value="RESOLVED">Resolved</option></select></label>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        {loading ? <div className="space-y-3 p-5">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />)}</div> : items.length ? <div className="divide-y divide-slate-100">{items.map((item) => (
          <article key={item.id} className="p-5 sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${item.source === "CUSTOMER_BOOKING" ? "bg-blue-50 text-blue-700" : "bg-violet-50 text-violet-700"}`}>{item.source === "CUSTOMER_BOOKING" ? "Customer booking page" : "Company → Conventus"}</span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">{item.reviewStatus}</span>
                </div>
                <p className="mt-3 text-sm font-semibold">{item.company?.name || "Unknown company"}</p>
                <div className="mt-1 text-amber-500" aria-label={`${item.rating} out of 5 stars`}>{Array.from({ length: 5 }).map((_, i) => <span key={i}>{i < item.rating ? "★" : "☆"}</span>)}</div>
                {item.description && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{item.description}</p>}
                <p className="mt-3 text-[10px] text-slate-400">{new Date(item.createdAt).toLocaleString()} · {item.submitter?.name || "Authenticated user"}</p>
                {item.booking && <p className="mt-1 text-[10px] text-slate-400">Booking {item.booking.id.slice(-8)} · {new Date(item.booking.startAt).toLocaleString()}</p>}
              </div>
              <div className="flex items-center gap-2 lg:justify-end">
                <label className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400"><span className="sr-only">Review status</span><select value={item.reviewStatus} onChange={(e) => void setStatus(item.id, e.target.value as FeedbackItem["reviewStatus"])} disabled={savingId === item.id} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700">{["NEW","REVIEWED","RESOLVED"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                {savingId === item.id && <span role="status" className="text-[10px] text-slate-400">Saving...</span>}
              </div>
            </div>
          </article>
        ))}</div> : <div className="p-14 text-center"><CheckCircle2 className="mx-auto size-6 text-slate-300" /><p className="mt-3 text-sm font-semibold">No feedback found</p><p className="mt-1 text-xs text-slate-500">Feedback will appear here after an authenticated customer or company member submits it.</p></div>}
      </section>

      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
        <button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold disabled:opacity-40">Previous</button>
        <span className="text-xs font-semibold text-slate-500">Page {page}</span>
        <button type="button" disabled={!hasNext} onClick={() => setPage((current) => current + 1)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold disabled:opacity-40">Next</button>
      </div>
    </div>
  );
}
