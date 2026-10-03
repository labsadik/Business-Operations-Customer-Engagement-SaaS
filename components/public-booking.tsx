"use client";

import type { Route } from "next";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Clock3, LayoutDashboard, Loader2, LogIn, ShieldCheck } from "lucide-react";
import { getTodayIso } from "@/lib/timezone";

type Type = { id: string; name: string; description?: string; durationOptionsMinutes: number[] };
type Slot = { startAt: string; endAt: string };
type Access = "anonymous" | "company-member" | "customer";

export default function PublicBooking({
  companySlug,
  types,
  access,
  sessionName,
  employeeLoginUrl,
  timezone
}: {
  companySlug: string;
  types: Type[];
  access: Access;
  sessionName?: string;
  employeeLoginUrl: string;
  timezone: string;
}) {
  const [date, setDate] = useState(() => getTodayIso(timezone));
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const type = types.find((item) => item.id === typeId) ?? types[0];
  const [duration, setDuration] = useState(type?.durationOptionsMinutes[0] ?? 20);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selected, setSelected] = useState<Slot | null>(null);
  const [loading, setLoading] = useState(false);
  const [bookingId, setBookingId] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!typeId || access !== "customer") return;
      setLoading(true);
      setError("");
      try {
        const response = await fetch(
          `/api/public/${encodeURIComponent(companySlug)}/availability?date=${date}&meetingTypeId=${typeId}&duration=${duration}`,
          { cache: "no-store" }
        );
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "AVAILABILITY_FAILED");
        if (!cancelled) setSlots(body.data.slots);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "AVAILABILITY_FAILED");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [companySlug, date, typeId, duration, access]);

  function handleTypeChange(nextTypeId: string) {
    setTypeId(nextTypeId);
    const nextType = types.find((item) => item.id === nextTypeId);
    setDuration(nextType?.durationOptionsMinutes[0] ?? 20);
    setSelected(null);
  }

  useEffect(() => {
    if (!bookingId) return;
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/bookings/${bookingId}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) return;
      setStatus(body.data.booking.status);
      const meeting = body.data.meeting;
      if (meeting?.status === "READY") window.open(`/${companySlug}/meet/${meeting.id}`, "_self");
      if (["EXPIRED", "CANCELLED"].includes(body.data.booking.status)) window.clearInterval(timer);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [bookingId, companySlug]);

  const loginUrl = useMemo(
    () => `/api/auth/google/start?intent=customer&companySlug=${encodeURIComponent(companySlug)}&returnTo=%2F${encodeURIComponent(companySlug)}`,
    [companySlug]
  );

  async function submit() {
    if (!selected) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/public/${encodeURIComponent(companySlug)}/bookings`, {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          meetingTypeId: typeId,
          startAt: selected.startAt,
          endAt: selected.endAt,
          durationMinutes: duration
        })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "BOOKING_FAILED");
      setBookingId(body.data.bookingId);
      setStatus(body.data.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "BOOKING_FAILED");
    } finally {
      setLoading(false);
    }
  }

  if (access === "company-member") {
    return (
      <section className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm sm:p-8">
        <div className="grid size-12 place-items-center rounded-2xl bg-blue-50 text-blue-700">
          <LayoutDashboard className="size-5" />
        </div>
        <p className="mt-5 text-sm font-semibold text-blue-600">Company member recognized</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Welcome back{sessionName ? `, ${sessionName}` : ""}.</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Your Google email is already registered for this company. Conventus will keep you inside the company-scoped workspace.
        </p>
        <Link href="/dashboard" className="mt-7 flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3.5 text-sm font-semibold text-white hover:bg-slate-800">
          <LayoutDashboard className="size-4" /> Open company dashboard
        </Link>
        <Link href={employeeLoginUrl as Route} className="mt-4 block text-center text-xs font-semibold text-blue-700">Company login page</Link>
      </section>
    );
  }

  if (access === "anonymous") {
    return (
      <section className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm sm:p-8">
        <div className="grid size-12 place-items-center rounded-2xl bg-slate-950 text-white"><LogIn className="size-5" /></div>
        <h2 className="mt-5 text-2xl font-semibold tracking-tight text-slate-950">Sign in to continue</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Continue with Google. Conventus checks this company first: registered employees go to the company dashboard, while other Google accounts continue as customers for the meeting request.
        </p>
        <button type="button" onClick={() => window.open(loginUrl, "_self")} className="mt-7 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3.5 text-sm font-semibold text-white hover:bg-slate-800">
          <span className="grid size-6 place-items-center rounded-full bg-white/10 text-xs font-bold">G</span>
          Continue with Google
        </button>
        <Link href={employeeLoginUrl as Route} className="mt-4 block text-center text-xs font-semibold text-blue-700">Employee? Open company login</Link>
        <div className="mt-5 flex gap-2 text-[11px] leading-5 text-slate-500">
          <ShieldCheck className="size-4 shrink-0 text-blue-600" />Employee authorization is checked server-side using the company email list.
        </div>
      </section>
    );
  }

  if (bookingId) {
    return (
      <section className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm sm:p-8">
        <div className="grid size-12 place-items-center rounded-2xl bg-blue-50 text-blue-700"><Loader2 className="size-5 animate-spin" /></div>
        <h2 className="mt-5 text-2xl font-semibold tracking-tight text-slate-950">{status === "CONFIRMED" ? "Meeting confirmed" : status === "EXPIRED" ? "Request expired" : "Finding your employee..."}</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">{status === "CONFIRMED" ? "Your company meeting page is opening now." : "The request is server-managed. An employee can accept within five minutes; otherwise Conventus retries or expires it."}</p>
        <div className="mt-6 rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Request</p><p className="mt-1 font-mono text-xs text-slate-700">{bookingId}</p></div>
        <Link href={`/${companySlug}` as Route} className="mt-5 inline-flex text-sm font-semibold text-blue-700">Start another request</Link>
      </section>
    );
  }

  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      {error && <div role="alert" className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error.replaceAll("_", " ")}</div>}
      <div className="grid gap-5">
        <label className="grid gap-2 text-sm font-semibold text-slate-800">
          Meeting type
          <select value={typeId} onChange={(e) => handleTypeChange(e.target.value)} className="focus-ring rounded-xl border border-slate-300 px-4 py-3 font-normal outline-none focus:border-blue-500">
            {types.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold text-slate-800">
          Date
          <div className="flex items-center gap-3 rounded-xl border border-slate-300 px-4 py-3">
            <CalendarDays className="size-4 text-blue-600" />
            <input type="date" value={date} min={getTodayIso(timezone)} onChange={(e) => { setDate(e.target.value); setSelected(null); }} className="min-w-0 flex-1 bg-transparent font-normal outline-none" />
          </div>
        </label>
        <div>
          <p className="text-sm font-semibold text-slate-800">Duration</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(type?.durationOptionsMinutes ?? [20]).map((minutes) => (
              <button key={minutes} type="button" onClick={() => setDuration(minutes)} className={`rounded-xl border px-4 py-2.5 text-sm font-semibold ${duration === minutes ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-700"}`}>
                {minutes} min
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between">
            <div><p className="text-sm font-semibold text-slate-800">Available times</p><p className="mt-0.5 text-[11px] font-normal text-slate-500">{timezone}</p></div>
            {loading && <span className="inline-flex items-center gap-2 text-xs text-slate-500"><Loader2 className="size-3 animate-spin" /> Checking Google calendars</span>}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {slots.map((item) => (
              <button key={item.startAt} type="button" onClick={() => setSelected(item)} className={`rounded-xl border px-3 py-3 text-sm font-semibold ${selected?.startAt === item.startAt ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"}`}>
                {new Date(item.startAt).toLocaleTimeString([], { timeZone: timezone, hour: "numeric", minute: "2-digit" })}
              </button>
            ))}
          </div>
          {!loading && slots.length === 0 && <div className="mt-3 rounded-2xl bg-slate-50 p-4 text-xs text-slate-500">No free times found for this date.</div>}
        </div>
        <button type="button" disabled={!selected || loading} onClick={() => void submit()} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3.5 text-sm font-semibold text-white disabled:opacity-40">
          <CheckCircle2 className="size-4" /> Request meeting
        </button>
        <div className="flex gap-2 text-[11px] leading-5 text-slate-500"><Clock3 className="size-4 shrink-0 text-blue-600" />Five minutes of server-managed employee acceptance, with automatic retry.</div>
      </div>
    </section>
  );
}
