"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, MessageSquareText, X } from "lucide-react";

const COOLDOWN_MS = 10 * 60 * 1000;

function keyBase(companySlug: string) {
  return `conventus:booking-feedback:v1:${companySlug}`;
}

export default function PublicFeedbackPrompt({
  companySlug,
  bookingId
}: {
  companySlug: string;
  bookingId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [lastPromptAt, setLastPromptAt] = useState(0);

  useEffect(() => {
    try {
      const base = keyBase(companySlug);
      if (window.localStorage.getItem(`${base}:submitted`) === "1") return;
      const dismissedAt = Number(window.localStorage.getItem(`${base}:dismissedAt`) || 0);
      const remaining = Math.max(0, dismissedAt + COOLDOWN_MS - Date.now());
      const timer = window.setTimeout(() => setOpen(true), remaining || 250);
      return () => window.clearTimeout(timer);
    } catch {
      setOpen(true);
    }
  }, [companySlug]);

  useEffect(() => {
    if (!open) return;
    setLastPromptAt(Date.now());
  }, [open]);

  const stars = useMemo(() => [1, 2, 3, 4, 5], []);

  function dismiss() {
    try {
      window.localStorage.setItem(`${keyBase(companySlug)}:dismissedAt`, String(lastPromptAt || Date.now()));
    } catch {
      // Local first-party state is optional and never blocks booking.
    }
    setOpen(false);
  }

  async function submit() {
    if (!rating || saving) return;
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch(`/api/public/${encodeURIComponent(companySlug)}/feedback`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          rating,
          description,
          ...(bookingId ? { bookingId } : {})
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "FEEDBACK_SUBMISSION_FAILED");

      try {
        window.localStorage.setItem(`${keyBase(companySlug)}:submitted`, "1");
      } catch {
        // Best-effort local state only.
      }
      setMessage("Thanks for sharing your experience.");
      setTimeout(() => setOpen(false), 700);
    } catch (error) {
      const code = error instanceof Error ? error.message : "FEEDBACK_SUBMISSION_FAILED";
      setMessage(code === "FEEDBACK_COOLDOWN_ACTIVE" ? "You have already sent feedback recently." : "Feedback could not be submitted. You can keep using the booking page.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <section
      aria-label="Scheduling feedback"
      className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/70 p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-blue-600 ring-1 ring-inset ring-blue-100">
          <MessageSquareText className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-600">Optional feedback</p>
              <h2 className="mt-1 text-sm font-semibold text-slate-950">How was scheduling with this company?</h2>
            </div>
            <button type="button" onClick={dismiss} className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-white hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" aria-label="Dismiss feedback">
              <X className="size-4" />
            </button>
          </div>

          <fieldset className="mt-4">
            <legend className="text-xs font-semibold text-slate-700">Rating <span className="text-rose-600">*</span></legend>
            <div className="mt-2 flex gap-1" role="radiogroup" aria-label="Rate scheduling experience from 1 to 5 stars">
              {stars.map((value) => (
                <label key={value} className="cursor-pointer rounded-lg p-1.5 focus-within:outline-none focus-within:ring-2 focus-within:ring-blue-500">
                  <input
                    type="radio"
                    name="public-feedback-rating"
                    value={value}
                    checked={rating === value}
                    onChange={() => setRating(value)}
                    className="sr-only"
                  />
                  <span aria-hidden="true" className={`text-2xl leading-none ${rating >= value ? "text-amber-400" : "text-slate-300"}`}>★</span>
                  <span className="sr-only">{value} star{value > 1 ? "s" : ""}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="mt-4 block text-xs font-semibold text-slate-700">
            Comment <span className="font-normal text-slate-400">(optional)</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={300}
              rows={3}
              className="mt-2 w-full resize-y rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm font-normal text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
              placeholder="What went well or could be improved?"
            />
          </label>
          <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
            <span aria-live="polite">{description.length}/300</span>
            {message && <span className="text-blue-700">{message}</span>}
          </div>

          <button
            type="button"
            disabled={!rating || saving}
            onClick={() => void submit()}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Sending..." : message.startsWith("Thanks") ? "Submitted" : "Send feedback"}
            {message.startsWith("Thanks") && <CheckCircle2 className="size-4" />}
          </button>
        </div>
      </div>
    </section>
  );
}
