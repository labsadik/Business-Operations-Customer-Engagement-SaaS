"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, LoaderCircle, MessageSquareText, Star } from "lucide-react";
import { playFeedbackSound } from "@/lib/client-feedback-sound";

type PublicReview = {
  id: string;
  name: string;
  rating: number;
  description: string;
  createdAt: string;
};

type PublicFeedbackResponse = {
  ok: boolean;
  data?: { company: { name: string; slug: string }; reviews: PublicReview[] };
  error?: string;
};

export default function PublicFeedbackEmbed({ companySlug, companyName }: { companySlug: string; companyName: string }) {
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [loadingError, setLoadingError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [rating, setRating] = useState(0);
  const [description, setDescription] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const endpoint = "/api/public/" + encodeURIComponent(companySlug) + "/embedded-feedback";
  const loadReviews = useCallback(async () => {
    setLoadingError("");
    try {
      const response = await fetch(endpoint, { cache: "no-store", credentials: "omit" });
      const result = await response.json() as PublicFeedbackResponse;
      if (!response.ok || !result.ok || !result.data) throw new Error(result.error || "PUBLIC_FEEDBACK_LOAD_FAILED");
      setReviews(result.data.reviews);
    } catch {
      setLoadingError("Published reviews are temporarily unavailable.");
    } finally {
      setLoadingReviews(false);
    }
  }, [endpoint]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadReviews(), 0);
    return () => window.clearTimeout(timer);
  }, [loadReviews]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || rating < 1) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "omit",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, phone, rating, description, website: honeypot })
      });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || "PUBLIC_FEEDBACK_SUBMISSION_FAILED");

      setName("");
      setEmail("");
      setPhone("");
      setRating(0);
      setDescription("");
      setHoneypot("");
      setMessage("Thank you — your review has been received and will appear after company approval.");
      void playFeedbackSound();
      await loadReviews();
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      setMessage(
        code === "FEEDBACK_RATE_LIMITED" || code === "FEEDBACK_EMAIL_COOLDOWN"
          ? "A review was recently submitted. Please wait before sending another."
          : code === "CSRF_ORIGIN_INVALID"
            ? "This embed could not verify the request origin. Reload this page and try again."
            : "Your review could not be sent. Please check the fields and try again."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 bg-white p-4 text-slate-900 sm:p-6">
      <header className="border-b border-slate-200 pb-4">
        <div className="flex items-center gap-2 text-blue-700">
          <MessageSquareText className="size-5" aria-hidden="true" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em]">Customer reviews</span>
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{companyName}</h1>
        <p className="mt-1 text-sm leading-6 text-slate-500">Share your experience. Your review is sent securely to the company.</p>
      </header>

      <form onSubmit={(event) => void submit(event)} className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-xs font-semibold text-slate-700">
            Full name <span className="text-rose-600">*</span>
            <input required maxLength={100} autoComplete="name" value={name} onChange={event => setName(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10" />
          </label>
          <label className="block text-xs font-semibold text-slate-700">
            Email address <span className="text-rose-600">*</span>
            <input required type="email" maxLength={254} autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10" />
          </label>
          <label className="block text-xs font-semibold text-slate-700 sm:col-span-2">
            Phone number <span className="text-rose-600">*</span>
            <input required type="tel" maxLength={32} autoComplete="tel" value={phone} onChange={event => setPhone(event.target.value)} placeholder="+1 555 123 4567" className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10" />
          </label>
        </div>

        <fieldset>
          <legend className="text-xs font-semibold text-slate-700">Your rating <span className="text-rose-600">*</span></legend>
          <div className="mt-2 flex gap-2" role="radiogroup" aria-label="Choose a rating from one to five stars">
            {[1, 2, 3, 4, 5].map(value => (
              <label key={value} className="cursor-pointer rounded-lg p-1 focus-within:outline-none focus-within:ring-2 focus-within:ring-blue-500">
                <input className="sr-only" type="radio" name="rating" value={value} checked={rating === value} onChange={() => setRating(value)} required />
                <Star className={`size-7 ${rating >= value ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} aria-hidden="true" />
                <span className="sr-only">{value} star{value > 1 ? "s" : ""}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block text-xs font-semibold text-slate-700">
          Review <span className="text-rose-600">*</span>
          <textarea required minLength={5} maxLength={1000} rows={4} value={description} onChange={event => setDescription(event.target.value)} placeholder="Tell us about your experience…" className="mt-1.5 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10" />
          <span className="mt-1 block text-right text-[10px] font-normal text-slate-400">{description.length}/1000</span>
        </label>

        <div className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
          <label>Leave this field empty<input tabIndex={-1} autoComplete="off" value={honeypot} onChange={event => setHoneypot(event.target.value)} /></label>
        </div>

        {message && <p role={message.startsWith("Thank you") ? "status" : "alert"} className={`rounded-xl border px-3 py-2.5 text-xs leading-5 ${message.startsWith("Thank you") ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>{message}</p>}

        <button type="submit" disabled={saving || !rating} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">
          {saving ? <><LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Sending review…</> : <><CheckCircle2 className="size-4" aria-hidden="true" /> Submit review</>}
        </button>
        <p className="text-[10px] leading-4 text-slate-500">Contact details are shared only with authorized members of this company and are never shown in the public review list.</p>
      </form>

      <section aria-labelledby="published-reviews-title">
        <div className="flex items-center justify-between gap-3">
          <h2 id="published-reviews-title" className="text-base font-semibold">Published reviews</h2>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">{reviews.length}</span>
        </div>
        {loadingReviews ? (
          <div className="mt-3 space-y-2" aria-busy="true" aria-live="polite">
            {[1, 2, 3].map(value => <div key={value} className="h-20 animate-pulse rounded-xl bg-slate-100" />)}
          </div>
        ) : loadingError ? (
          <p role="status" className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">{loadingError}</p>
        ) : reviews.length ? (
          <div className="mt-3 space-y-3">
            {reviews.map(review => (
              <article key={review.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{review.name}</p>
                    <p className="mt-1 text-amber-500" aria-label={review.rating + " out of 5 stars"}>{"★".repeat(review.rating)}{"☆".repeat(5-review.rating)}</p>
                  </div>
                  <time className="text-[10px] text-slate-400" dateTime={review.createdAt}>{new Date(review.createdAt).toLocaleDateString()}</time>
                </div>
                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{review.description}</p>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-dashed border-slate-300 p-6 text-center">
            <p className="text-sm font-semibold text-slate-700">No published reviews yet</p>
            <p className="mt-1 text-xs text-slate-500">Approved customer reviews will appear here.</p>
          </div>
        )}
      </section>
      <footer className="border-t border-slate-200 pt-3 text-center text-[10px] text-slate-400">Feedback powered by Canvas</footer>
    </main>
  );
}
