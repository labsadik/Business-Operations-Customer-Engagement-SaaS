"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, MessageSquareText, Volume2, VolumeX, X } from "lucide-react";
import {
  isFeedbackSoundEnabled,
  setFeedbackSoundEnabled
} from "@/lib/client-feedback-sound";

type FeedbackItem = {
  id: string;
  rating: number;
  description: string;
  createdAt: string;
  reviewStatus: "NEW" | "REVIEWED" | "RESOLVED";
  submitter: { name: string } | null;
};

async function request<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(body.error || "REQUEST_FAILED"));
  }
  return body.data as T;
}

export default function WorkspaceFeedback({
  open,
  onClose,
  canViewCustomerFeedback,
  canSubmit = true
}: {
  open: boolean;
  onClose: () => void;
  canViewCustomerFeedback: boolean;
  canSubmit?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [customerFeedback, setCustomerFeedback] = useState<FeedbackItem[]>([]);
  const [sentFeedback, setSentFeedback] = useState<FeedbackItem[]>([]);
  const [tab, setTab] = useState<"customer" | "platform">("platform");
  const [rating, setRating] = useState(0);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(false);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const soundTimer = window.setTimeout(() => {
      setSoundEnabled(isFeedbackSoundEnabled());
    }, 0);

    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!savingRef.current) onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const root = dialogRef.current;
      if (!root) return;
      const focusable = Array.from(
        root.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled])'
        )
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.clearTimeout(soundTimer);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      window.setTimeout(() => previousFocusRef.current?.focus(), 0);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !canViewCustomerFeedback) return;

    const timer = window.setTimeout(() => {
      setLoading(true);
      void request<{ customerFeedback: FeedbackItem[]; companyFeedback: FeedbackItem[] }>(
        "/api/company/feedback?limit=25"
      )
        .then((data) => {
          setCustomerFeedback(data.customerFeedback);
          setSentFeedback(data.companyFeedback);
        })
        .catch((errorValue) => {
          setError(errorValue instanceof Error ? errorValue.message : "FEEDBACK_LIST_FAILED");
        })
        .finally(() => setLoading(false));
    }, 0);

    return () => window.clearTimeout(timer);
  }, [open, canViewCustomerFeedback]);

  function close() {
    if (saving) return;
    setRating(0);
    setDescription("");
    setError("");
    setNotice("");
    setSaving(false);
    setTab("platform");
    onClose();
  }

  function toggleSound() {
    const next = !soundEnabled;
    setSoundEnabled(next);
    setFeedbackSoundEnabled(next);
  }

  async function submit() {
    if (!canSubmit || !rating || saving) return;
    savingRef.current = true;
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
      if (canViewCustomerFeedback) {
        const data = await request<{ customerFeedback: FeedbackItem[]; companyFeedback: FeedbackItem[] }>(
          "/api/company/feedback?limit=25"
        );
        setCustomerFeedback(data.customerFeedback);
        setSentFeedback(data.companyFeedback);
      }
    } catch (errorValue) {
      const code = errorValue instanceof Error ? errorValue.message : "FEEDBACK_SUBMISSION_FAILED";
      setError(
        code === "FEEDBACK_COOLDOWN_ACTIVE"
          ? "You already sent feedback recently. Please try again later."
          : "Feedback could not be sent. Your draft is still here, so you can retry."
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:items-center sm:p-5"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-feedback-title"
        aria-describedby="workspace-feedback-description"
        className="motion-reduce:animate-none w-full max-w-2xl overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-2xl [animation:feedback-modal-in_180ms_ease-out]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-blue-600">
              <MessageSquareText className="size-4" aria-hidden="true" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em]">Private workspace feedback</p>
            </div>
            <h2 id="workspace-feedback-title" className="mt-1 text-lg font-semibold tracking-tight text-slate-950">
              Send feedback to Conventus
            </h2>
            <p id="workspace-feedback-description" className="mt-1 text-xs leading-5 text-slate-500">
              This is sent privately to the Conventus platform team. It is not a public company review and is never shown to customers.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={close}
            className="grid size-9 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Close feedback"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="max-h-[80vh] overflow-y-auto px-5 py-5 sm:px-6">
          {canViewCustomerFeedback && (
            <div className="mb-5 flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1" role="tablist" aria-label="Feedback views">
              <button
                type="button"
                role="tab"
                aria-selected={tab === "platform"}
                onClick={() => setTab("platform")}
                className={"rounded-lg px-4 py-2 text-xs font-semibold " + (tab === "platform" ? "bg-white text-blue-700 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-800")}
              >
                Send to Conventus
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "customer"}
                onClick={() => setTab("customer")}
                className={"rounded-lg px-4 py-2 text-xs font-semibold " + (tab === "customer" ? "bg-white text-blue-700 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-800")}
              >
                Customer feedback
              </button>
            </div>
          )}

          {(error || notice) && (
            <div
              role={error ? "alert" : "status"}
              aria-live="polite"
              className={"mb-5 rounded-xl border px-3.5 py-3 text-xs " + (
                error
                  ? "border-rose-200 bg-rose-50 text-rose-800"
                  : "border-emerald-200 bg-emerald-50 text-emerald-800"
              )}
            >
              {error || notice}
            </div>
          )}

          {!canSubmit && (
            <div className="mb-5 rounded-2xl border border-violet-100 bg-violet-50/70 p-4">
              <p className="text-xs font-semibold text-violet-950">Platform admin support mode</p>
              <p className="mt-1 text-[11px] leading-5 text-violet-800">
                This company workspace is being viewed by a platform administrator. Customer feedback can be reviewed here, but only an active company member may submit workspace feedback.
              </p>
            </div>
          )}

          {tab === "platform" ? (
            canSubmit ? (
              <form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="space-y-5">
              <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
                <p className="text-xs font-semibold text-slate-900">Private platform feedback</p>
                <p className="mt-1 text-[11px] leading-5 text-slate-600">
                  Your signed-in company membership and workspace are attached automatically on the server. No name, email, company, or employee identity fields are required.
                </p>
              </div>

              <fieldset>
                <legend className="text-xs font-semibold text-slate-700">
                  Rating <span className="text-rose-600">*</span>
                </legend>
                <div className="mt-2 flex gap-1" role="radiogroup" aria-label="Rate Conventus from 1 to 5 stars">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <label key={value} className="cursor-pointer rounded-xl p-1.5 focus-within:outline-none focus-within:ring-2 focus-within:ring-blue-500">
                      <input
                        type="radio"
                        name="workspace-platform-feedback-rating"
                        value={value}
                        checked={rating === value}
                        onChange={() => setRating(value)}
                        className="sr-only"
                      />
                      <span aria-hidden="true" className={"text-3xl leading-none " + (rating >= value ? "text-amber-400" : "text-slate-300")}>★</span>
                      <span className="sr-only">{value} star{value > 1 ? "s" : ""}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="block text-xs font-semibold text-slate-700">
                Written feedback <span className="font-normal text-slate-400">(optional, 300 characters max)</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={300}
                  rows={5}
                  className="mt-2 w-full resize-y rounded-2xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                  placeholder="Tell the Conventus platform team what we can improve."
                />
              </label>

              <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3.5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-800">Feedback sound</p>
                  <p className="mt-1 text-[10px] leading-4 text-slate-500">Off by default. Sound only plays after you explicitly open this feedback form.</p>
                </div>
                <button
                  type="button"
                  onClick={toggleSound}
                  className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:self-auto"
                  aria-pressed={soundEnabled}
                >
                  {soundEnabled ? <Volume2 className="size-4" aria-hidden="true" /> : <VolumeX className="size-4" aria-hidden="true" />}
                  {soundEnabled ? "Sound on" : "Sound off"}
                </button>
              </div>

              <div className="flex items-center justify-between gap-3 text-[11px]">
                <span aria-live="polite" className="text-slate-400">{description.length}/300</span>
                {!notice && <span className="text-slate-400">Optional comment</span>}
              </div>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={close}
                  disabled={saving}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!canSubmit || !rating || saving || Boolean(notice)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "Sending..." : "Submit feedback"}
                  {notice && <CheckCircle2 className="size-4" aria-hidden="true" />}
                </button>
              </div>
              </form>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-sm font-semibold text-slate-900">Feedback submission is unavailable in support mode</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  Only authenticated company members can submit feedback for a company workspace. The platform administrator can still review customer feedback for this managed workspace.
                </p>
              </div>
            )
          ) : loading ? (
            <div className="space-y-2" aria-live="polite" aria-busy="true">
              {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-20 animate-pulse rounded-xl bg-slate-100" />)}
            </div>
          ) : customerFeedback.length ? (
            <div className="space-y-2">
              {customerFeedback.map((item) => (
                <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <span className="text-amber-500" aria-label={item.rating + " of 5 stars"}>
                        {Array.from({ length: 5 }).map((_, index) => <span key={index}>{index < item.rating ? "★" : "☆"}</span>)}
                      </span>
                      <p className="mt-1 text-[10px] text-slate-400">
                        {item.submitter?.name || "Authenticated customer"} · {new Date(item.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500">{item.reviewStatus}</span>
                  </div>
                  {item.description && <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-slate-600">{item.description}</p>}
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
              <MessageSquareText className="mx-auto size-5 text-slate-300" aria-hidden="true" />
              <p className="mt-2 text-xs font-semibold text-slate-700">No customer feedback yet</p>
              <p className="mt-1 text-[11px] text-slate-500">Authenticated booking-page feedback for this company will appear here.</p>
            </div>
          )}

          {tab === "platform" && canViewCustomerFeedback && sentFeedback.length > 0 && (
            <section className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4" aria-labelledby="sent-platform-feedback-title">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p id="sent-platform-feedback-title" className="text-xs font-semibold text-slate-900">Your company&apos;s previous platform feedback</p>
                  <p className="mt-1 text-[10px] text-slate-500">Private and visible only to authorized company feedback viewers.</p>
                </div>
                <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-slate-500">{sentFeedback.length}</span>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
