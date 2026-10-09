"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  LifeBuoy,
  Loader2,
  Plus,
  RotateCcw,
  X
} from "lucide-react";

type SupportTicketItem = {
  id: string;
  subject: string;
  status: "NOT_SEEN" | "PROCESSING" | "COMPLETED";
  createdAt: string;
  updatedAt: string;
  submitter: {
    name: string;
    email: string;
  };
};

type SupportTicketDetail = SupportTicketItem & {
  description: string;
  statusChangedAt: string | null;
};

type CompanyContext = {
  name: string;
  email: string;
  phone: string;
};

const SUBJECT_MAX = 120;
const DESCRIPTION_MAX = 2000;

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
    const error = new Error(String(body.error || "REQUEST_FAILED")) as Error & {
      code?: string;
    };
    error.code = body.error;
    throw error;
  }
  return body.data as T;
}

function ticketNumber(id: string) {
  return "SUP-" + id.slice(-8).toUpperCase();
}

function statusLabel(status: SupportTicketItem["status"]) {
  if (status === "NOT_SEEN") return "Not seen";
  if (status === "PROCESSING") return "Processing";
  return "Completed";
}

function statusClass(status: SupportTicketItem["status"]) {
  if (status === "NOT_SEEN") return "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200";
  if (status === "PROCESSING") return "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200";
  return "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export default function WorkspaceSupportTickets({
  open,
  asPage = false,
  onClose,
  user,
  company
}: {
  open: boolean;
  asPage?: boolean;
  onClose: () => void;
  user: { name: string; email: string };
  company: CompanyContext;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const savingRef = useRef(false);

  const [items, setItems] = useState<SupportTicketItem[]>([]);
  const [selected, setSelected] = useState<SupportTicketDetail | null>(null);
  const [view, setView] = useState<"list" | "create" | "detail">("list");
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!open || asPage) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 0);

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
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled])'
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
  }, [open, onClose, asPage]);

  const loadTickets = useCallback(async (nextPage = page) => {
    setLoading(true);
    setError("");
    try {
      const data = await request<{
        items: SupportTicketItem[];
        page: number;
        hasNext: boolean;
      }>(`/api/company/support-tickets?page=${nextPage}&limit=8`);
      setItems(data.items);
      setPage(data.page);
      setHasNext(data.hasNext);
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : "SUPPORT_TICKET_LIST_FAILED");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    if (!open || view !== "list") return;
    const timer = window.setTimeout(() => {
      void loadTickets(page);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadTickets, open, page, view]);

  function startCreate() {
    setView("create");
    setSubject("");
    setDescription("");
    setError("");
    setNotice("");
    setSelected(null);
  }

  function closeModal() {
    if (saving) return;
    setView("list");
    setSelected(null);
    setSubject("");
    setDescription("");
    setError("");
    setNotice("");
    onClose();
  }

  async function openDetail(id: string) {
    setDetailLoading(true);
    setError("");
    setNotice("");
    try {
      const data = await request<SupportTicketDetail>(
        `/api/company/support-tickets/${encodeURIComponent(id)}`
      );
      setSelected(data);
      setView("detail");
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : "SUPPORT_TICKET_DETAIL_FAILED");
    } finally {
      setDetailLoading(false);
    }
  }

  async function submit() {
    if (!subject.trim() || !description.trim() || savingRef.current) return;

    savingRef.current = true;
    setSaving(true);
    setError("");
    setNotice("");

    try {
      const data = await request<{
        id: string;
        status: SupportTicketItem["status"];
      }>("/api/company/support-tickets", {
        method: "POST",
        body: JSON.stringify({ subject, description })
      });

      setSubject("");
      setDescription("");
      setNotice(`Ticket ${ticketNumber(data.id)} was submitted to Conventus support.`);
      setView("list");
      await loadTickets(1);
    } catch (errorValue) {
      const code =
        errorValue instanceof Error && "code" in errorValue
          ? String((errorValue as Error & { code?: string }).code || "")
          : "";
      setError(
        code === "SUPPORT_TICKET_DUPLICATE"
          ? "The same ticket was just submitted. Check your ticket list before sending it again."
          : code === "SUPPORT_TICKET_RATE_LIMITED"
            ? "Too many support tickets were submitted recently. Please try again later."
            : "Ticket could not be submitted. Your text is still here, so you can retry."
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
        if (event.target === event.currentTarget && !saving) closeModal();
      }}
    >
      <div
        ref={dialogRef}
        role={asPage ? "region" : "dialog"}
        aria-modal={asPage ? undefined : true}
        aria-labelledby="support-ticket-title"
        className={asPage
          ? "w-full overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm"
          : "motion-reduce:animate-none flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-2xl [animation:feedback-modal-in_180ms_ease-out]"}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-blue-600">
              <LifeBuoy className="size-4" aria-hidden="true" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em]">Conventus support</p>
            </div>
            <h2 id="support-ticket-title" className="mt-1 text-lg font-semibold tracking-tight text-slate-950">
              Support tickets
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Contact the platform support team and track the status of tickets submitted by your company.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={closeModal}
            className={asPage
              ? "inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              : "grid size-9 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"}
            aria-label={asPage ? "Back to overview" : "Close support tickets"}
          >
            {asPage ? <><ChevronLeft className="size-4" aria-hidden="true" /> Overview</> : <X className="size-4" aria-hidden="true" />}
          </button>
        </div>

        <div className={asPage ? "p-5 sm:p-6" : "min-h-0 flex-1 overflow-y-auto p-5 sm:p-6"}>
          {(error || notice) && (
            <div
              role={error ? "alert" : "status"}
              aria-live="polite"
              className={"mb-5 rounded-2xl border px-4 py-3 text-xs " + (
                error
                  ? "border-rose-200 bg-rose-50 text-rose-800"
                  : "border-emerald-200 bg-emerald-50 text-emerald-800"
              )}
            >
              {error || notice}
            </div>
          )}

          {view === "list" && (
            <>
              <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-900">Need help from Conventus?</p>
                  <p className="mt-1 text-[11px] leading-5 text-slate-500">
                    Your signed-in company identity and workspace are attached automatically.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={startCreate}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                >
                  <Plus className="size-4" aria-hidden="true" />
                  Create ticket
                </button>
              </div>

              {loading ? (
                <div className="space-y-2" aria-live="polite" aria-busy="true">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
                  ))}
                </div>
              ) : items.length ? (
                <div className="space-y-2">
                  {items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => void openDetail(item.id)}
                      className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 motion-reduce:transform-none"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-bold tracking-[0.08em] text-slate-400">{ticketNumber(item.id)}</span>
                            <span className={"rounded-full px-2.5 py-1 text-[10px] font-semibold " + statusClass(item.status)}>
                              {statusLabel(item.status)}
                            </span>
                          </div>
                          <p className="mt-2 truncate text-sm font-semibold text-slate-950">{item.subject}</p>
                          <p className="mt-1 text-[11px] text-slate-500">
                            Submitted by {item.submitter.name} · {formatDate(item.createdAt)}
                          </p>
                        </div>
                        <ChevronRight className="size-4 shrink-0 text-slate-300 sm:mt-2" aria-hidden="true" />
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
                  <LifeBuoy className="mx-auto size-6 text-slate-300" aria-hidden="true" />
                  <p className="mt-3 text-sm font-semibold text-slate-800">No support tickets yet</p>
                  <p className="mt-1 text-xs text-slate-500">Create a ticket to contact the Conventus platform support team.</p>
                </div>
              )}

              {(page > 1 || hasNext) && (
                <div className="mt-5 flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <button
                    type="button"
                    disabled={page <= 1 || loading}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40"
                  >
                    <ChevronLeft className="size-3.5" aria-hidden="true" />
                    Previous
                  </button>
                  <span className="text-xs font-semibold text-slate-500">Page {page}</span>
                  <button
                    type="button"
                    disabled={!hasNext || loading}
                    onClick={() => setPage((current) => current + 1)}
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40"
                  >
                    Next
                    <ChevronRight className="size-3.5" aria-hidden="true" />
                  </button>
                </div>
              )}

              {detailLoading && (
                <p className="mt-3 text-center text-[10px] font-semibold text-slate-400" role="status">
                  Loading ticket…
                </p>
              )}
            </>
          )}

          {view === "create" && (
            <div className="space-y-5">
              <button
                type="button"
                onClick={() => setView("list")}
                className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900"
              >
                <ChevronLeft className="size-3.5" aria-hidden="true" />
                Back to tickets
              </button>

              <section className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
                <p className="text-xs font-semibold text-slate-900">Ticket context</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/80 bg-white/80 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Submitting member</p>
                    <p className="mt-1 text-xs font-semibold text-slate-800">{user.name}</p>
                    <p className="mt-1 truncate text-[10px] text-slate-500">{user.email}</p>
                  </div>
                  <div className="rounded-xl border border-white/80 bg-white/80 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Company</p>
                    <p className="mt-1 text-xs font-semibold text-slate-800">{company.name}</p>
                    <p className="mt-1 truncate text-[10px] text-slate-500">{company.email || company.phone || "Company contact configured"}</p>
                  </div>
                </div>
              </section>

              <label className="block text-xs font-semibold text-slate-700">
                Subject <span className="text-rose-600">*</span>
                <input
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  maxLength={SUBJECT_MAX}
                  autoComplete="off"
                  className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                  placeholder="Briefly describe the issue"
                />
                <span className="mt-1 block text-right text-[10px] font-normal text-slate-400" aria-live="polite">
                  {subject.length}/{SUBJECT_MAX}
                </span>
              </label>

              <label className="block text-xs font-semibold text-slate-700">
                Problem description <span className="text-rose-600">*</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={DESCRIPTION_MAX}
                  rows={7}
                  className="mt-2 w-full resize-y rounded-2xl border border-slate-300 bg-white px-3.5 py-3 text-sm leading-6 text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                  placeholder="Explain what is happening and what you expected to happen."
                />
                <span className="mt-1 block text-right text-[10px] font-normal text-slate-400" aria-live="polite">
                  {description.length}/{DESCRIPTION_MAX}
                </span>
              </label>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setView("list")}
                  disabled={saving}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={saving || !subject.trim() || !description.trim()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                  {saving ? "Submitting…" : "Submit ticket"}
                </button>
              </div>
            </div>
          )}

          {view === "detail" && selected && (
            <div className="space-y-5">
              <button
                type="button"
                onClick={() => setView("list")}
                className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900"
              >
                <ChevronLeft className="size-3.5" aria-hidden="true" />
                Back to tickets
              </button>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold tracking-[0.08em] text-slate-400">{ticketNumber(selected.id)}</p>
                    <h3 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">{selected.subject}</h3>
                  </div>
                  <span className={"self-start rounded-full px-2.5 py-1 text-[10px] font-semibold " + statusClass(selected.status)}>
                    {statusLabel(selected.status)}
                  </span>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Submitted by</p>
                    <p className="mt-1 text-xs font-semibold text-slate-800">{selected.submitter.name}</p>
                    <p className="mt-1 truncate text-[10px] text-slate-500">{selected.submitter.email}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Dates</p>
                    <p className="mt-1 text-[10px] text-slate-500">Created {formatDate(selected.createdAt)}</p>
                    <p className="mt-1 text-[10px] text-slate-500">Updated {formatDate(selected.updatedAt)}</p>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Problem description</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700">{selected.description}</p>
                </div>

                <div className="mt-4 flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3.5">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-blue-600" aria-hidden="true" />
                  <p className="text-[11px] leading-5 text-blue-900">
                    Ticket status is managed by Conventus support. Opening this ticket does not change its status.
                  </p>
                </div>
              </section>

              <button
                type="button"
                onClick={() => void openDetail(selected.id)}
                disabled={detailLoading}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                <RotateCcw className="size-3.5" aria-hidden="true" />
                Refresh ticket
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
