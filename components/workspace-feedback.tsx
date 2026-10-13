"use client";

import { clientApi } from "@/lib/client-api";

import { useEffect, useRef, useState } from "react";
import { Check, CheckCircle2, ChevronLeft, Copy, ExternalLink, MessageSquareText, X } from "lucide-react";
import { playFeedbackSound } from "@/lib/client-feedback-sound";

type FeedbackItem = {
  id: string;
  rating: number;
  description: string;
  createdAt: string;
  reviewStatus: "NEW" | "REVIEWED" | "RESOLVED";
  source: "CUSTOMER_BOOKING" | "COMPANY_PLATFORM" | "PUBLIC_EMBED";
  submitter: { name: string } | null;
  submitterEmail?: string | null;
  submitterPhone?: string | null;
};

type FeedbackPageResponse = {
  customerFeedback: FeedbackItem[];
  companyFeedback: FeedbackItem[];
  customerHasNext: boolean;
  companyHasNext: boolean;
  customerPage: number;
  companyPage: number;
  limit: number;
};

async function request<T>(url: string, init?: RequestInit) {
  return clientApi<T>(url, init);
}

export default function WorkspaceFeedback({
  open,
  asPage = false,
  onClose,
  canViewCustomerFeedback,
  canSubmit = true,
  canManageReviews = false,
  companySlug
}: {
  open: boolean;
  asPage?: boolean;
  onClose: () => void;
  canViewCustomerFeedback: boolean;
  canSubmit?: boolean;
  canManageReviews?: boolean;
  companySlug: string;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [customerFeedback, setCustomerFeedback] = useState<FeedbackItem[]>([]);
  const [sentFeedback, setSentFeedback] = useState<FeedbackItem[]>([]);
  const [customerPage, setCustomerPage] = useState(1);
  const [companyPage, setCompanyPage] = useState(1);
  const [customerHasNext, setCustomerHasNext] = useState(false);
  const [companyHasNext, setCompanyHasNext] = useState(false);
  const [loadingMoreCustomer, setLoadingMoreCustomer] = useState(false);
  const [loadingMoreCompany, setLoadingMoreCompany] = useState(false);
  const [tab, setTab] = useState<"customer" | "platform" | "embed">("platform");
  const [rating, setRating] = useState(0);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [publicOrigin, setPublicOrigin] = useState("");
  const [embedCopyState, setEmbedCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [reviewingId, setReviewingId] = useState("");

  useEffect(() => {
    if (!open) return;
    const originTimer = window.setTimeout(() => setPublicOrigin(window.location.origin), 0);
    if (asPage) return () => window.clearTimeout(originTimer);

    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

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
      window.clearTimeout(originTimer);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      window.setTimeout(() => previousFocusRef.current?.focus(), 0);
    };
  }, [open, onClose, asPage]);

  useEffect(() => {
    if (!open || !canViewCustomerFeedback) return;

    const timer = window.setTimeout(() => {
      setLoading(true);
      void request<FeedbackPageResponse>("/api/company/feedback?limit=5&customerPage=1&companyPage=1")
        .then((data) => {
          setCustomerFeedback(data.customerFeedback);
          setSentFeedback(data.companyFeedback);
          setCustomerPage(data.customerPage);
          setCompanyPage(data.companyPage);
          setCustomerHasNext(data.customerHasNext);
          setCompanyHasNext(data.companyHasNext);
        })
        .catch((errorValue) => {
          setError(errorValue instanceof Error ? errorValue.message : "FEEDBACK_LIST_FAILED");
        })
        .finally(() => setLoading(false));
    }, 0);

    return () => window.clearTimeout(timer);
  }, [open, canViewCustomerFeedback]);

  async function loadMoreCustomerFeedback() {
    if (!customerHasNext || loadingMoreCustomer) return;
    const nextPage = customerPage + 1;
    setLoadingMoreCustomer(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "5", customerPage: String(nextPage), companyPage: String(companyPage) });
      const data = await request<FeedbackPageResponse>("/api/company/feedback?" + params.toString());
      setCustomerFeedback((current) => {
        const known = new Set(current.map((item) => item.id));
        return [...current, ...data.customerFeedback.filter((item) => !known.has(item.id))];
      });
      setCustomerPage(data.customerPage);
      setCustomerHasNext(data.customerHasNext);
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : "FEEDBACK_LIST_FAILED");
    } finally {
      setLoadingMoreCustomer(false);
    }
  }

  async function loadMoreCompanyFeedback() {
    if (!companyHasNext || loadingMoreCompany) return;
    const nextPage = companyPage + 1;
    setLoadingMoreCompany(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "5", customerPage: String(customerPage), companyPage: String(nextPage) });
      const data = await request<FeedbackPageResponse>("/api/company/feedback?" + params.toString());
      setSentFeedback((current) => {
        const known = new Set(current.map((item) => item.id));
        return [...current, ...data.companyFeedback.filter((item) => !known.has(item.id))];
      });
      setCompanyPage(data.companyPage);
      setCompanyHasNext(data.companyHasNext);
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : "FEEDBACK_LIST_FAILED");
    } finally {
      setLoadingMoreCompany(false);
    }
  }

  async function updateReviewStatus(item: FeedbackItem, reviewStatus: FeedbackItem["reviewStatus"]) {
    if (!canManageReviews || reviewingId) return;
    setReviewingId(item.id);
    setError("");
    setNotice("");
    try {
      const updated = await request<{ reviewStatus: FeedbackItem["reviewStatus"] }>("/api/company/feedback", {
        method: "PATCH",
        body: JSON.stringify({ feedbackId: item.id, reviewStatus })
      });
      setCustomerFeedback((current) => current.map((entry) =>
        entry.id === item.id ? { ...entry, reviewStatus: updated.reviewStatus } : entry
      ));
      setNotice(updated.reviewStatus === "REVIEWED" ? "Review published to the public widget." : "Review is no longer public.");
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : "FEEDBACK_STATUS_UPDATE_FAILED");
    } finally {
      setReviewingId("");
    }
  }

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

  const embedUrl = publicOrigin && companySlug
    ? `${publicOrigin}/embed/feedback/${encodeURIComponent(companySlug)}`
    : "";
  const embedCode = embedUrl
    ? `<iframe\n  src="${embedUrl}"\n  title="Leave a review"\n  width="100%"\n  height="760"\n  loading="lazy"\n  referrerpolicy="strict-origin-when-cross-origin"\n  style="width:100%;max-width:760px;height:760px;border:0;border-radius:16px"\n></iframe>`
    : "";

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
      setNotice("Your feedback was sent privately to the Canvas platform team.");
      void playFeedbackSound();
      if (canViewCustomerFeedback) {
        const data = await request<FeedbackPageResponse>(
          "/api/company/feedback?limit=5&customerPage=1&companyPage=1"
        );
        setCustomerFeedback(data.customerFeedback);
        setSentFeedback(data.companyFeedback);
        setCustomerPage(data.customerPage);
        setCompanyPage(data.companyPage);
        setCustomerHasNext(data.customerHasNext);
        setCompanyHasNext(data.companyHasNext);
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
      className={asPage
        ? "mx-auto max-w-[1400px] px-5 py-6 sm:px-6 lg:px-10 lg:py-8"
        : "fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:items-center sm:p-5"}
      role={asPage ? undefined : "presentation"}
      onMouseDown={asPage ? undefined : (event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={dialogRef}
        role={asPage ? "region" : "dialog"}
        aria-modal={asPage ? undefined : true}
        aria-labelledby="workspace-feedback-title"
        aria-describedby="workspace-feedback-description"
        className={asPage
          ? "w-full overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm"
          : "motion-reduce:animate-none w-full max-w-2xl overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-2xl [animation:feedback-modal-in_180ms_ease-out]"}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-blue-600">
              <MessageSquareText className="size-4" aria-hidden="true" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em]">Private workspace feedback</p>
            </div>
            <h2 id="workspace-feedback-title" className="mt-1 text-lg font-semibold tracking-tight text-slate-950">
              Send feedback to Canvas
            </h2>
            <p id="workspace-feedback-description" className="mt-1 text-xs leading-5 text-slate-500">
              This is sent privately to the Canvas platform team. It is not a public company review and is never shown to customers.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={close}
            className={asPage
              ? "inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              : "grid size-9 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"}
            aria-label={asPage ? "Back to overview" : "Close feedback"}
          >
            {asPage ? <><ChevronLeft className="size-4" aria-hidden="true" /> Overview</> : <X className="size-4" aria-hidden="true" />}
          </button>
        </div>

        <div className={asPage ? "px-5 py-5 sm:px-6" : "max-h-[80vh] overflow-y-auto px-5 py-5 sm:px-6"}>
          {canViewCustomerFeedback && (
            <div className="mb-5 flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1" role="tablist" aria-label="Feedback views">
              <button
                type="button"
                role="tab"
                aria-selected={tab === "platform"}
                onClick={() => setTab("platform")}
                className={"rounded-lg px-4 py-2 text-xs font-semibold " + (tab === "platform" ? "bg-white text-blue-700 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-800")}
              >
                Send to Canvas
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
              <button
                type="button"
                role="tab"
                aria-selected={tab === "embed"}
                onClick={() => setTab("embed")}
                className={"rounded-lg px-4 py-2 text-xs font-semibold " + (tab === "embed" ? "bg-white text-blue-700 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-800")}
              >
                Public embed
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

          {tab === "embed" ? (
            <section className="space-y-5" aria-labelledby="public-feedback-embed-title">
              <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-700">Public feedback</p>
                <h3 id="public-feedback-embed-title" className="mt-1 text-base font-semibold text-slate-950">Collect reviews on any website</h3>
                <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-600">
                  Copy this iframe snippet into your website HTML. Visitors can submit their name, email, phone number, star rating, and review without creating a Canvas account. Submissions are attached to this company automatically.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold text-slate-900">Embed code</p>
                    <p className="mt-1 text-[11px] leading-5 text-slate-500">Works in HTML pages, site builders, and CMS content blocks that allow iframes.</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!publicOrigin || !embedCode}
                      onClick={() => {
                        if (!embedCode) return;
                        void navigator.clipboard.writeText(embedCode).then(
                          () => setEmbedCopyState("copied"),
                          () => setEmbedCopyState("error")
                        );
                      }}
                      className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {embedCopyState === "copied" ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
                      {embedCopyState === "copied" ? "Copied" : "Copy code"}
                    </button>
                    {embedUrl && (
                      <a
                        href={embedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <ExternalLink className="size-4" aria-hidden="true" />
                        Preview
                      </a>
                    )}
                  </div>
                </div>
                <textarea
                  aria-label="Public feedback embed code"
                  readOnly
                  value={embedCode || "Preparing the embed code…"}
                  rows={7}
                  className="mt-4 w-full resize-y rounded-xl border border-slate-300 bg-slate-950 p-3 font-mono text-[11px] leading-5 text-slate-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
                {embedCopyState === "error" && <p role="alert" className="mt-2 text-xs text-rose-700">Could not copy automatically. Select the code above and copy it manually.</p>}
                {embedCopyState === "copied" && <p role="status" className="mt-2 text-xs text-emerald-700">Embed snippet copied.</p>}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <section className="rounded-2xl border border-slate-200 bg-white p-4">
                  <h4 className="text-xs font-semibold text-slate-900">Privacy and security</h4>
                  <p className="mt-2 text-[11px] leading-5 text-slate-600">The form submits to Canvas over HTTPS. Company identity comes from the embed URL rather than visitor-supplied IDs. Phone and email are visible only to authorized company members, not to the public review list.</p>
                </section>
                <section className="rounded-2xl border border-slate-200 bg-white p-4">
                  <h4 className="text-xs font-semibold text-slate-900">Review publishing</h4>
                  <p className="mt-2 text-[11px] leading-5 text-slate-600">New reviews are stored as private until a company owner or administrator publishes them from Customer feedback. Only published reviews appear in the embedded public review list.</p>
                </section>
              </div>
            </section>
          ) : tab === "platform" ? (
            canSubmit ? (
              <>
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
                <div className="mt-2 flex gap-1" role="radiogroup" aria-label="Rate Canvas from 1 to 5 stars">
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
                  placeholder="Tell the Canvas platform team what we can improve."
                />
              </label>

              <p className="text-[10px] leading-4 text-slate-500">Action sounds are enabled automatically for supported feedback actions.</p>

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

              {sentFeedback.length > 0 && (
                <section className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4" aria-labelledby="company-platform-feedback-title">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p id="company-platform-feedback-title" className="text-xs font-semibold text-slate-900">Company → Canvas feedback</p>
                      <p className="mt-1 text-[10px] text-slate-500">Private feedback submitted by members of this company. Other companies cannot access it.</p>
                    </div>
                    <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-slate-500">{sentFeedback.length}</span>
                  </div>
                  <div className="mt-3 space-y-2">
                          {sentFeedback.map((item) => (
                      <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-3.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-amber-500" aria-label={item.rating + " of 5 stars"}>
                              {Array.from({ length: 5 }).map((_, index) => <span key={index}>{index < item.rating ? "★" : "☆"}</span>)}
                            </div>
                            <p className="mt-1 text-[10px] text-slate-400">
                              {item.submitter?.name || "Company member"} · {new Date(item.createdAt).toLocaleString()}
                            </p>
                          </div>
                          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500">{item.reviewStatus}</span>
                        </div>
                        {item.description && <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">{item.description}</p>}
                      </article>
                    ))}
                  </div>
                  {companyHasNext && <div className="mt-3 flex justify-center"><button type="button" onClick={() => void loadMoreCompanyFeedback()} disabled={loadingMoreCompany} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{loadingMoreCompany && <span className="size-3 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />}{loadingMoreCompany ? "Loading 5 more feedback items…" : "Load 5 more feedback items"}</button></div>}
                </section>
              )}
              </>
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
            <>
            <div className="space-y-2">
              {customerFeedback.map((item) => (
                <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <span className="text-amber-500" aria-label={item.rating + " of 5 stars"}>
                        {Array.from({ length: 5 }).map((_, index) => <span key={index}>{index < item.rating ? "★" : "☆"}</span>)}
                      </span>
                      <p className="mt-1 text-[10px] text-slate-400">
                        {item.submitter?.name || "Customer"} · {new Date(item.createdAt).toLocaleString()}
                      </p>
                      {(item.submitterEmail || item.submitterPhone) && (
                        <p className="mt-1 break-all text-[11px] text-slate-500">
                          {item.submitterEmail || "Email not provided"}{item.submitterPhone ? " · " + item.submitterPhone : ""}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500">{item.reviewStatus}</span>
                      <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700">{item.source === "PUBLIC_EMBED" ? "Website embed" : "Booking page"}</span>
                    </div>
                  </div>
                  {item.description && <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-slate-600">{item.description}</p>}
                  {canManageReviews && (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                      <p className="text-[10px] text-slate-500">{item.reviewStatus === "REVIEWED" ? "Visible on the public widget" : "Private until published"}</p>
                      <button
                        type="button"
                        disabled={reviewingId === item.id}
                        onClick={() => void updateReviewStatus(item, item.reviewStatus === "REVIEWED" ? "NEW" : "REVIEWED")}
                        className={`rounded-lg px-3 py-2 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${item.reviewStatus === "REVIEWED" ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}
                      >
                        {reviewingId === item.id ? "Saving…" : item.reviewStatus === "REVIEWED" ? "Hide review" : "Publish review"}
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
            {customerHasNext && <div className="mt-3 flex justify-center"><button type="button" onClick={() => void loadMoreCustomerFeedback()} disabled={loadingMoreCustomer} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{loadingMoreCustomer && <span className="size-3 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />}{loadingMoreCustomer ? "Loading 5 more reviews…" : "Load 5 more reviews"}</button></div>}
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
              <MessageSquareText className="mx-auto size-5 text-slate-300" aria-hidden="true" />
              <p className="mt-2 text-xs font-semibold text-slate-700">No customer feedback yet</p>
              <p className="mt-1 text-[11px] text-slate-500">Authenticated booking-page feedback for this company will appear here.</p>
            </div>
          )}


        </div>
      </div>
    </div>
  );
}
