"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Clock3, Loader2, LogIn, ShieldCheck } from "lucide-react";

type Type = { id: string; name: string; description?: string; durationOptionsMinutes: number[] };
type Slot = { startAt: string; endAt: string };

export default function PublicBooking({ companySlug, types, authenticated }: { companySlug: string; types: Type[]; authenticated: boolean }) {
  const initialDate = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const [date, setDate] = useState(initialDate);
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
    setDuration(type?.durationOptionsMinutes[0] ?? 20);
    setSelected(null);
  }, [typeId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!typeId) return;
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/public/${encodeURIComponent(companySlug)}/availability?date=${date}&meetingTypeId=${typeId}&duration=${duration}`, { cache: "no-store" });
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
  }, [companySlug, date, typeId, duration]);

  useEffect(() => {
    if (!bookingId) return;
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/bookings/${bookingId}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) return;
      setStatus(body.data.booking.status);
      const meeting = body.data.meeting;
      if (meeting?.status === "READY") window.location.assign(`/${companySlug}/meet/${meeting.id}`);
      if (["EXPIRED", "CANCELLED"].includes(body.data.booking.status)) window.clearInterval(timer);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [bookingId, companySlug]);

  const loginUrl = useMemo(() => `/api/auth/google/start?intent=customer&companySlug=${encodeURIComponent(companySlug)}&returnTo=%2F${encodeURIComponent(companySlug)}`, [companySlug]);

  async function submit() {
    if (!selected) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/public/${encodeURIComponent(companySlug)}/bookings`, {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ meetingTypeId: typeId, startAt: selected.startAt, endAt: selected.endAt, durationMinutes: duration })
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

  if (!authenticated) return <section className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm sm:p-8"><div className="grid size-12 place-items-center rounded-2xl bg-slate-950 text-white"><LogIn className="size-5" /></div><h2 className="mt-5 text-2xl font-semibold tracking-tight text-slate-950">Sign in to book</h2><p className="mt-3 text-sm leading-6 text-slate-600">Use Google to sign in as the customer for this company. Calendar and Meet permissions are not requested for this booking login.</p><a href={loginUrl} className="mt-7 flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3.5 text-sm font-semibold text-white hover:bg-slate-800"><span className="grid size-6 place-items-center rounded-full bg-white/10 text-xs font-bold">G</span>Continue with Google</a><div className="mt-5 flex gap-2 text-xs leading-5 text-slate-500"><ShieldCheck className="size-4 shrink-0 text-blue-600" />Only basic Google identity is used here.</div></section>;

  if (bookingId) return <section className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm sm:p-8"><div className="grid size-12 place-items-center rounded-2xl bg-blue-50 text-blue-700"><Loader2 className="size-5 animate-spin" /></div><h2 className="mt-5 text-2xl font-semibold tracking-tight text-slate-950">{status === "CONFIRMED" ? "Meeting confirmed" : status === "EXPIRED" ? "Request expired" : "Finding your employee..."}</h2><p className="mt-3 text-sm leading-6 text-slate-600">{status === "CONFIRMED" ? "Your company meeting page is opening now." : "The request is server-managed. An employee can accept within five minutes; otherwise Conventus retries or expires it."}</p><div className="mt-6 rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Request</p><p className="mt-1 font-mono text-xs text-slate-700">{bookingId}</p></div><a href={`/${companySlug}`} className="mt-5 inline-flex text-sm font-semibold text-blue-700">Start another request</a></section>;

  return <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
    {error && <div role="alert" className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error.replaceAll("_", " ")}</div>}
    <div className="grid gap-5">
      <label className="grid gap-2 text-sm font-semibold text-slate-800">Meeting type<select value={typeId} onChange={(e) => setTypeId(e.target.value)} className="focus-ring rounded-xl border border-slate-300 px-4 py-3 font-normal outline-none focus:border-blue-500">{types.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-semibold text-slate-800">Date<div className="flex items-center gap-3 rounded-xl border border-slate-300 px-4 py-3"><CalendarDays className="size-4 text-blue-600" /><input type="date" value={date} min={initialDate} onChange={(e) => setDate(e.target.value)} className="min-w-0 flex-1 bg-transparent font-normal outline-none" /></div></label>
      <div><p className="text-sm font-semibold text-slate-800">Duration</p><div className="mt-2 flex flex-wrap gap-2">{(type?.durationOptionsMinutes ?? [20]).map((minutes) => <button key={minutes} type="button" onClick={() => setDuration(minutes)} className={`rounded-xl border px-4 py-2.5 text-sm font-semibold ${duration === minutes ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-700"}`}>{minutes} min</button>)}</div></div>
      <div><div className="flex items-center justify-between"><p className="text-sm font-semibold text-slate-800">Available times</p>{loading && <span className="inline-flex items-center gap-2 text-xs text-slate-500"><Loader2 className="size-3 animate-spin" /> Checking Google calendars</span>}</div><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{slots.map((item) => <button key={item.startAt} type="button" onClick={() => setSelected(item)} className={`rounded-xl border px-3 py-3 text-sm font-semibold ${selected?.startAt === item.startAt ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"}`}>{new Date(item.startAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</button>)}</div>{!loading && slots.length === 0 && <div className="mt-3 rounded-2xl bg-slate-50 p-4 text-xs text-slate-500">No free times found for this date.</div>}</div>
      <button type="button" disabled={!selected || loading} onClick={() => void submit()} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3.5 text-sm font-semibold text-white disabled:opacity-40"><CheckCircle2 className="size-4" /> Request meeting</button>
      <div className="flex gap-2 text-[11px] leading-5 text-slate-500"><Clock3 className="size-4 shrink-0 text-blue-600" />Five minutes of server-managed employee acceptance, with automatic retry.</div>
    </div>
  </section>;
}