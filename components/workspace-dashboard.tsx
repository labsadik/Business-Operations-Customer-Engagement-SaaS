"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  ChevronRight,
  Copy,
  Globe2,
  LogOut,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Trash2,
  UsersRound,
  Video,
  XCircle,
  Megaphone
} from "lucide-react";
import ConfirmDialog from "@/components/confirm-dialog";
import UserAvatar from "@/components/user-avatar";
import RazorpayPlanButton from "@/components/razorpay-plan-button";
import { playMeetingSound, unlockMeetingSound } from "@/lib/client-meeting-sound";

type CompanyData = {
  company: {
    id: string;
    name: string;
    slug: string;
    description?: string;
    publicBookingEnabled: boolean;
  };
  workspace: {
    id: string;
    name: string;
    timezone: string;
    planId: string;
  } | null;
  subscription: {
    planId: string;
    status: string;
    monthlyMeetingsUsed: number;
    periodEnd: string;
  } | null;
  memberCount: number;
  connectedMemberCount: number;
  canPublish: boolean;
  currentRole: string;
};

type Employee = {
  id: string;
  name: string;
  email: string;
  role: string;
  googleConnected: boolean;
};

type RequestItem = {
  id: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  status: string;
  assignedEmployeeId: string | null;
  expiresAt: string;
  customer: { name: string; email: string; image?: string | null } | null;
  meeting: { status: string; meetingUri: string | null } | null;
};

type MeetingHistoryItem = {
  startAt: string;
  endAt: string;
  endedAt: string;
  durationMinutes: number;
  status: string;
  employee: { name: string; email: string; image: string | null } | null;
  customer: { name: string; email: string; image: string | null } | null;
  scheduledBy: { name: string; email: string; image: string | null } | null;
};

type DashboardUser = { name: string; email: string; image?: string };

type AnnouncementItem = {
  id: string;
  title: string;
  message: string;
  active: boolean;
  createdAt: string;
};

type Confirmation =
  | { kind: "remove-employee"; id: string; name: string }
  | { kind: "end-meeting"; id: string }
  | null;

const INITIAL_NOW = Date.now();

async function api<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "REQUEST_FAILED");
  return body.data as T;
}

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] ?? "")
      .join("")
      .toUpperCase() || "?"
  );
}

function DashboardSkeleton() {
  return (
    <main className="min-h-screen bg-[#f7f8fb]">
      <div className="mx-auto max-w-7xl px-5 py-6 sm:px-6 lg:px-8">
        <div className="h-16 animate-pulse rounded-2xl border border-slate-200 bg-white" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-32 animate-pulse rounded-3xl border border-slate-200 bg-white" />
          ))}
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_360px]">
          <div className="h-[520px] animate-pulse rounded-3xl border border-slate-200 bg-white" />
          <div className="space-y-6">
            <div className="h-56 animate-pulse rounded-3xl border border-slate-200 bg-white" />
            <div className="h-60 animate-pulse rounded-3xl border border-slate-200 bg-white" />
          </div>
        </div>
        <div className="mt-6 h-72 animate-pulse rounded-3xl border border-slate-200 bg-white" />
      </div>
    </main>
  );
}

