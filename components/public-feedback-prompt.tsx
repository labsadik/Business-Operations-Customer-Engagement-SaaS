"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, MessageSquareText, Volume2, VolumeX, X } from "lucide-react";
import {
  isFeedbackSoundEnabled,
  setFeedbackSoundEnabled
} from "@/lib/client-feedback-sound";

type PublicFeedbackPromptProps = {
  open: boolean;
  onClose: () => void;
  companySlug: string;
  authenticated: boolean;
  loginHref: string;
};

export default function PublicFeedbackPrompt({
  open,
  onClose,
  companySlug,
  authenticated,
  loginHref
}: PublicFeedbackPromptProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [rating, setRating] = useState(0);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(false);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setSoundEnabled(isFeedbackSoundEnabled());

    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!saving) onClose();
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
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      window.setTimeout(() => previousFocusRef.current?.focus(), 0);
    };
  }, [open, onClose, saving]);

  useEffect(() => {
    if (!open) {
      setRating(0);
      setDescription("");
      setMessage("");
      setSaving(false);
    }
  }, [open]);

  function close() {
    if (saving) return;
    onClose();
  }

  function toggleSound() {
    const next = !soundEnabled;
    setSoundEnabled(next);
    setFeedbackSoundEnabled(next);
  }

  async function submit() {
    if (!authenticated || !rating || saving) return;
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/public/" + encodeURIComponent(companySlug) + "/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rating, description })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body.error || "FEEDBACK_SUBMISSION_FAILED"));

      setMessage("Thanks for sharing your experience.");
    } catch (error) {
      const code = error instanceof Error ? error.message : "FEEDBACK_SUBMISSION_FAILED";
      setMessage(
        code === "FEEDBACK_COOLDOWN_ACTIVE"
          ? "Feedback was already submitted recently. Please try again later."
          : "Feedback could not be submitted. Your text is still here, so you can try again."
      );
    } finally {
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
        aria-labelledby="public-feedback-title"
        aria-describedby="public-feedback-description"
        className="motion-reduce:animate-none w-full max-w-lg overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-2xl [animation:feedback-modal-in_180ms_ease-out]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-blue-600">
              <MessageSquareText className="size-4" aria-hidden="true" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em]">Optional feedback</p>
            </div>
            <h2 id="public-feedback-title" className="mt-1 text-lg font-semibold tracking-tight text-slate-950">
              How was your experience with this company?
            </h2>
            <p id="public-feedback-description" className="mt-1 text-xs leading-5 text-slate-500">
              This private feedback is shared with the owning company&apos;s authorized feedback view and the Conventus platform team.
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

        <div className="max-h-[78vh] overflow-y-auto px-5 py-5 sm:px-6">
          {!authenticated ? (
            <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-5">
              <p className="text-sm font-semibold text-slate-950">Sign in to send feedback</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                Only authenticated customer accounts can submit feedback. You will return to /{companySlug} after Google sign-in.
              </p>
              <a
                href={loginHref}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-semibold text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:w-auto"
              >
                Continue with Google
              </a>
            </div>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
              className="space-y-5"
            >
              <fieldset>
                <legend className="text-xs font-semibold text-slate-700">
                  Rating <span className="text-rose-600">*</span>
                </legend>
                <div className="mt-2 flex gap-1" role="radiogroup" aria-label="Rating from 1 to 5 stars">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <label
                      key={value}
                      className="cursor-pointer rounded-xl p-1.5 focus-within:outline-none focus-within:ring-2 focus-within:ring-blue-500"
                    >
                      <input
                        type="radio"
                        name="public-feedback-rating"
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
                  placeholder="What went well or could be improved?"
                />
              </label>

              <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3.5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-800">Feedback sound</p>
                  <p className="mt-1 text-[10px] leading-4 text-slate-500">Off by default. Sound plays only when you open this form.</p>
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
                <span aria-live="polite" className={message.startsWith("Thanks") ? "text-emerald-700" : "text-rose-700"}>
                  {message}
                </span>
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
                  disabled={!rating || saving || message.startsWith("Thanks")}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "Sending..." : message.startsWith("Thanks") ? "Submitted" : "Submit feedback"}
                  {message.startsWith("Thanks") && <CheckCircle2 className="size-4" aria-hidden="true" />}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
