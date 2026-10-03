"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, Copy, Globe2, LogOut, Plus, RefreshCw, Settings2, ShieldCheck, UsersRound, Video, XCircle } from "lucide-react";

type CompanyData = {
  company: { id: string; name: string; slug: string; description?: string; publicBookingEnabled: boolean };
  workspace: { id: string; name: string; timezone: string; planId: string } | null;
  subscription: { planId: string; status: string; monthlyMeetingsUsed: number; periodEnd: string } | null;
  memberCount: number;
};

type Employee = { id: string; name: string; email: string; role: string; googleConnected: boolean; presence: "AVAILABLE" | "BUSY" | "NOT_AVAILABLE" };
type RequestItem = { id: string; startAt: string; endAt: string; durationMinutes: number; status: string; expiresAt: string; customer: { name: string; email: string } | null };
type Presence = { userId: string; role: string; status: "AVAILABLE" | "BUSY" | "NOT_AVAILABLE"; redisAvailable: boolean };

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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  const [invite, setInvite] = useState("");
  const [presence, setPresence] = useState<Presence | null>(null);

  async function refresh() {
    try {
      const company = await api<CompanyData | null>("/api/company");
      setData(company);
      if (company) {
        const [staff, pending, currentPresence] = await Promise.all([
          api<Employee[]>("/api/company/employees"),
          api<RequestItem[]>("/api/employee/requests"),
          api<Presence>("/api/employee/presence")
        ]);
        setEmployees(staff);
        setRequests(pending);
        setPresence(currentPresence);
      }
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "REQUEST_FAILED");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!data) return;
    const id = window.setInterval(async () => {
      try {
        const next = await api<Presence>("/api/employee/presence", { method: "POST" });
        setPresence(next);
      } catch {
        // Presence expires server-side if heartbeat delivery fails.
      }
    }, 30_000);
    return () => window.clearInterval(id);
  }, [data]);

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
    setBusy(true);
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
    try {
      const result = await api<{ inviteUrl: string }>("/api/company/employees", { method: "POST", body: JSON.stringify({ email }) });
      setInvite(result.inviteUrl);
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "INVITE_FAILED");
    }
  }

  async function setPresenceStatus(status: Presence["status"]) {
    try {
      const next = await api<Omit<Presence, "userId" | "role">>("/api/employee/presence", { method: "PATCH", body: JSON.stringify({ status }) });
      setPresence((current) => current ? { ...current, ...next } : current);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "PRESENCE_UPDATE_FAILED");
    }
  }

  async function setPresenceStatus(status: Presence["status"]) {
    try {
      const next = await api<{ status: Presence["status"]; redisAvailable: boolean }>("/api/employee/presence", {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      setPresence((current) => current ? { ...current, ...next } : current);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "PRESENCE_UPDATE_FAILED");
    }
  }

  async function act(id: string, action: "accept" | "decline") {
    try {
      await api(`/api/bookings/${id}/${action}`, { method: "POST" });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "BOOKING_ACTION_FAILED");
    }
  }

  if (loading) return <main className="min-h-screen bg-[#f7f8fb]"><div className="mx-auto max-w-7xl px-5 py-10 sm:px-6 lg:px-8"><div className="h-48 animate-pulse rounded-[2rem] border border-slate-200 bg-white" /></div></main>;

  if (!data) {
    return <main className="min-h-screen bg-[#f7f8fb]"><header className="border-b border-slate-200 bg-white"><div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5"><Link href="/" className="font-semibold tracking-tight text-slate-950">Conventus</Link><form action="/api/auth/logout" method="post"><button className="text-sm font-medium text-slate-500">Sign out</button></form></div></header><div className="mx-auto max-w-2xl px-5 py-14 sm:px-6"><section className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm sm:p-10"><p className="text-sm font-semibold text-blue-600">Create workspace</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Start your Conventus company.</h1><p className="mt-3 text-sm leading-6 text-slate-600">Your account is ready. Give your company a name and a public URL slug, then connect Google for Calendar and Meet.</p><form onSubmit={createCompany} className="mt-8 grid gap-4"><label className="grid gap-2 text-sm font-semibold text-slate-800">Company name<input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Corporation" className="focus-ring rounded-xl border border-slate-300 px-4 py-3 font-normal outline-none focus:border-blue-500" /></label><label className="grid gap-2 text-sm font-semibold text-slate-800">Public slug<input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="acme" className="focus-ring rounded-xl border border-slate-300 px-4 py-3 font-normal outline-none focus:border-blue-500" /></label>{error && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">{error.replaceAll("_", " ")}</p>}<button disabled={busy} className="mt-2 rounded-xl bg-slate-950 px-5 py-3.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Creating..." : "Create workspace"}</button></form></section></div></main>;
  }

  const planMax = data.subscription?.planId === "business" ? 350 : 100;
  const usage = Math.min(100, Math.round(((data.subscription?.monthlyMeetingsUsed ?? 0) / planMax) * 100));

  return <main className="min-h-screen bg-[#f7f8fb]">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-6 lg:px-8"><Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-slate-950"><span className="grid size-8 place-items-center rounded-xl bg-slate-950 text-white"><Video className="size-4" /></span>Conventus</Link><div className="flex items-center gap-2"><Link href={`/${data.company.slug}`} className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 sm:inline-flex"><Globe2 className="mr-2 size-4" /> Public page</Link><a href="/api/auth/google/start?intent=connect&returnTo=/dashboard" className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><ShieldCheck className="size-4 text-blue-600" /> Connect Google</a><form action="/api/auth/logout" method="post"><button aria-label="Sign out" className="grid size-10 place-items-center rounded-xl border border-slate-200 text-slate-600"><LogOut className="size-4" /></button></form></div></div></header>

    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-6 lg:px-8">
      {error && <div role="alert" className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error.replaceAll("_", " ")}</div>}
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
        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 px-6 py-5"><div className="flex items-center justify-between"><div><h2 className="text-base font-semibold text-slate-950">Incoming requests</h2><p className="mt-1 text-xs text-slate-500">The server checks acceptance and expiration; this dashboard refreshes every three seconds.</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{requests.length} pending</span></div></div><div className="divide-y divide-slate-100">{requests.length === 0 ? <div className="px-6 py-14 text-center"><Video className="mx-auto size-7 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-900">No active requests</p><p className="mt-1 text-xs text-slate-500">Customer booking requests will appear here.</p></div> : requests.map((item) => { const remaining = Math.max(0, Math.ceil((new Date(item.expiresAt).getTime() - Date.now()) / 1000)); return <div key={item.id} className="px-6 py-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-slate-950">{item.customer?.name ?? "Customer"}</p><p className="mt-1 text-xs text-slate-500">{new Date(item.startAt).toLocaleString()} · {item.durationMinutes} min</p><p className="mt-2 text-xs font-semibold text-blue-700">Expires {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</p></div><div className="flex gap-2"><button onClick={() => void act(item.id, "decline")} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs font-semibold text-slate-700"><XCircle className="size-4" /> Decline</button><button onClick={() => void act(item.id, "accept")} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3.5 py-2.5 text-xs font-semibold text-white"><CheckCircle2 className="size-4" /> Accept</button></div></div></div>; })}</div></section>

        <div className="space-y-5">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-base font-semibold text-slate-950">Company access links</h2><p className="mt-1 text-xs leading-5 text-slate-500">Publish the customer page and share the company-scoped employee login separately.</p><div className="mt-4 flex items-center gap-3 rounded-2xl bg-slate-50 p-3"><span className={`size-2 rounded-full ${data.company.publicBookingEnabled ? "bg-emerald-500" : "bg-slate-300"}`} /><span className="text-xs font-semibold text-slate-700">{data.company.publicBookingEnabled ? "Public page published" : "Public page draft"}</span><button onClick={() => void publish()} disabled={busy} className="ml-auto rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white">{data.company.publicBookingEnabled ? "Unpublish" : "Publish"}</button></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><Link href={`/${data.company.slug}`} className="block break-all rounded-2xl border border-slate-200 bg-white p-3 font-mono text-xs text-slate-700 hover:border-slate-300"><span className="mb-1 block font-sans text-[11px] font-semibold text-slate-500">Customer booking</span>/{data.company.slug}</Link><Link href={`/${data.company.slug}/login`} className="block break-all rounded-2xl border border-slate-200 bg-white p-3 font-mono text-xs text-slate-700 hover:border-slate-300"><span className="mb-1 block font-sans text-[11px] font-semibold text-slate-500">Employee login</span>/{data.company.slug}/login</Link></div></section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center justify-between gap-4"><div><h2 className="text-base font-semibold text-slate-950">Employees</h2><p className="mt-1 text-xs text-slate-500">{employees.length} active members · live presence</p></div><UsersRound className="size-5 text-blue-600" /></div>{presence && <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold text-slate-700">Your status</p><p className="mt-1 text-[11px] text-slate-500">{presence.redisAvailable ? "Synced through Upstash Redis" : "Redis presence is unavailable"}</p></div><select value={presence.status} onChange={(e) => void setPresenceStatus(e.target.value as Presence["status"])} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500"><option value="AVAILABLE">Available</option><option value="BUSY">Busy</option><option value="NOT_AVAILABLE">Not available</option></select></div>}<div className="mt-5 space-y-3">{employees.map((employee) => <div key={employee.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{employee.name}</p><p className="truncate text-xs text-slate-500">{employee.email}</p></div><div className="flex shrink-0 items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${employee.presence === "AVAILABLE" ? "bg-emerald-50 text-emerald-700" : employee.presence === "BUSY" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{employee.presence.replaceAll("_", " ")}</span><span className={`hidden rounded-full px-2.5 py-1 text-[11px] font-semibold sm:inline-flex ${employee.googleConnected ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}`}>{employee.googleConnected ? "Google ready" : "Connect Google"}</span></div></div>)}</div></section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-base font-semibold text-slate-950">Invite employee</h2><p className="mt-1 text-xs leading-5 text-slate-500">Generate a secure invite link for the employee.</p><form onSubmit={inviteEmployee} className="mt-4 flex gap-2"><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="employee@company.com" className="focus-ring min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500" /><button className="grid size-11 place-items-center rounded-xl bg-slate-950 text-white"><Plus className="size-4" /></button></form>{invite && <div className="mt-4 rounded-2xl bg-slate-50 p-3"><p className="break-all text-xs text-slate-600">{invite}</p><button type="button" onClick={() => void navigator.clipboard.writeText(invite)} className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-blue-700"><Copy className="size-3.5" /> Copy invite link</button></div>}</section>

          <div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${usage}%` }} /></div>
        </div>
      </div>
    </div>
  </main>;
}