export default function WorkspaceDashboard({ user }: { user: DashboardUser }) {
  const [data, setData] = useState<CompanyData | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [meetingHistory, setMeetingHistory] = useState<MeetingHistoryItem[]>([]);
  const [meetingView, setMeetingView] = useState<"new" | "old">("new");
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementMessage, setAnnouncementMessage] = useState("");
  const [announcementComposerOpen, setAnnouncementComposerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  const [invite, setInvite] = useState("");
  const [actingRequestId, setActingRequestId] = useState("");
  const [endingRequestId, setEndingRequestId] = useState("");
  const [deletingEmployeeId, setDeletingEmployeeId] = useState("");
  const [now, setNow] = useState(INITIAL_NOW);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const seenRequestIdsRef = useRef(new Set<string>());
  const initializedRequestsRef = useRef(false);

  async function refresh() {
    try {
      const company = await api<CompanyData | null>("/api/company");
      setData(company);
      if (company) {
        const [staff, pending, history, announcementList] = await Promise.all([
          api<Employee[]>("/api/company/employees"),
          api<RequestItem[]>("/api/employee/requests"),
          api<MeetingHistoryItem[]>("/api/employee/meetings"),
          ["COMPANY_OWNER", "COMPANY_ADMIN"].includes(company.currentRole)
            ? api<AnnouncementItem[]>("/api/company/announcement")
            : Promise.resolve([] as AnnouncementItem[])
        ]);
        setEmployees(staff);
        setRequests(pending);
        setMeetingHistory(history);
        setAnnouncements(announcementList);
      }
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "REQUEST_FAILED");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const initial = window.setTimeout(() => {
      void refresh();
    }, 0);
    const timer = window.setInterval(() => {
      void refresh();
    }, 3000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const ids = requests.map((item) => item.id);
    if (
      initializedRequestsRef.current &&
      ids.some((id) => !seenRequestIdsRef.current.has(id))
    ) {
      void playMeetingSound("incoming");
    }
    for (const id of ids) seenRequestIdsRef.current.add(id);
    initializedRequestsRef.current = true;
  }, [requests]);

  useEffect(() => {
    const unlock = () => {
      void unlockMeetingSound();
      setSoundEnabled(true);
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function createCompany(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/company", {
        method: "POST",
        body: JSON.stringify({ name, slug })
      });
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
      setError("PUBLISH_REQUIRES_READY_MEMBER");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api("/api/company", {
        method: "PATCH",
        body: JSON.stringify({
          publicBookingEnabled: !data.company.publicBookingEnabled
        })
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "PUBLISH_FAILED");
    } finally {
      setBusy(false);
    }
  }

  async function createAnnouncement(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!announcementMessage.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api<AnnouncementItem>("/api/company/announcement", {
        method: "POST",
        body: JSON.stringify({
          title: announcementTitle.trim() || "Announcement",
          message: announcementMessage.trim()
        })
      });
      setAnnouncementTitle("");
      setAnnouncementMessage("");
      setAnnouncementComposerOpen(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ANNOUNCEMENT_CREATE_FAILED");
    } finally {
      setBusy(false);
    }
  }

  async function toggleAnnouncement(item: AnnouncementItem) {
    setBusy(true);
    setError("");
    try {
      await api("/api/company/announcement", {
        method: "PATCH",
        body: JSON.stringify({ id: item.id, active: !item.active })
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ANNOUNCEMENT_UPDATE_FAILED");
    } finally {
      setBusy(false);
    }
  }

  async function inviteEmployee(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      const result = await api<{ inviteUrl: string }>(
        "/api/company/employees",
        {
          method: "POST",
          body: JSON.stringify({ email })
        }
      );
      setInvite(result.inviteUrl);
      setEmail("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "INVITE_FAILED");
    }
  }

  async function removeEmployee(id: string) {
    setDeletingEmployeeId(id);
    setError("");
    try {
      await api(`/api/company/employees/${id}`, { method: "DELETE" });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "EMPLOYEE_REMOVE_FAILED");
    } finally {
      setDeletingEmployeeId("");
    }
  }

  async function endMeeting(id: string) {
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

  async function confirmDialogAction() {
    if (!confirmation) return;
    const action = confirmation;
    setConfirmation(null);
    if (action.kind === "remove-employee") {
      await removeEmployee(action.id);
    } else {
      await endMeeting(action.id);
    }
  }

  if (loading) return <DashboardSkeleton />;

  if (!data) {
    return (
      <main className="min-h-screen bg-[#f7f8fb]">
        <div className="mx-auto flex min-h-screen max-w-2xl items-center px-5 py-10">
          <section className="w-full rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-2xl bg-slate-950 text-white">
                <Video className="size-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
                  Workspace setup
                </p>
                <p className="mt-1 text-sm text-slate-500">Step 1 of 1</p>
              </div>
            </div>
            <h1 className="mt-7 text-3xl font-semibold tracking-tight text-slate-950">
              Create your company workspace.
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Set up the company identity first. Team access, booking and publishing controls become available as soon as the workspace is created.
            </p>
            <form onSubmit={createCompany} className="mt-8 grid gap-4">
              <label className="grid gap-2 text-sm font-semibold text-slate-800">
                Company name
                <input
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Acme Corporation"
                  className="focus-ring rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-blue-500"
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-slate-800">
                Public address
                <input
                  value={slug}
                  onChange={(event) => setSlug(event.target.value)}
                  placeholder="acme"
                  className="focus-ring rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-blue-500"
                />
              </label>
              {error && (
                <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                  {error.replaceAll("_", " ")}
                </div>
              )}
              <button
                disabled={busy}
                className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {busy ? "Creating..." : "Create workspace"}
                <ChevronRight className="size-4" />
              </button>
            </form>
          </section>
        </div>
      </main>
    );
  }

  const canManageEmployees =
    data.currentRole === "COMPANY_OWNER" ||
    data.currentRole === "COMPANY_ADMIN";
  const planMax = data.subscription?.planId === "business" ? 350 : 100;
  const usagePercent = Math.min(
    100,
    Math.round(
      ((data.subscription?.monthlyMeetingsUsed ?? 0) / planMax) * 100
    )
  );
  const readyCount = requests.filter(
    (item) => item.meeting?.status === "READY" && item.meeting.meetingUri
  ).length;

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-5 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-slate-950 text-white shadow-sm">
              <Video className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold tracking-tight">Conventus</p>
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">
                Workspace
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href={`/${data.company.slug}`}
              className="hidden items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 sm:inline-flex"
            >
              <Globe2 className="size-4" />
              Public page
            </Link>
            <button
              type="button"
              onClick={() =>
                window.open(
                  "/api/auth/google/start?intent=connect&returnTo=/dashboard",
                  "_self"
                )
              }
              className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 md:inline-flex"
            >
              <ShieldCheck className="size-4 text-blue-600" />
              Connection
            </button>
            <UserAvatar name={user.name} email={user.email} size={38} />
            <form action="/api/auth/logout" method="post">
              <button
                aria-label="Sign out"
                className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
              >
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-7 sm:px-6 lg:px-8 lg:py-9">
        {error && (
          <div role="alert" className="mb-6 flex items-start justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span>
              {error === "PUBLISH_REQUIRES_READY_MEMBER"
                ? "At least one active team member must finish setup before the public page can be published."
                : error === "MEETING_ALREADY_ENDED"
                  ? "This meeting has already ended and cannot be reused."
                  : error === "MEETING_NOT_READY"
                    ? "This meeting is not ready to be ended."
                    : error.replaceAll("_", " ")}
            </span>
            <button
              type="button"
              onClick={() => setError("")}
              className="shrink-0 text-amber-700 hover:text-amber-950"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}

        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-700">
                  {data.currentRole.replaceAll("_", " ")}
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  Operational
                </span>
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-4xl">
                {data.company.name}
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                {data.company.description || "A central workspace for customer requests, team coordination and meeting delivery."}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void unlockMeetingSound();
                  setSoundEnabled(true);
                }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                {soundEnabled ? "Notifications on" : "Enable notifications"}
              </button>
              <button
                type="button"
                onClick={() => void refresh()}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <RefreshCw className="size-3.5" />
                Refresh
              </button>
              {canManageEmployees && (
                <button
                  type="button"
                  onClick={() => void publish()}
                  disabled={busy || (!data.company.publicBookingEnabled && !data.canPublish)}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {data.company.publicBookingEnabled ? "Published" : "Publish page"}
                  <ArrowUpRight className="size-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Plan", data.subscription?.planId === "business" ? "Business" : "Starter", Settings2],
              ["Team", String(data.memberCount), UsersRound],
              ["Monthly volume", `${data.subscription?.monthlyMeetingsUsed ?? 0} / ${planMax}`, Activity],
              ["Ready now", String(readyCount), Video]
            ].map(([title, value, Icon]) => {
              const StatIcon = Icon as typeof Activity;
              return (
                <article key={title as string} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                      {title as string}
                    </span>
                    <StatIcon className="size-4 text-slate-400" />
                  </div>
                  <p className="mt-3 text-xl font-semibold tracking-tight text-slate-950">
                    {value as string}
                  </p>
                </article>
              );
            })}
          </div>
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_360px]">
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <CalendarDays className="size-4 text-blue-600" />
                    <h2 className="text-base font-semibold">Meetings</h2>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Active work stays here. Closed records live in history.
                  </p>
                </div>
                <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                  <button
                    type="button"
                    onClick={() => setMeetingView("new")}
                    className={`rounded-lg px-3.5 py-2 text-xs font-semibold ${meetingView === "new" ? "bg-white text-slate-950 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-800"}`}
                  >
                    New <span className="ml-1 text-slate-400">{requests.length}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMeetingView("old")}
                    className={`rounded-lg px-3.5 py-2 text-xs font-semibold ${meetingView === "old" ? "bg-white text-slate-950 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-800"}`}
                  >
                    Old <span className="ml-1 text-slate-400">{meetingHistory.length}</span>
                  </button>
                </div>
              </div>
            </div>

            {meetingView === "new" ? (
              requests.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <div className="mx-auto grid size-11 place-items-center rounded-2xl bg-slate-100 text-slate-400">
                    <Video className="size-5" />
                  </div>
                  <p className="mt-4 text-sm font-semibold">No active meetings</p>
                  <p className="mt-1 text-xs text-slate-500">New requests and confirmed meetings will appear here.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {requests.map((item) => {
                    const remaining = Math.max(
                      0,
                      Math.ceil(
                        (new Date(item.expiresAt).getTime() - now) / 1000
                      )
                    );
                    const actionable =
                      item.status === "REQUESTED" ||
                      item.status === "RETRYING";
                    const creating =
                      item.status === "ASSIGNED" ||
                      item.status === "CREATING_MEETING";
                    const ready =
                      item.meeting?.status === "READY" &&
                      Boolean(item.meeting.meetingUri);
                    const scheduled =
                      item.status === "CONFIRMED" ||
                      item.status === "IN_PROGRESS";
                    const urgent = remaining <= 60;
                    return (
                      <div key={item.id} className="px-6 py-5">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                          <div className="flex min-w-0 items-start gap-3">
                            {item.customer ? (
                              <UserAvatar
                                name={item.customer.name}
                                email={item.customer.email}
                                image={item.customer.image}
                                size={40}
                              />
                            ) : (
                              <div className="grid size-10 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
                                ?
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate text-sm font-semibold">{item.customer?.name ?? "Customer"}</p>
                                <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${ready ? "bg-emerald-50 text-emerald-700" : creating ? "bg-blue-50 text-blue-700" : item.status === "RETRYING" ? "bg-amber-50 text-amber-700" : scheduled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                                  {ready ? "Ready" : creating ? "Preparing" : item.status === "RETRYING" ? "Retrying" : scheduled ? "Confirmed" : "Awaiting response"}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-slate-500">{new Date(item.startAt).toLocaleString()} · {item.durationMinutes} min</p>
                              {item.customer?.email && <p className="mt-1 truncate text-[11px] text-slate-400">{item.customer.email}</p>}
                              {!ready && !scheduled && (
                                <div className="mt-3 flex max-w-sm items-center gap-3">
                                  <span className={`rounded-lg border px-2.5 py-1.5 font-mono text-xs font-bold ${urgent ? "border-rose-200 bg-rose-50 text-rose-700" : "border-slate-200 bg-slate-50 text-slate-800"}`}>
                                    {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-[11px] font-medium text-slate-500">{creating ? "Preparing the meeting" : item.status === "RETRYING" ? "Finding the next available team member" : "Response window"}</p>
                                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                                      <div
                                        className={`h-full ${urgent ? "bg-rose-500" : "bg-blue-600"}`}
                                        style={{ width: `${Math.min(100, Math.max(0, (remaining / 300) * 100))}%` }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2 xl:justify-end">
                            {ready && item.meeting?.meetingUri && (
                              <>
                                <a
                                  href={item.meeting.meetingUri}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700"
                                >
                                  <Video className="size-4" />
                                  Join meeting
                                </a>
                                <button
                                  type="button"
                                  disabled={endingRequestId === item.id}
                                  onClick={() =>
                                    setConfirmation({
                                      kind: "end-meeting",
                                      id: item.id
                                    })
                                  }
                                  className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                                >
                                  <XCircle className="size-4" />
                                  {endingRequestId === item.id ? "Ending..." : "End"}
                                </button>
                              </>
                            )}
                            {actionable && (
                              <>
                                <button
                                  type="button"
                                  disabled={actingRequestId === item.id}
                                  onClick={() => void act(item.id, "decline")}
                                  className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                >
                                  Decline
                                </button>
                                <button
                                  type="button"
                                  disabled={actingRequestId === item.id}
                                  onClick={() => void act(item.id, "accept")}
                                  className="rounded-xl bg-blue-600 px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                                >
                                  {actingRequestId === item.id ? "Accepting..." : "Accept"}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : meetingHistory.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <div className="mx-auto grid size-11 place-items-center rounded-2xl bg-slate-100 text-slate-400">
                  <CalendarDays className="size-5" />
                </div>
                <p className="mt-4 text-sm font-semibold">No closed meetings</p>
                <p className="mt-1 text-xs text-slate-500">Completed meeting records will appear here.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {meetingHistory.map((meeting, index) => {
                  const timeZone =
                    data.workspace?.timezone ||
                    Intl.DateTimeFormat().resolvedOptions().timeZone;
                  const start = new Date(meeting.startAt);
                  const scheduledEnd = new Date(meeting.endAt);
                  const ended = new Date(
                    meeting.endedAt || meeting.endAt
                  );
                  const dateLabel = new Intl.DateTimeFormat(undefined, {
                    timeZone,
                    weekday: "short",
                    year: "numeric",
                    month: "short",
                    day: "numeric"
                  }).format(start);
                  const startLabel = new Intl.DateTimeFormat(undefined, {
                    timeZone,
                    hour: "numeric",
                    minute: "2-digit"
                  }).format(start);
                  const scheduledEndLabel = new Intl.DateTimeFormat(undefined, {
                    timeZone,
                    hour: "numeric",
                    minute: "2-digit"
                  }).format(scheduledEnd);
                  const endedLabel = new Intl.DateTimeFormat(undefined, {
                    timeZone,
                    hour: "numeric",
                    minute: "2-digit"
                  }).format(ended);
                  const scheduledBy = meeting.scheduledBy ?? meeting.customer;

                  return (
                    <div key={`${meeting.startAt}-${meeting.customer?.email ?? index}`} className="px-6 py-5">
                      <div className="grid gap-5 xl:grid-cols-[1fr_1.1fr_auto] xl:items-center">
                        <div className="flex min-w-0 items-center gap-3">
                          <UserAvatar
                            name={scheduledBy?.name ?? "Customer"}
                            email={scheduledBy?.email}
                            size={40}
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-semibold">{scheduledBy?.name ?? "Customer"}</p>
                              <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
                                {meeting.status === "CANCELLED" ? "Cancelled" : "Completed"}
                              </span>
                            </div>
                            <p className="mt-1 text-[11px] text-slate-400">Scheduled by</p>
                            <p className="truncate text-xs text-slate-500">{scheduledBy?.email ?? "Email unavailable"}</p>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <p className="text-xs font-semibold text-slate-900">{dateLabel}</p>
                          <p className="mt-1 text-xs text-slate-700">
                            {startLabel} – {scheduledEndLabel} · {meeting.durationMinutes} min
                          </p>
                          {ended.getTime() !== scheduledEnd.getTime() && (
                            <p className="mt-1 text-[11px] font-medium text-slate-600">Ended at {endedLabel}</p>
                          )}
                          <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400">{timeZone}</p>
                        </div>

                        <div className="flex items-center gap-2 xl:justify-end">
                          <div className="text-right">
                            <p className="text-xs font-semibold text-slate-700">{meeting.employee?.name ?? "Team member"}</p>
                            <p className="mt-1 text-[10px] text-slate-400">Handled by</p>
                          </div>
                          <CheckCircle2 className="size-4 text-emerald-600" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <div className="space-y-6">
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Workspace access</p>
                  <h2 className="mt-2 text-base font-semibold">Public page</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Share one company address for customer scheduling.
                  </p>
                </div>
                <Globe2 className="size-5 text-blue-600" />
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-3">
                  <span className={`size-2 rounded-full ${data.company.publicBookingEnabled ? "bg-emerald-500" : "bg-slate-300"}`} />
                  <div>
                    <p className="text-xs font-semibold text-slate-800">
                      {data.company.publicBookingEnabled ? "Published" : "Draft"}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {data.connectedMemberCount} ready team member{data.connectedMemberCount === 1 ? "" : "s"}.
                    </p>
                  </div>
                </div>
              </div>

              <Link
                href={`/${data.company.slug}`}
                className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <span className="truncate">/{data.company.slug}</span>
                <ArrowUpRight className="size-4 shrink-0 text-slate-400" />
              </Link>
            </section>

                        {canManageEmployees && (
              <section data-section="page-settings-announcements" className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Page settings</p>
                    <h2 className="mt-2 text-base font-semibold">Announcement</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-500">Publish one active notice on this company&apos;s public booking page.</p>
                  </div>
                  <Megaphone className="size-5 text-blue-600" />
                </div>

                <div className="mt-5 space-y-3">
                  {announcements.filter((item) => item.active).slice(0, 1).map((item) => (
                    <div key={item.id} className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-blue-800">{item.title}</p>
                          <p className="mt-1 text-xs leading-5 text-blue-950">{item.message}</p>
                        </div>
                        <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">Live</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => void toggleAnnouncement(item)}
                        disabled={busy}
                        className="mt-3 text-xs font-semibold text-blue-700 hover:text-blue-900 disabled:opacity-50"
                      >
                        Turn off
                      </button>
                    </div>
                  ))}

                  {!announcements.some((item) => item.active) && (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
                      <p className="text-xs font-semibold text-slate-700">No active announcement</p>
                      <p className="mt-1 text-[11px] leading-5 text-slate-500">The next announcement will appear at the top of the public page.</p>
                    </div>
                  )}

                  {!announcementComposerOpen ? (
                    <button
                      type="button"
                      onClick={() => setAnnouncementComposerOpen(true)}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Plus className="size-4" />
                      New announcement
                    </button>
                  ) : (
                    <form onSubmit={createAnnouncement} className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <input
                        value={announcementTitle}
                        onChange={(event) => setAnnouncementTitle(event.target.value)}
                        maxLength={120}
                        placeholder="Announcement title"
                        className="focus-ring w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500"
                      />
                      <textarea
                        required
                        value={announcementMessage}
                        onChange={(event) => setAnnouncementMessage(event.target.value)}
                        maxLength={500}
                        rows={3}
                        placeholder="Write the message your customers should see..."
                        className="focus-ring w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500"
                      />
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setAnnouncementComposerOpen(false)} disabled={busy} className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-semibold text-slate-600 disabled:opacity-50">Cancel</button>
                        <button type="submit" disabled={busy || !announcementMessage.trim()} className="flex-1 rounded-xl bg-slate-950 px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-40">
                          {busy ? "Publishing..." : "Publish"}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </section>
            )}

<section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Team</p>
                  <h2 className="mt-2 text-base font-semibold">Members</h2>
                </div>
                <UsersRound className="size-5 text-blue-600" />
              </div>

              <div className="mt-5 space-y-2.5">
                {employees.length === 0 ? (
                  <p className="rounded-2xl bg-slate-50 p-4 text-xs text-slate-500">No team members yet.</p>
                ) : (
                  employees.slice(0, 5).map((employee) => (
                    <div key={employee.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3">
                      <UserAvatar name={employee.name} email={employee.email} size={34} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold">{employee.name}</p>
                        <p className="truncate text-[11px] text-slate-500">{employee.email}</p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${employee.googleConnected ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                        {employee.googleConnected ? "Ready" : "Needs setup"}
                      </span>
                      {canManageEmployees && employee.role === "EMPLOYEE" && (
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmation({
                              kind: "remove-employee",
                              id: employee.id,
                              name: employee.name
                            })
                          }
                          disabled={deletingEmployeeId === employee.id}
                          className="grid size-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                          aria-label={`Remove ${employee.name}`}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
              {employees.length > 5 && (
                <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                  <span>{employees.length - 5} more members</span>
                  <MoreHorizontal className="size-4" />
                </div>
              )}
            </section>

            {canManageEmployees && (
              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Access management</p>
                  <h2 className="mt-2 text-base font-semibold">Invite member</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Create a secure access invitation.</p>
                </div>
                <form onSubmit={inviteEmployee} className="mt-5 flex gap-2">
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="name@company.com"
                    className="focus-ring min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500"
                  />
                  <button
                    type="submit"
                    className="grid size-11 shrink-0 place-items-center rounded-xl bg-slate-950 text-white hover:bg-slate-800"
                    aria-label="Invite member"
                  >
                    <Plus className="size-4" />
                  </button>
                </form>
                {invite && (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <p className="break-all text-[11px] leading-5 text-slate-600">{invite}</p>
                    <button
                      type="button"
                      onClick={() => void navigator.clipboard.writeText(invite)}
                      className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-blue-700"
                    >
                      <Copy className="size-3.5" />
                      Copy invitation
                    </button>
                  </div>
                )}
              </section>
            )}

                        {canManageEmployees && (
              <section data-section="billing" className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Billing</p>
                    <h2 className="mt-2 text-base font-semibold">Conventus plan</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-500">Plans are paid securely through Razorpay. The server determines the amount from the selected plan.</p>
                  </div>
                  <CreditCard className="size-5 text-blue-600" />
                </div>
                <div className="mt-5 space-y-3">
                  {(["starter", "business"] as const).map((planId) => {
                    const plan = planId === "business" ? { name: "Business", price: "₹199", detail: "30 employees · 350 meetings · 35 min max · 30 concurrent" } : { name: "Starter", price: "₹99", detail: "10 employees · 100 meetings · 20 min max · 10 concurrent" };
                    return (
                      <div key={planId} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">{plan.name}</p>
                          <p className="mt-1 text-xs text-slate-500">{plan.price} / month</p>
                          <p className="mt-1 text-[11px] leading-5 text-slate-400">{plan.detail}</p>
                        </div>
                        <RazorpayPlanButton
                          planId={planId}
                          currentPlanId={data.subscription?.planId === "business" ? "business" : "starter"}
                          disabled={busy}
                          onComplete={() => void refresh()}
                          onError={(message) => setError(message)}
                        />
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

<section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Usage</p>
                  <h2 className="mt-2 text-base font-semibold">Monthly volume</h2>
                </div>
                <Settings2 className="size-5 text-slate-400" />
              </div>
              <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${usagePercent}%` }} />
              </div>
              <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
                <span>{data.subscription?.monthlyMeetingsUsed ?? 0} used</span>
                <span>{planMax} limit</span>
              </div>
            </section>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(confirmation)}
        title={confirmation?.kind === "remove-employee" ? "Remove member?" : "End meeting?"}
        description={
          confirmation?.kind === "remove-employee"
            ? `Remove ${confirmation.name} from this company? Their workspace access will be revoked.`
            : "End this meeting now? Access to this meeting will close and this booking cannot be reused."
        }
        confirmLabel={confirmation?.kind === "remove-employee" ? "Remove member" : "End meeting"}
        destructive
        busy={
          confirmation?.kind === "remove-employee"
            ? deletingEmployeeId === confirmation.id
            : endingRequestId === confirmation?.id
        }
        onCancel={() => {
          if (!deletingEmployeeId && !endingRequestId) setConfirmation(null);
        }}
        onConfirm={() => void confirmDialogAction()}
      />
    </main>
  );
}
