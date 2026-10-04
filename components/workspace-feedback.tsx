"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, MessageSquareText } from "lucide-react";

type FeedbackItem = {
  id: string;
  rating: number;
  description: string;
  createdAt: string;
  reviewStatus: "NEW" | "REVIEWED" | "RESOLVED";
  submitter: { name: string } | null;
};

async function request<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, cache: "no-store", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(body.error || "REQUEST_FAILED"));
  return body.data as T;
}

export default function WorkspaceFeedback() {
  const [customerFeedback, setCustomerFeedback] = useState<FeedbackItem[]>([]);
  const [sentFeedback, setSentFeedback] = useState<FeedbackItem[]>([]);
  const [tab, setTab] = useState<"customer" | "platform">("customer");
  const [rating, setRating] = useState(0);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await request<{ customerFeedback: FeedbackItem[]; companyFeedback: FeedbackItem[] }>("/api/company/feedback?limit=25");
      setCustomerFeedback(data.customerFeedback);
      setSentFeedback(data.companyFeedback);
    } catch (e) {
      setError(e instanceof Error ? e.message : "FEEDBACK_LIST_FAILED");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function submit() {
    if (!rating || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await request("/api/company/feedback", {
        method: "POST",
        body: JSON.stringify({ rating, description })
      });
      setRating(0);
      setDescription("");
      setNotice("Your feedback was sent privately to the Conventus platform team.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "FEEDBACK_SUBMISSION_FAILED");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5 p-5 sm:p-6">
      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1" role="tablist" aria-label="Feedback views">
        <button type="button" onClick={() => setTab("customer")} className={`rounded-lg px-4 py-2 text-xs font-semibold ${tab === "customer" ? "bg-white text-blue-700 shadow-sm ring-1 ring-slate-200" : "text-slate-500"}`}>Customer feedback</button>
        <button type="button" onClick={() => setTab("platform")} className={`rounded-lg px-4 py-2 text-xs font-semibold ${tab === "platform" ? "bg-white text-blue-700 shadow-sm ring-1 ring-slate-200" : "text-slate-500"}`}>Send to Conventus</button>
      </div>

      {(error || notice) && <div role={error ? "alert" : "status"} className={`rounded-xl border px-3.5 py-3 text-xs ${error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{error || notice}</div>}

      {tab === "platform" ? (
        <section className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
          <p className="text-xs font-semibold text-slate-900">Private platform feedback</p>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">Only company owners and admins can submit this feedback. It is delivered to the platform admin inbox and is not shown to customers.</p>
          <div className="mt-4 flex gap-1" role="radiogroup" aria-label="Rate Conventus">
            {[1,2,3,4,5].map((value) => <label key={value} className="cursor-pointer rounded-lg p-1.5 focus-within:ring-2 focus-within:ring-blue-500"><input type="radio" name="platform-feedback-rating" checked={rating === value} onChange={() => setRating(value)} className="sr-only" /><span aria-hidden="true" className={`text-2xl ${rating >= value ? "text-amber-400" : "text-slate-300"}`}>★</span><span className="sr-only">{value} star{value > 1 ? "s" : ""}</span></label>)}
          </div>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} rows={4} placeholder="Tell the Conventus platform team what we can improve." className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500" />
          <div className="mt-1 flex justify-between text-[10px] text-slate-400"><span aria-live="polite">{description.length}/300</span><span>Optional</span></div>
          <button type="button" onClick={() => void submit()} disabled={!rating || saving} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50">{saving ? "Sending..." : "Send feedback"} {notice && <CheckCircle2 className="size-4" />}</button>
        </section>
      ) : loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />)}</div>
      ) : customerFeedback.length ? (
        <div className="space-y-2">{customerFeedback.map((item) => <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-center justify-between gap-3"><div><span className="text-amber-500" aria-label={`${item.rating} of 5 stars`}>{Array.from({ length: 5 }).map((_, i) => <span key={i}>{i < item.rating ? "★" : "☆"}</span>)}</span><p className="mt-1 text-[10px] text-slate-400">{item.submitter?.name || "Authenticated customer"} · {new Date(item.createdAt).toLocaleString()}</p></div><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500">{item.reviewStatus}</span></div>{item.description && <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-slate-600">{item.description}</p>}</article>)}</div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center"><MessageSquareText className="mx-auto size-5 text-slate-300" /><p className="mt-2 text-xs font-semibold text-slate-700">No customer feedback yet</p><p className="mt-1 text-[11px] text-slate-500">Authenticated booking-page feedback for this company will appear here.</p></div>
      )}
    </div>
  );
}
