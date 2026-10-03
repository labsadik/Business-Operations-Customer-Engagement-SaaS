"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Copy, ExternalLink, Globe2, LogOut, Plus, RefreshCw, Settings2, ShieldCheck, UsersRound, Video, XCircle } from "lucide-react";

type CompanyData = {
  company: { id: string; name: string; slug: string; description?: string; publicBookingEnabled: boolean };
  workspace: { id: string; name: string; timezone: string; planId: string } | null;
  subscription: { planId: string; status: string; monthlyMeetingsUsed: number; periodEnd: string } | null;
  memberCount: number;
};

type Employee = { id: string; name: string; email: string; role: string; googleConnected: boolean };
type RequestItem = { id: string; startAt: string; endAt: string; durationMinutes: number; status: string; expiresAt: string; customer: { name: string; email: string } | null };

const INITIAL_NOW = Date.now();

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "REQUEST_FAILED");
  return payload.data as T;
}

export default function DashboardClient() {
  const [companyData, setCompanyData] = useState<CompanyData | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [companyName, setCompanyName] = useState("");
  const [companySlug, setCompanySlug] = useState("");
  const [employeeEmail, setEmployeeEmail] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingCompany, setSavingCompany] = useState(false);
  const [now, setNow] = useState(INITIAL_NOW);

  async function refresh() {
    try {
      setError("");
      const data = await getJson<CompanyData | null>("/api/company");
      setCompanyData(data);
      if (data) {
        const [staff, pending] = await Promise.all([
          getJson<Employee[]>("/api/company/employees"),
          getJson<RequestItem[]>("/api/employee/requests")
        ]);
        setEmployees(staff);
        setRequests(pending);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "REQUEST_FAILED");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const initial = window.setTimeout(() => { void refresh(); }, 0);
    const timer = window.setInterval(() => { void refresh(); }, 3000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const usagePercent = useMemo(() => {
    if (!companyData?.subscription) return 0;
    const max = companyData.subscription.planId === "business" ? 350 : 100;
    return Math.min(100, Math.round(companyData.subscription.monthlyMeetingsUsed / max * 100));
  }, [companyData]);

  async function createCompany(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingCompany(true);
    setError("");
    try {
      await getJson("/api/company", { method: "POST", body: JSON.stringify({ name: companyName, slug: companySlug }) });
      await refresh();
      setCompanyName("");
      setCompanySlug("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "COMPANY_CREATE_FAILED");
    } finally {
      setSavingCompany(false);
    }
  }

  async function inviteEmployee(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      const data = await getJson<{ inviteUrl: string }>("/api/company/employees", { method: "POST", body: JSON.stringify({ email: employeeEmail }) });
      setInviteUrl(data.inviteUrl);
      setEmployeeEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "INVITE_FAILED");
    }
  }

  async function act(bookingId: string, action: "accept" | "decline") {
    try {
      setError("");
      await getJson(`/api/bookings/${bookingId}/${action}`, { method: "POST" });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "BOOKING_ACTION_FAILED");
    }
  }

  if (loading) {
    return <div className="mx-auto max-w-7xl px-5 py-10 sm:px-6 lg:px-8"><div className="h-40 animate-pulse rounded-3xl border border-slate-200 bg-white" /></div>;
  }

  if (!companyData) {
    return (
      <main className="min-h-screen bg-[#f7f8fb]">
        <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5 sm:px-6"><Link href="/" className="font-semibold tracking-tight text-slate-950">Conventus</Link><form action="/api/auth/logout" method="post"><button className="text-sm font-medium text-slate-500 hover:text-slate-900">Sign out</button></form></div></header>
        <div className="mx-auto max-w-3xl px-5 py-12 sm:px-6">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
            <p className="text-sm font-semibold text-blue-600">Step 1 of onboarding</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Create your company workspace.</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">Your first workspace starts on the Starter plan. You can connect Google and publish the booking page after the workspace is created.</p>
            <form onSubmit={createCompany} className="mt-8 grid gap-4">
              <label className="grid gap-2 text-sm font-medium text-slate-800">Company name<input required value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="focus-ring rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500" placeholder="Acme Corporation" /></label>
              <label className="grid gap-2 text-sm font-medium text-slate-800">Public slug<input value={companySlug} onChange={(e) => setCompanySlug(e.target.value)} className="focus-ring rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500" placeholder="acme" /></label>
              <button disabled={savingCompany} className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3.5 text-sm font-semibold text-white disabled:opacity-50">{savingCompany ? "Creating..." : "Create workspace"}<Plus className="size-4" /></button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  const { company, workspace, subscription } = companyData;

  return (
    <main className="min-h-screen bg-[#f7f8fb]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-6 lg:px-8">
          <Link href="/" className="font-semibold tracking-tight text-slate-950">Conventus</Link>
          <div className="flex items-center gap-2">
            <Link href={`/${company.slug}`} className="hidden items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 sm:inline-flex"><Globe2 className="size-4" /> Public page</Link>
            <button type="button" onClick={() => window.open("/api/auth/google/start?intent=connect&returnTo=/dashboard", "_self")} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3.5 py-2.5 text-sm font-semibold text-white"><ShieldCheck className="size-4" /> Connect Google</button>
            <form action="/api/auth/logout" method="post"><button aria-label="Sign out" className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"><LogOut className="size-4" /></button></form>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-6 lg:px-8">
        {error && <div role="alert" className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error.replaceAll("_", " ")}</div>}

        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div><p className="text-sm font-semibold text-blue-600">Company workspace</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{company.name}</h1><p className="mt-2 text-sm text-slate-500">/{company.slug} · {workspace?.timezone}</p></div>
          <button onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><RefreshCw className="size-4" /> Refresh</button>
        </div>

        <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Plan", subscription?.planId === "business" ? "Business" : "Starter", Settings2],
            ["Members", companyData.memberCount.toString(), UsersRound],
            ["Monthly usage", `${subscription?.monthlyMeetingsUsed ?? 0} / ${subscription?.planId === "business" ? 350 : 100}`, CalendarDays],
            ["Public page", company.publicBookingEnabled ? "Published" : "Draft", Globe2]
          ].map(([title, value, Icon]) => { const I = Icon as typeof Globe2; return <div key={title as string} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><I className="size-5" /></div><p className="mt-4 text-xs font-medium text-slate-500">{title as string}</p><p className="mt-1 text-xl font-semibold text-slate-950">{value as string}</p></div>; })}
        </div>

        <div className="mt-7 grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
          <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5"><div><h2 className="text-base font-semibold text-slate-950">Incoming requests</h2><p className="mt-1 text-xs text-slate-500">Refreshes every three seconds while Phase 4 realtime is added.</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{requests.length} pending</span></div>
            <div className="divide-y divide-slate-100">
              {requests.length === 0 ? <div className="px-6 py-12 text-center"><Video className="mx-auto size-7 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-900">No active requests</p><p className="mt-1 text-xs text-slate-500">New customer requests will appear here.</p></div> :
                requests.map((item) => {
                  const remaining = Math.max(0, Math.ceil((new Date(item.expiresAt).getTime() - now) / 1000));
                  return <div key={item.id} className="px-6 py-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-slate-950">{item.customer?.name ?? "Customer"}</p><p className="mt-1 text-xs text-slate-500">{new Date(item.startAt).toLocaleString()} · {item.durationMinutes} min</p><p className="mt-2 text-xs font-semibold text-blue-700">Expires in {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</p></div><div className="flex gap-2"><button onClick={() => void act(item.id, "decline")} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><XCircle className="size-4" /> Decline</button><button onClick={() => void act(item.id, "accept")} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-blue-700"><CheckCircle2 className="size-4" /> Accept</button></div></div></div>;
                })}
            </div>
          </section>

          <div className="space-y-5">
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="text-base font-semibold text-slate-950">Employees</h2><p className="mt-1 text-xs text-slate-500">{employees.length} connected workspace members</p></div><UsersRound className="size-5 text-blue-600" /></div><div className="mt-5 space-y-3">{employees.map((employee) => <div key={employee.id} className="flex items-center justify-between rounded-2xl border border-slate-200 p-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{employee.name}</p><p className="truncate text-xs text-slate-500">{employee.email}</p></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${employee.googleConnected ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{employee.googleConnected ? "Google ready" : "Connect Google"}</span></div>)}</div></section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-base font-semibold text-slate-950">Invite employee</h2><p className="mt-1 text-xs leading-5 text-slate-500">Generate a secure invite link. Email delivery can be layered on later without changing the authorization model.</p><form onSubmit={inviteEmployee} className="mt-4 flex gap-2"><input required type="email" value={employeeEmail} onChange={(e) => setEmployeeEmail(e.target.value)} className="focus-ring min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500" placeholder="employee@company.com" /><button className="grid size-11 place-items-center rounded-xl bg-slate-950 text-white"><Plus className="size-4" /></button></form>{inviteUrl && <div className="mt-4 rounded-2xl bg-slate-50 p-3"><p className="break-all text-xs text-slate-600">{inviteUrl}</p><button onClick={() => void navigator.clipboard.writeText(inviteUrl)} className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-blue-700"><Copy className="size-3.5" /> Copy invite</button></div>}</section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="text-base font-semibold text-slate-950">Public booking</h2><p className="mt-1 text-xs text-slate-500">Share this link with customers after publishing.</p></div><ExternalLink className="size-4 text-slate-400" /></div><Link href={`/${company.slug}`} className="mt-4 block break-all rounded-2xl bg-slate-50 p-3 font-mono text-xs text-slate-700">/{company.slug}</Link><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${usagePercent}%` }} /></div><p className="mt-2 text-[11px] text-slate-500">{usagePercent}% of monthly meeting quota used</p></section>
          </div>
        </div>
      </div>
    </main>
  );
}