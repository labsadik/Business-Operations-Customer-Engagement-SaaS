"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, Copy, Globe2, LogOut, Plus, RefreshCw, Settings2, ShieldCheck, Trash2, UsersRound, Video, XCircle } from "lucide-react";

type CompanyData = {
  company: { id: string; name: string; slug: string; description?: string; publicBookingEnabled: boolean };
  workspace: { id: string; name: string; timezone: string; planId: string } | null;
  subscription: { planId: string; status: string; monthlyMeetingsUsed: number; periodEnd: string } | null;
  memberCount: number;
  connectedMemberCount: number;
  canPublish: boolean;
  currentRole: string;
};

type Employee = { id: string; name: string; email: string; role: string; googleConnected: boolean };
type RequestItem = {
  id: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  status: string;
  assignedEmployeeId: string | null;
  expiresAt: string;
  customer: { name: string; email: string } | null;
  meeting: { status: string; meetingUri: string | null } | null;
};

type MeetingHistoryItem = {
  startAt: string;
  endAt: string;
  endedAt: string;
  durationMinutes: number;
  status: string;
  calendarSyncStatus: string;
  employee: { name: string; email: string; image: string | null } | null;
  customer: { name: string; email: string; image: string | null } | null;
  scheduledBy: { name: string; email: string; image: string | null } | null;
};

const INITIAL_NOW = Date.now();

async function api<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "REQUEST_FAILED");
  return body.data as T;
}

