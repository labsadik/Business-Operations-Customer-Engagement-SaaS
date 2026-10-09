"use client";

import { clientApi } from "@/lib/client-api";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  LifeBuoy,
  Loader2,
  RotateCcw,
  X
} from "lucide-react";

type Status = "NOT_SEEN" | "PROCESSING" | "COMPLETED";

type TicketItem = {
  id: string;
  subject: string;
  description: string;
  status: Status;
  createdAt: string;
  updatedAt: string;
  company: {
    id: string;
    name: string;
    slug: string;
    email: string;
    phone: string;
  } | null;
  submitter: {
    name: string;
    email: string;
  };
};

type TicketDetail = TicketItem & {
  statusChangedAt: string | null;
  statusChangedByUserId: string | null;
};

type CompanyOption = {
  id: string;
  name: string;
};

function ticketNumber(id: string) {
  return "SUP-" + id.slice(-8).toUpperCase();
}

function statusLabel(status: Status) {
  if (status === "NOT_SEEN") return "Not seen";
  if (status === "PROCESSING") return "Processing";
  return "Completed";
}

function statusClass(status: Status) {
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

async function request<T>(url: string, init?: RequestInit) {
  return clientApi<T>(url, init);
}

export default function AdminSupportTickets() {
  const [items, setItems] = useState<TicketItem[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [selected, setSelected] = useState<TicketDetail | null>(null);
  const [status, setStatus] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const detailDialogRef = useRef<HTMLDivElement | null>(null);
  const detailCloseRef = useRef<HTMLButtonElement | null>(null);

  const loadCompanies = useCallback(async () => {
    try {
      setCompanies(await request<CompanyOption[]>("/api/admin/companies/options?limit=50"));
    } catch {
      setCompanies([]);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "25"
      });
      if (status) params.set("status", status);
      if (companyId) params.set("companyId", companyId);

      const data = await request<{
        items: TicketItem[];
        page: number;
        hasNext: boolean;
      }>(`/api/admin/support-tickets?${params.toString()}`);

      setItems(data.items);
      setHasNext(data.hasNext);
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : "SUPPORT_TICKET_ADMIN_LIST_FAILED");
    } finally {
      setLoading(false);
    }
  }, [page, status, companyId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCompanies();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadCompanies]);

  useEffect(() => {
    if (!selected) return;

    const focusTimer = window.setTimeout(() => detailCloseRef.current?.focus(), 0);

    function onDetailKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setSelected(null);
        return;
      }
      if (event.key !== "Tab") return;

      const root = detailDialogRef.current;
      if (!root) return;
      const focusable = Array.from(
        root.querySelectorAll<HTMLElement>(
          'button:not([disabled]), select:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled])'
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

    window.addEventListener("keydown", onDetailKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onDetailKeyDown);
    };
  }, [selected]);

  async function openDetail(id: string) {
    setDetailLoading(true);
    setError("");
    try {
      const data = await request<TicketDetail>(
        `/api/admin/support-tickets/${encodeURIComponent(id)}`
      );
      setSelected(data);
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : "SUPPORT_TICKET_ADMIN_DETAIL_FAILED");
    } finally {
      setDetailLoading(false);
    }
  }

  async function changeStatus(ticket: TicketItem, nextStatus: Status) {
    if (savingId || nextStatus === ticket.status) return;
    setSavingId(ticket.id);
    setError("");
    setNotice("");

    try {
      const data = await request<{
        id: string;
        status: Status;
        updatedAt: string;
        statusChangedAt: string | null;
        statusChangedByUserId: string | null;
      }>(`/api/admin/support-tickets/${encodeURIComponent(ticket.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus })
      });

      setItems((current) =>
        current.map((item) =>
          item.id === ticket.id
            ? { ...item, status: data.status, updatedAt: data.updatedAt }
            : item
        )
      );
      setSelected((current) =>
        current?.id === ticket.id
          ? {
              ...current,
              status: data.status,
              updatedAt: data.updatedAt,
              statusChangedAt: data.statusChangedAt,
              statusChangedByUserId: data.statusChangedByUserId
            }
          : current
      );
      setNotice(`${ticketNumber(ticket.id)} is now ${statusLabel(data.status)}.`);
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : "SUPPORT_TICKET_STATUS_UPDATE_FAILED");
    } finally {
      setSavingId("");
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-600">
              <LifeBuoy className="size-4" aria-hidden="true" />
              Platform support inbox
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Support tickets</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              Company members can contact Conventus support here. Ticket status is explicit, persistent, and visible to the owning company.
            </p>
          </div>
          <div className="text-xs font-semibold text-slate-400">Sorted by recent activity</div>
        </div>
      </section>

      {(error || notice) && (
        <div
          role={error ? "alert" : "status"}
          aria-live="polite"
          className={"rounded-2xl border px-4 py-3 text-sm " + (
            error
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          )}
        >
          {error || notice}
        </div>
      )}

      <section className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <label className="text-xs font-semibold text-slate-700">
          Status
          <select
            value={status}
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value);
            }}
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal"
          >
            <option value="">All statuses</option>
            <option value="NOT_SEEN">Not seen</option>
            <option value="PROCESSING">Processing</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </label>

        <label className="text-xs font-semibold text-slate-700">
          Company
          <select
            value={companyId}
            onChange={(event) => {
              setPage(1);
              setCompanyId(event.target.value);
            }}
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal"
          >
            <option value="">All companies</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>{company.name}</option>
            ))}
          </select>
        </label>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : items.length ? (
          <div className="divide-y divide-slate-100">
            {items.map((item) => (
              <article key={item.id} className="p-5 sm:p-6">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <button
                    type="button"
                    onClick={() => void openDetail(item.id)}
                    className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-bold tracking-[0.08em] text-slate-400">{ticketNumber(item.id)}</span>
                      <span className={"rounded-full px-2.5 py-1 text-[10px] font-semibold " + statusClass(item.status)}>
                        {statusLabel(item.status)}
                      </span>
                    </div>
                    <h2 className="mt-2 text-sm font-semibold text-slate-950">{item.subject}</h2>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{item.description}</p>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-400">
                      <span>{item.company?.name || "Unknown company"}</span>
                      <span>{item.submitter.name} · {item.submitter.email}</span>
                      <span>Created {formatDate(item.createdAt)}</span>
                      <span>Updated {formatDate(item.updatedAt)}</span>
                    </div>
                  </button>

                  <div className="flex shrink-0 items-center gap-2 xl:pt-1">
                    <label className="sr-only" htmlFor={"status-" + item.id}>Status</label>
                    <select
                      id={"status-" + item.id}
                      value={item.status}
                      disabled={savingId === item.id}
                      onChange={(event) => void changeStatus(item, event.target.value as Status)}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
                    >
                      <option value="NOT_SEEN">Not seen</option>
                      <option value="PROCESSING">Processing</option>
                      <option value="COMPLETED">Completed</option>
                    </select>
                    {savingId === item.id && <Loader2 className="size-4 animate-spin text-slate-400" aria-label="Saving status" />}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="p-16 text-center">
            <CheckCircle2 className="mx-auto size-6 text-slate-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-semibold text-slate-800">No support tickets found</p>
            <p className="mt-1 text-xs text-slate-500">Tickets will appear here after a company member submits one.</p>
          </div>
        )}
      </section>

      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
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

      {selected && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:items-center sm:p-5"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelected(null);
          }}
        >
          <div
            ref={detailDialogRef}
            className="max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-[1.75rem] border border-slate-200 bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-support-ticket-title"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <p className="text-[10px] font-bold tracking-[0.08em] text-slate-400">{ticketNumber(selected.id)}</p>
                <h2 id="admin-support-ticket-title" className="mt-1 text-xl font-semibold tracking-tight text-slate-950">{selected.subject}</h2>
              </div>
              <button
                ref={detailCloseRef}
                type="button"
                onClick={() => setSelected(null)}
                className="grid size-9 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"
                aria-label="Close ticket details"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-5 p-5 sm:p-6">
              <section className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Company</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">{selected.company?.name || "Unknown company"}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{selected.company?.email || selected.company?.phone || "No company contact recorded"}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Submitting member</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">{selected.submitter.name}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{selected.submitter.email}</p>
                </div>
              </section>

              <section className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Status</p>
                  <p className={"mt-2 inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold " + statusClass(selected.status)}>
                    {statusLabel(selected.status)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Created</p>
                  <p className="mt-2 text-xs font-semibold text-slate-700">{formatDate(selected.createdAt)}</p>
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Last update</p>
                  <p className="mt-2 text-xs font-semibold text-slate-700">{formatDate(selected.updatedAt)}</p>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Problem description</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700">{selected.description}</p>
              </section>

              <section className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
                <p className="text-xs font-semibold text-blue-950">Explicit status control</p>
                <p className="mt-1 text-[11px] leading-5 text-blue-900">
                  Opening this ticket does not change its status. Choose a status explicitly to record a platform decision and update the owning company.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {(["NOT_SEEN", "PROCESSING", "COMPLETED"] as Status[]).map((nextStatus) => (
                    <button
                      key={nextStatus}
                      type="button"
                      disabled={savingId === selected.id || selected.status === nextStatus}
                      onClick={() => void changeStatus(selected, nextStatus)}
                      className={"rounded-xl px-3.5 py-2.5 text-xs font-semibold " + (
                        selected.status === nextStatus
                          ? statusClass(nextStatus)
                          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      ) + " disabled:cursor-not-allowed disabled:opacity-50"}
                    >
                      {savingId === selected.id && selected.status !== nextStatus && <Loader2 className="mr-1 inline size-3.5 animate-spin" aria-hidden="true" />}
                      {statusLabel(nextStatus)}
                    </button>
                  ))}
                </div>
                {selected.statusChangedAt && (
                  <p className="mt-3 text-[10px] text-slate-500">
                    Last status change: {formatDate(selected.statusChangedAt)}
                  </p>
                )}
              </section>

              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] text-slate-400">
                  Status changes are audit-logged without storing ticket text in the audit event.
                </p>
                <button
                  type="button"
                  onClick={() => void openDetail(selected.id)}
                  disabled={detailLoading}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  <RotateCcw className="size-3.5" aria-hidden="true" />
                  Refresh
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {detailLoading && (
        <div className="fixed inset-0 z-[110] grid place-items-center bg-slate-950/15" role="status" aria-live="polite">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-600 shadow-lg">
            Loading ticket…
          </div>
        </div>
      )}
    </div>
  );
}
