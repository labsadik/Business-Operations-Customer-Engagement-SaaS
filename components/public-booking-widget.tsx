"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Clock3, Loader2, LogIn, RefreshCw, ShieldCheck } from "lucide-react";

type MeetingType = { id: string; name: string; description?: string; durationOptionsMinutes: number[] };
type Slot = { startAt: string; endAt: string };

export default function PublicBookingWidget({
  companySlug,
  meetingTypes,
  authenticated
}: {
  companySlug: string;
  meetingTypes: MeetingType[];
  authenticated: boolean;
}) {
  const today = new Date();
  const todayIso = new Date(today.getTime() - today.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  const [date, setDate] = useState(todayIso);
  const [meetingTypeId, setMeetingTypeId] = useState(meetingTypes[0]?.id ?? "");
  const selectedType = meetingTypes.find((item) => item.id === meetingTypeId) ?? meetingTypes[0];
  const [duration, setDuration] = useState(selectedType?.durationOptionsMinutes[0] ?? 20);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [loading, setLoading] = useState(false);
  const [bookingId, setBookingId] = useState("");
  const [bookingState, setBookingState] = useState("");
  const [error, setError] = useState("");

  const loginUrl = useMemo(
    () => `/api/auth/google/start?intent=customer&companySlug=${encodeURIComponent(companySlug)}&returnTo=%2F${encodeURIComponent(companySlug)}`,
    [companySlug]
  );

  useEffect(() => {
    const nextDuration = selectedType?.durationOptionsMinutes[0] ?? 20;
    setDuration(nextDuration);
    setSlot(null);
  }, [meetingTypeId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!meetingTypeId || !duration) return;
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/public/${encodeURIComponent(companySlug)}/availability?date=${date}&meetingTypeId=${meetingTypeId}&duration=${duration}`, { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "AVAILABILITY_FAILED");
        if (!cancelled) setSlots(payload.data.slots);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "AVAILABILITY_FAILED");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [companySlug, date, meetingTypeId, duration]);

  useEffect(() => {
    if (!bookingId) return;
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/bookings/${bookingId}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) return;
      const booking = payload.data.booking;
      setBookingState(booking.status);
      if (payload.data.meeting?.status === "READY") {
        window.location.assign(`/${companySlug}/meet/${payload.data.meeting.id}`);
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [bookingId, companySlug]);

  async function submit() {
    if (!slot || !meetingTypeId) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/public/${encodeURIComponent(companySlug)}/bookings`, {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ meetingTypeId, startAt: slot.startAt, endAt: slot.endAt, durationMinutes: duration })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "BOOKING_FAILED");
      setBookingId(payload.data.bookingId);
      setBookingState(payload.data.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "BOOKING_FAILED");
    } finally {
      setLoading(false);
    }
  }

  if (!authenticated) {
    return <div className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm sm:p-8"><div className="grid size-12 place-items-center rounded-2xl bg-slate-950 text-white"><LogIn className="size-5" /></div><h2 className="mt-5 text-2xl font-semibold tracking-tight text-slate-950">Sign in to book</h2><p className="mt-3 text-sm leading-6 text-slate-600">Use your Google account to identify yourself as the customer for this booking. Company and employee sign-in stays on the main Conventus site.</p><a href={loginUrl} className="mt-7 flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3.5 text-sm font-semibold text-white hover:bg-slate-800"><span className="grid size-6 place-items-center rounded-full bg-white/10 text-xs font-bold">G</span>Continue with Google</a><div className="mt-5 flex gap-2 text-xs leading-5 text-slate-500"><ShieldCheck className="size-4 shrink-0 text-blue-600" />Only basic identity information is used for customer sign-in.</div></div>;
  }

  if (bookingId) {
    return <div className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm sm:p-8"><div className="grid size-12 place-items-center rounded-2xl bg-blue-50 text-blue-700"><Loader2 className="size-5 animate-spin" /></div><h2 className="mt-5 text-2xl font-semibold tracking-tight text-slate-950">{bookingState === "CONFIRMED" ? "Meeting confirmed" : "Finding an employee..."}</h2><p className="mt-3 text-sm leading-6 text-slate-600">{bookingState === "CONFIRMED" ? "Your meeting is being opened now." : "Employees have five minutes to accept. This page checks the server every two seconds for the next state."}</p><div className="mt-6 rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Booking ID</p><p className="mt-1 font-mono text-xs text-slate-700">{bookingId}</p></div><a href="/${companySlug}" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-blue-700"><RefreshCw className="size-4" /> Start another request</a></div>;
  }

  return <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
    {error && <div role="alert" className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error.replaceAll("_", " ")}</div>}
    <div className="grid gap-5">
      <label className="grid gap-2 text-sm font-medium text-slate-800">Meeting type<select value={meetingTypeId} onChange={(e) => setMeetingTypeId(e.target.value)} className="focus-ring rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500">{meetingTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label>
      <div><p className="text-sm font-medium text-slate-800">Date</p><div className="mt-2 flex items-center gap-3 rounded-xl border border-slate-300 px-4 py-3"><CalendarDays className="size-4 text-blue-600" /><input type="date" value={date} min={todayIso} onChange={(e) => setDate(e.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></div></div>
      <div><p className="text-sm font-medium text-slate-800">Duration</p><div className="mt-2 flex flex-wrap gap-2">{(selectedType?.durationOptionsMinutes ?? [20]).map((value) => <button key={value} type="button" onClick={() => setDuration(value)} className={`rounded-xl border px-4 py-2.5 text-sm font-semibold ${duration === value ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>{value} min</button>)}</div></div>
      <div><div className="flex items-center justify-between"><p className="text-sm font-medium text-slate-800">Available times</p>{loading && <span className="inline-flex items-center gap-2 text-xs text-slate-500"><Loader2 className="size-3 animate-spin" /> Checking</span>}</div><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{slots.map((item) => { const label = new Date(item.startAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); return <button key={item.startAt} onClick={() => setSlot(item)} className={`rounded-xl border px-3 py-3 text-sm font-semibold ${slot?.startAt === item.startAt ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"}`}>{label}</button>; })}</div>{!loading && slots.length === 0 && <div className="mt-3 rounded-2xl bg-slate-50 p-4 text-xs text-slate-500">No available slots were found for this date.</div>}</div>
      <button disabled={!slot || loading} onClick={() => void submit()} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"><CheckCircle2 className="size-4" /> Request meeting</button>
      <div className="flex gap-2 text-[11px] leading-5 text-slate-500"><Clock3 className="size-4 shrink-0 text-blue-600" />After submission, an available employee has five minutes to accept before the request retries or expires.</div>
    </div>
  </div>;
}