export default function WorkspaceDashboard() {
  const [data, setData] = useState<CompanyData | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [meetingHistory, setMeetingHistory] = useState<MeetingHistoryItem[]>([]);
  const [meetingView, setMeetingView] = useState<"new" | "old">("new");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  const [invite, setInvite] = useState("");
  const [deletingEmployeeId, setDeletingEmployeeId] = useState("");
  const [actingRequestId, setActingRequestId] = useState("");
  const [endingRequestId, setEndingRequestId] = useState("");
  const [now, setNow] = useState(INITIAL_NOW);

  async function refresh() {
    try {
      const company = await api<CompanyData | null>("/api/company");
      setData(company);
      if (company) {
        const [staff, pending, history] = await Promise.all([
          api<Employee[]>("/api/company/employees"),
          api<RequestItem[]>("/api/employee/requests"),
          api<MeetingHistoryItem[]>("/api/employee/meetings")
        ]);
        setEmployees(staff);
        setRequests(pending);
        setMeetingHistory(history);
      }
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "REQUEST_FAILED");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const initial = window.setTimeout(() => { void refresh(); }, 0);
    const id = window.setInterval(() => void refresh(), 3000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  async function createCompany(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await api("/api/company", { method: "POST", body: JSON.stringify({ name, slug }) });
      setName("");
      setSlug("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "COMPANY_CREATE_FAILED");
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!data) return;
    if (!data.company.publicBookingEnabled && !data.canPublish) {
      setError("CONNECT_GOOGLE_FOR_AT_LEAST_ONE_ACTIVE_MEMBER");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api("/api/company", { method: "PATCH", body: JSON.stringify({ publicBookingEnabled: !data.company.publicBookingEnabled }) });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "PUBLISH_FAILED");
    } finally {
      setBusy(false);
    }
  }

  async function inviteEmployee(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      const result = await api<{ inviteUrl: string }>("/api/company/employees", { method: "POST", body: JSON.stringify({ email }) });
      setInvite(result.inviteUrl);
      setEmail("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "INVITE_FAILED");
    }
  }

  async function removeEmployee(employee: Employee) {
    if (!window.confirm(`Remove ${employee.name} from this company?`)) return;
    setDeletingEmployeeId(employee.id);
    setError("");
    try {
      await api(`/api/company/employees/${employee.id}`, { method: "DELETE" });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "EMPLOYEE_REMOVE_FAILED");
    } finally {
      setDeletingEmployeeId("");
    }
  }

  async function endMeeting(id: string) {
    if (!window.confirm("End this meeting now? The Conventus meeting flow will close and this booking cannot be joined or reused again.")) return;
    setEndingRequestId(id);
    setError("");
    try {
      await api(`/api/bookings/${id}/end`, { method: "POST" });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "MEETING_END_FAILED");
      await refresh();
    } finally {
      setEndingRequestId("");
    }
  }

  async function act(id: string, action: "accept" | "decline") {
    setActingRequestId(id);
    setError("");
    try {
      await api(`/api/bookings/${id}/${action}`, { method: "POST" });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "BOOKING_ACTION_FAILED");
      await refresh();
    } finally {
      setActingRequestId("");
    }
  }

  if (loading) return <main className="min-h-screen bg-[#f7f8fb]"><div className="mx-auto max-w-7xl px-5 py-10 sm:px-6 lg:px-8"><div className="h-48 animate-pulse rounded-[2rem] border border-slate-200 bg-white" /></div></main>;

  if (!data) {

  return <main className="min-h-screen bg-[#f7f8fb]"><header className="border-b border-slate-200 bg-white"><div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5"><Link href="/" className="font-semibold tracking-tight text-slate-950">Conventus</Link><form action="/api/auth/logout" method="post"><button className="text-sm font-medium text-slate-500">Sign out</button></form></div></header><div className="mx-auto max-w-2xl px-5 py-14 sm:px-6"><section className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm sm:p-10"><p className="text-sm font-semibold text-blue-600">Create workspace</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Start your Conventus company.</h1><p className="mt-3 text-sm leading-6 text-slate-600">Your account is ready. Give your company a name and a public URL slug, then connect Google for Calendar and Meet.</p><form onSubmit={createCompany} className="mt-8 grid gap-4"><label className="grid gap-2 text-sm font-semibold text-slate-800">Company name<input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Corporation" className="focus-ring rounded-xl border border-slate-300 px-4 py-3 font-normal outline-none focus:border-blue-500" /></label><label className="grid gap-2 text-sm font-semibold text-slate-800">Public slug<input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="acme" className="focus-ring rounded-xl border border-slate-300 px-4 py-3 font-normal outline-none focus:border-blue-500" /></label>{error && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">{error.replaceAll("_", " ")}</p>}<button disabled={busy} className="mt-2 rounded-xl bg-slate-950 px-5 py-3.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Creating..." : "Create workspace"}</button></form></section></div></main>;
  }

  const canManageEmployees = data.currentRole === "COMPANY_OWNER" || data.currentRole === "COMPANY_ADMIN";
  const planMax = data.subscription?.planId === "business" ? 350 : 100;
  const usage = Math.min(100, Math.round(((data.subscription?.monthlyMeetingsUsed ?? 0) / planMax) * 100));

  return <main className="min-h-screen bg-[#f7f8fb]">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-6 lg:px-8"><Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-slate-950"><span className="grid size-8 place-items-center rounded-xl bg-slate-950 text-white"><Video className="size-4" /></span>Conventus</Link><div className="flex items-center gap-2"><Link href={`/${data.company.slug}`} className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 sm:inline-flex"><Globe2 className="mr-2 size-4" /> Public page</Link><button type="button" onClick={() => window.open("/api/auth/google/start?intent=connect&returnTo=/dashboard", "_self")} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><ShieldCheck className="size-4 text-blue-600" /> Connect Google</button><form action="/api/auth/logout" method="post"><button aria-label="Sign out" className="grid size-10 place-items-center rounded-xl border border-slate-200 text-slate-600"><LogOut className="size-4" /></button></form></div></div></header>

    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-6 lg:px-8">
      {error && <div role="alert" className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        {error === "CONNECT_GOOGLE_FOR_AT_LEAST_ONE_ACTIVE_MEMBER"
          ? "Connect Google for at least one active company member before publishing the public page."
          : error === "INVITATION_ALREADY_PENDING"
            ? "An active invitation already exists for this email."
            : error === "EMPLOYEE_HAS_ACTIVE_MEETING_CREATION"
              ? "This employee is currently creating a meeting. Remove them after that operation finishes."
              : error === "MEETING_ALREADY_ENDED"
                ? "This meeting has already ended and cannot be joined or reused."
                : error === "MEETING_NOT_READY"
                  ? "This meeting is not ready to be ended."
                  : error.replaceAll("_", " ")}
      </div>}
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="text-sm font-semibold text-blue-600">Company workspace</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{data.company.name}</h1><p className="mt-2 text-sm text-slate-500">/{data.company.slug} · {data.workspace?.timezone}</p></div><button onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"><RefreshCw className="size-4" /> Refresh</button></div>

      <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Plan", data.subscription?.planId === "business" ? "Business" : "Starter", Settings2],
          ["Members", String(data.memberCount), UsersRound],
          ["Monthly meetings", `${data.subscription?.monthlyMeetingsUsed ?? 0} / ${planMax}`, CalendarDays],
          ["Public page", data.company.publicBookingEnabled ? "Published" : "Draft", Globe2]
        ].map(([title, value, Icon]) => { const I = Icon as typeof Globe2; return <article key={title as string} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><I className="size-5" /></div><p className="mt-4 text-xs font-medium text-slate-500">{title as string}</p><p className="mt-1 text-xl font-semibold text-slate-950">{value as string}</p></article>; })}
      </div>

      <div className="mt-7 grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <CalendarDays className="size-4 text-blue-600" />
                  <h2 className="text-base font-semibold text-slate-950">Meetings</h2>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  New meetings are active bookings. Old meetings are closed records only.
                </p>
              </div>
              <div className="inline-flex w-full rounded-xl border border-slate-200 bg-slate-50 p-1 sm:w-auto">
                <button
                  type="button"
                  onClick={() => setMeetingView("new")}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition sm:flex-none ${meetingView === "new" ? "bg-white text-slate-950 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-800"}`}
                >
                  New meetings
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] text-blue-700">{requests.length}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMeetingView("old")}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition sm:flex-none ${meetingView === "old" ? "bg-white text-slate-950 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-800"}`}
                >
                  Old meetings
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] text-slate-600">{meetingHistory.length}</span>
                </button>
              </div>
            </div>
          </div>

          {meetingView === "new" ? (
            <div className="divide-y divide-slate-100">
              {requests.length === 0 ? (
                <div className="px-6 py-14 text-center">
                  <Video className="mx-auto size-7 text-slate-300" />
                  <p className="mt-3 text-sm font-semibold text-slate-900">No new meetings</p>
                  <p className="mt-1 text-xs text-slate-500">New customer requests and confirmed meetings will appear here.</p>
                </div>
              ) : requests.map((item) => {
                const remaining = Math.max(0, Math.ceil((new Date(item.expiresAt).getTime() - now) / 1000));
                const actionable = item.status === "REQUESTED" || item.status === "RETRYING";
                const creating = item.status === "ASSIGNED" || item.status === "CREATING_MEETING";
                const ready = item.meeting?.status === "READY" && Boolean(item.meeting.meetingUri);
                const scheduled = item.status === "CONFIRMED" || item.status === "IN_PROGRESS";
                const urgent = remaining <= 60;
                const pendingTimer = !ready && !scheduled;
                return (
                  <div key={item.id} className="px-6 py-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-slate-950">{item.customer?.name ?? "Customer"}</p>
                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${ready ? "bg-emerald-50 text-emerald-700" : creating ? "bg-blue-50 text-blue-700" : item.status === "RETRYING" ? "bg-amber-50 text-amber-700" : scheduled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                            {ready ? "Meeting ready" : creating ? "Creating meeting" : item.status === "RETRYING" ? "Retrying" : scheduled ? "Confirmed" : "Waiting for acceptance"}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">{new Date(item.startAt).toLocaleString()} · {item.durationMinutes} min</p>
                        {pendingTimer && (
                          <>
                            <div className="mt-3 flex items-center gap-3">
                              <span className={`rounded-xl border px-3 py-1.5 font-mono text-sm font-bold ${urgent ? "border-rose-200 bg-rose-50 text-rose-700" : "border-slate-200 bg-slate-50 text-slate-950"}`}>
                                {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
                              </span>
                              <span className="text-[11px] font-medium text-slate-500">{creating ? "Meeting setup in progress" : "Acceptance timer"}</span>
                            </div>
                            <div className="mt-2 h-1.5 max-w-sm overflow-hidden rounded-full bg-slate-100">
                              <div className={`h-full transition-all duration-1000 ${urgent ? "bg-rose-500" : "bg-blue-600"}`} style={{ width: `${Math.min(100, Math.max(0, (remaining / 300) * 100))}%` }} />
                            </div>
                          </>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {ready && item.meeting?.meetingUri && (
                          <>
                            <a
                              href={item.meeting.meetingUri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700"
                            >
                              <Video className="size-4" /> Join Google Meet
                            </a>
                            <button
                              type="button"
                              disabled={endingRequestId === item.id}
                              onClick={() => void endMeeting(item.id)}
                              className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <XCircle className="size-4" />
                              {endingRequestId === item.id ? "Ending..." : "End meeting"}
                            </button>
                          </>
                        )}
                        {actionable && (
                          <>
                            <button disabled={actingRequestId === item.id} onClick={() => void act(item.id, "decline")} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs font-semibold text-slate-700 disabled:opacity-50"><XCircle className="size-4" /> Decline</button>
                            <button disabled={actingRequestId === item.id} onClick={() => void act(item.id, "accept")} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3.5 py-2.5 text-xs font-semibold text-white disabled:opacity-50"><CheckCircle2 className="size-4" /> {actingRequestId === item.id ? "Accepting..." : "Accept"}</button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {meetingHistory.length === 0 ? (
                <div className="px-6 py-14 text-center">
                  <CalendarDays className="mx-auto size-7 text-slate-300" />
                  <p className="mt-3 text-sm font-semibold text-slate-900">No old meetings</p>
                  <p className="mt-1 text-xs text-slate-500">Ended meeting records will appear here after the meeting is closed.</p>
                </div>
              ) : (
                meetingHistory.map((meeting, index) => {
                  const timeZone = data.workspace?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
                  const start = new Date(meeting.startAt);
                  const scheduledEnd = new Date(meeting.endAt);
                  const ended = new Date(meeting.endedAt || meeting.endAt);
                  const dateLabel = start.toLocaleDateString(undefined, {
                    timeZone,
                    weekday: "short",
                    year: "numeric",
                    month: "short",
                    day: "numeric"
                  });
                  const startLabel = start.toLocaleTimeString(undefined, {
                    timeZone,
                    hour: "numeric",
                    minute: "2-digit"
                  });
                  const scheduledEndLabel = scheduledEnd.toLocaleTimeString(undefined, {
                    timeZone,
                    hour: "numeric",
                    minute: "2-digit"
                  });
                  const endedLabel = ended.toLocaleTimeString(undefined, {
                    timeZone,
                    hour: "numeric",
                    minute: "2-digit"
                  });
                  const statusLabel = meeting.status === "CANCELLED" ? "Cancelled" : meeting.status === "COMPLETED" ? "Completed" : "Ended";
                  const scheduledBy = meeting.scheduledBy ?? meeting.customer;
                  return (
                    <div key={`${meeting.startAt}-${meeting.customer?.email ?? index}`} className="px-6 py-5">
                      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-slate-950">{scheduledBy?.name ?? "Customer"}</p>
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">{statusLabel}</span>
                          </div>
                          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Scheduled by</p>
                          <p className="mt-1 truncate text-xs text-slate-500">{scheduledBy?.email ?? "Customer email unavailable"}</p>
                          {meeting.employee && (
                            <p className="mt-2 text-xs text-slate-500">
                              Employee: <span className="font-medium text-slate-700">{meeting.employee.name}</span>
                            </p>
                          )}
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <p className="text-xs font-semibold text-slate-950">{dateLabel}</p>
                          <p className="mt-1 text-xs text-slate-700">
                            Scheduled {startLabel} – {scheduledEndLabel} · {meeting.durationMinutes} min
                          </p>
                          {ended.getTime() !== scheduledEnd.getTime() && (
                            <p className="mt-1 text-[11px] font-medium text-slate-600">Ended at {endedLabel}</p>
                          )}
                          <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400">{timeZone}</p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </section>

        <div className="space-y-5">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-950">Company access links</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">Publish the customer page and share the company-scoped employee login separately.</p>
              </div>
              <Globe2 className="size-5 text-blue-600" />
            </div>
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-3">
                <span className={`size-2 rounded-full ${data.company.publicBookingEnabled ? "bg-emerald-500" : "bg-slate-300"}`} />
                <div>
                  <p className="text-xs font-semibold text-slate-700">{data.company.publicBookingEnabled ? "Public page published" : "Public page draft"}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{data.connectedMemberCount} active member{data.connectedMemberCount === 1 ? "" : "s"} ready for Google Calendar + Meet.</p>
                </div>
                {canManageEmployees && <button onClick={() => void publish()} disabled={busy || (!data.company.publicBookingEnabled && !data.canPublish)} className="ml-auto rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{data.company.publicBookingEnabled ? "Unpublish" : "Publish"}</button>}
              </div>
              {canManageEmployees && !data.company.publicBookingEnabled && !data.canPublish && <p className="mt-3 text-[11px] leading-5 text-amber-700">Connect Google for at least one active member before publishing.</p>}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Link href={`/${data.company.slug}`} className="block break-all rounded-2xl border border-slate-200 bg-white p-3 font-mono text-xs text-slate-700 hover:border-slate-300"><span className="mb-1 block font-sans text-[11px] font-semibold text-slate-500">Customer booking</span>/{data.company.slug}</Link>
              <Link href={`/${data.company.slug}/login`} className="block break-all rounded-2xl border border-slate-200 bg-white p-3 font-mono text-xs text-slate-700 hover:border-slate-300"><span className="mb-1 block font-sans text-[11px] font-semibold text-slate-500">Employee login</span>/{data.company.slug}/login</Link>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-950">Employees</h2>
                <p className="mt-1 text-xs text-slate-500">{employees.length} active member{employees.length === 1 ? "" : "s"} · Google Calendar scheduling</p>
              </div>
              <UsersRound className="size-5 text-blue-600" />
            </div>
            <div className="mt-5 space-y-3">
              {employees.map((employee) => (
                <div key={employee.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{employee.name}</p>
                    <p className="truncate text-xs text-slate-500">{employee.email}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">{employee.googleConnected ? "Calendar connected" : "Connect Google"}</span>
                    {canManageEmployees && employee.role === "EMPLOYEE" && <button type="button" onClick={() => void removeEmployee(employee)} disabled={deletingEmployeeId === employee.id} className="grid size-8 place-items-center rounded-lg border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 disabled:opacity-50" aria-label={"Remove " + employee.name} title={"Remove " + employee.name}><Trash2 className="size-3.5" /></button>}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {canManageEmployees && (<section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-base font-semibold text-slate-950">Invite employee</h2><p className="mt-1 text-xs leading-5 text-slate-500">Generate a secure invite link for the employee.</p><form onSubmit={inviteEmployee} className="mt-4 flex gap-2"><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="employee@company.com" className="focus-ring min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500" /><button className="grid size-11 place-items-center rounded-xl bg-slate-950 text-white"><Plus className="size-4" /></button></form>{invite && <div className="mt-4 rounded-2xl bg-slate-50 p-3"><p className="break-all text-xs text-slate-600">{invite}</p><button type="button" onClick={() => void navigator.clipboard.writeText(invite)} className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-blue-700"><Copy className="size-3.5" /> Copy invite link</button></div>}</section>)}

          <div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${usage}%` }} /></div>
        </div>
      </div>

    </div>
  </main>;
}