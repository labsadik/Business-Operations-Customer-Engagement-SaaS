"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Loader2,
  LogIn,
  ShieldCheck,
  Video,
  X
} from "lucide-react";
import { getTodayIso, zonedDateTimeToUtc } from "@/lib/timezone";
import { playMeetingSound, unlockMeetingSound } from "@/lib/client-meeting-sound";

type Type = {
  id: string;
  name: string;
  description?: string;
  durationOptionsMinutes: number[];
};

type Slot = {
  startAt: string;
  endAt: string;
};

type Access = "anonymous" | "customer";

type AvailabilityReason =
  | "AVAILABLE"
  | "NO_ACTIVE_MEMBERS"
  | "NO_SCHEDULING_MEMBER"
  | "NO_FREE_SLOTS"
  | "AVAILABILITY_SERVICE_ERROR";

function isoFromUtc(date: Date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
}

function monthStartForIso(dateIso: string) {
  const [year, month] = dateIso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1, 12));
}

function buildCalendarDays(monthStart: Date) {
  const firstWeekday = monthStart.getUTCDay();
  const firstCell = new Date(monthStart);
  firstCell.setUTCDate(1 - firstWeekday);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstCell);
    date.setUTCDate(firstCell.getUTCDate() + index);
    return {
      iso: isoFromUtc(date),
      day: date.getUTCDate(),
      inMonth: date.getUTCMonth() === monthStart.getUTCMonth()
    };
  });
}

function formatMonth(monthStart: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(monthStart);
}

function formatLongDate(dateIso: string, timezone: string) {
  const date = zonedDateTimeToUtc(dateIso, 12 * 60, timezone);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: timezone
  }).format(date);
}

function formatTime(iso: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone
  }).format(new Date(iso));
}

export default function PublicBooking({
  companySlug,
  companyName,
  companyDescription,
  types,
  access,
  timezone
}: {
  companySlug: string;
  companyName: string;
  companyDescription: string;
  types: Type[];
  access: Access;
  timezone: string;
}) {
  const [todayIso] = useState(() => getTodayIso(timezone));
  const [date, setDate] = useState(todayIso);
  const [calendarMonth, setCalendarMonth] = useState(() => monthStartForIso(todayIso));
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const type = types.find((item) => item.id === typeId) ?? types[0];
  const [duration, setDuration] = useState(type?.durationOptionsMinutes[0] ?? 20);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selected, setSelected] = useState<Slot | null>(null);
  const [loading, setLoading] = useState(false);
  const [bookingId, setBookingId] = useState("");
  const [status, setStatus] = useState("");
  const [meetingUri, setMeetingUri] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [error, setError] = useState("");
  const [availabilityReason, setAvailabilityReason] =
    useState<AvailabilityReason | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const observedStatusRef = useRef("");
  const observedMeetingUriRef = useRef("");

  const calendarDays = useMemo(() => buildCalendarDays(calendarMonth), [calendarMonth]);

  const loadAvailability = useCallback(
    async (silent = false) => {
      if (!typeId || access !== "customer" || !date) return;
      if (!silent) setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/api/public/${encodeURIComponent(companySlug)}/availability?date=${date}&meetingTypeId=${typeId}&duration=${duration}`,
          {
            cache: "no-store",
            headers: { "Cache-Control": "no-cache" }
          }
        );

        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "AVAILABILITY_FAILED");

        const nextSlots = Array.isArray(body.data?.slots)
          ? (body.data.slots as Slot[])
          : [];

        setSlots(nextSlots);
        setAvailabilityReason(
          (body.data?.availability?.reason as AvailabilityReason | undefined) ??
            (nextSlots.length > 0 ? "AVAILABLE" : "NO_FREE_SLOTS")
        );

        setSelected((current) =>
          current && nextSlots.some((slot) => slot.startAt === current.startAt)
            ? current
            : null
        );
      } catch (err) {
        setSlots([]);
        setSelected(null);
        setAvailabilityReason(null);
        setError(err instanceof Error ? err.message : "AVAILABILITY_FAILED");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [access, companySlug, date, duration, typeId]
  );

  useEffect(() => {
    if (!typeId || access !== "customer") return;

    const initial = window.setTimeout(() => {
      void loadAvailability();
    }, 0);

    const interval = window.setInterval(() => {
      void loadAvailability(true);
    }, 15000);

    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [access, loadAvailability, typeId]);

  useEffect(() => {
    if (!bookingId) return;

    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/bookings/${bookingId}`, {
          cache: "no-store"
        });
        const body = await response.json();
        if (!response.ok) return;

        const nextStatus = body.data.booking.status as string;
        const previousStatus = observedStatusRef.current;
        const nextMeeting = body.data.meeting;
        const nextMeetingUri = nextMeeting?.meetingUri ? String(nextMeeting.meetingUri) : "";

        if (nextMeeting?.status === "READY" && nextMeetingUri && !observedMeetingUriRef.current) {
          void playMeetingSound("accepted");
        } else if (nextStatus === "RETRYING" && previousStatus !== "RETRYING") {
          void playMeetingSound("retrying");
        } else if (nextStatus === "EXPIRED" && previousStatus !== "EXPIRED") {
          void playMeetingSound("expired");
        }

        observedStatusRef.current = nextStatus;
        observedMeetingUriRef.current = nextMeetingUri;

        setStatus(nextStatus);
        setExpiresAt(body.data.booking.expiresAt);
        setRemainingSeconds(
          Math.max(
            0,
            Math.ceil(
              (new Date(body.data.booking.expiresAt).getTime() - Date.now()) /
                1000
            )
          )
        );

        if (nextMeeting?.status === "READY" && nextMeetingUri) {
          setMeetingUri(nextMeetingUri);
          setStatus("CONFIRMED");
          window.clearInterval(timer);
        }

        if (nextStatus === "EXPIRED" || nextStatus === "CANCELLED") {
          window.clearInterval(timer);
        }
      } catch {
        // Keep polling quietly; transient client/network failures should not end the request.
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [bookingId]);

  const loginUrl = useMemo(
    () =>
      `/api/auth/google/start?intent=customer&companySlug=${encodeURIComponent(
        companySlug
      )}&returnTo=%2F${encodeURIComponent(companySlug)}`,
    [companySlug]
  );

  const selectedTime = selected
    ? formatTime(selected.startAt, timezone)
    : null;

  const selectedDateLabel = date ? formatLongDate(date, timezone) : "";

  function selectDate(nextDate: string) {
    if (nextDate < todayIso) return;
    setDate(nextDate);
    setCalendarMonth(monthStartForIso(nextDate));
    setSelected(null);
    setError("");
  }

  function shiftMonth(delta: number) {
    const next = new Date(calendarMonth);
    next.setUTCMonth(next.getUTCMonth() + delta);

    const currentMonth = monthStartForIso(todayIso);
    const nextMonthKey = next.getUTCFullYear() * 12 + next.getUTCMonth();
    const currentMonthKey =
      currentMonth.getUTCFullYear() * 12 + currentMonth.getUTCMonth();

    if (nextMonthKey < currentMonthKey) return;
    setCalendarMonth(next);
  }

  function chooseSlot(slot: Slot) {
    setSelected(slot);
    setModalOpen(true);
    setError("");
  }

  async function submit() {
    if (!selected || !typeId) return;

    setLoading(true);
    setError("");
    void unlockMeetingSound();

    try {
      const response = await fetch(
        `/api/public/${encodeURIComponent(companySlug)}/bookings`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "Idempotency-Key": crypto.randomUUID()
          },
          body: JSON.stringify({
            meetingTypeId: typeId,
            startAt: selected.startAt,
            endAt: selected.endAt,
            durationMinutes: duration
          })
        }
      );

      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "BOOKING_FAILED");

      setBookingId(body.data.bookingId);
      setMeetingUri("");
      setStatus(body.data.status);
      setExpiresAt(body.data.expiresAt);
      setRemainingSeconds(
        Math.max(
          0,
          Math.ceil(
            (new Date(body.data.expiresAt).getTime() - Date.now()) / 1000
          )
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "BOOKING_FAILED");
    } finally {
      setLoading(false);
    }
  }

  function resetRequest() {
    setBookingId("");
    setStatus("");
    setMeetingUri("");
    setExpiresAt("");
    setRemainingSeconds(0);
    setModalOpen(false);
    setSelected(null);
    setError("");
    void loadAvailability(true);
  }

  if (access === "anonymous") {
    return (
      <section className="mx-auto max-w-lg rounded-[2rem] border border-white/10 bg-white p-7 shadow-2xl sm:p-9">
        <div className="grid size-12 place-items-center rounded-2xl bg-slate-950 text-white">
          <LogIn className="size-5" />
        </div>
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
          Secure scheduling
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
          Sign in to book
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Your account is used to identify the customer and protect the booking request.
        </p>
        <button
          type="button"
          onClick={() => window.open(loginUrl, "_self")}
          className="mt-7 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3.5 text-sm font-semibold text-white hover:bg-slate-800"
        >
          <span className="grid size-6 place-items-center rounded-full bg-white/10 text-xs font-bold">
            G
          </span>
          Continue securely
        </button>
      </section>
    );
  }

  const currentMonth = monthStartForIso(todayIso);
  const calendarMonthKey =
    calendarMonth.getUTCFullYear() * 12 + calendarMonth.getUTCMonth();
  const currentMonthKey =
    currentMonth.getUTCFullYear() * 12 + currentMonth.getUTCMonth();
  const canGoPrevious = calendarMonthKey > currentMonthKey;
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const pending =
    bookingId &&
    !meetingUri &&
    !["EXPIRED", "CANCELLED"].includes(status);
  const confirmed = Boolean(meetingUri) && status === "CONFIRMED";
  const unavailable =
    status === "RETRYING" ||
    status === "EXPIRED" ||
    status === "CANCELLED";

  return (
    <>
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-white shadow-2xl">
        <div className="grid lg:grid-cols-[420px_minmax(0,1fr)]">
          <aside className="border-b border-slate-200 bg-slate-50 p-5 sm:p-7 lg:border-b-0 lg:border-r">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
                  Create meeting
                </p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
                  Pick your date
                </h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Live availability is checked before each request.
                </p>
              </div>
              <CalendarDays className="mt-1 size-5 text-blue-600" />
            </div>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-950">
                  {formatMonth(calendarMonth)}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Previous month"
                    onClick={() => shiftMonth(-1)}
                    disabled={!canGoPrevious}
                    className="grid size-9 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next month"
                    onClick={() => shiftMonth(1)}
                    className="grid size-9 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-7 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                  <span key={day} className="py-2">
                    {day.slice(0, 1)}
                  </span>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((day) => {
                  const disabled = day.iso < todayIso;
                  const selectedDay = day.iso === date;
                  const today = day.iso === todayIso;

                  return (
                    <button
                      key={day.iso}
                      type="button"
                      disabled={disabled}
                      onClick={() => selectDate(day.iso)}
                      className={[
                        "relative grid aspect-square place-items-center rounded-xl text-xs font-semibold transition",
                        !day.inMonth && "text-slate-300",
                        day.inMonth && !disabled && !selectedDay && "text-slate-700 hover:bg-blue-50 hover:text-blue-700",
                        selectedDay && "bg-blue-600 text-white shadow-sm",
                        today && !selectedDay && "ring-1 ring-blue-200",
                        disabled && "cursor-not-allowed text-slate-200"
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {day.day}
                      {today && (
                        <span
                          className={[
                            "absolute bottom-1 size-1 rounded-full",
                            selectedDay ? "bg-white/80" : "bg-blue-500"
                          ].join(" ")}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold text-slate-700">Meeting type</p>
              {types.length === 0 ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-800">
                  This company has no active meeting types configured.
                </div>
              ) : (
                types.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setTypeId(item.id);
                      setDuration(item.durationOptionsMinutes[0] ?? 20);
                      setSelected(null);
                    }}
                    className={[
                      "w-full rounded-2xl border p-4 text-left transition",
                      item.id === typeId
                        ? "border-blue-500 bg-blue-50"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    ].join(" ")}
                  >
                    <p className="text-sm font-semibold text-slate-950">{item.name}</p>
                    {item.description && (
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {item.description}
                      </p>
                    )}
                  </button>
                ))
              )}
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-slate-700">Duration</p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Choose the length for this request.
                  </p>
                </div>
                <Clock3 className="size-4 text-blue-600" />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {(type?.durationOptionsMinutes ?? []).map((minutesOption) => (
                  <button
                    key={minutesOption}
                    type="button"
                    onClick={() => {
                      setDuration(minutesOption);
                      setSelected(null);
                    }}
                    className={[
                      "rounded-xl border px-3.5 py-2 text-xs font-semibold transition",
                      duration === minutesOption
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                    ].join(" ")}
                  >
                    {minutesOption} min
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 flex gap-2 rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-blue-600" />
              <p className="text-[11px] leading-5 text-blue-950/70">
                Your request is checked again on the server before it is created and sent for company approval.
              </p>
            </div>

            {companyDescription && (
              <p className="mt-4 text-xs leading-5 text-slate-500">
                {companyDescription}
              </p>
            )}
          </aside>

          <div className="min-w-0 p-5 sm:p-7 lg:p-9">
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Available times
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                  {selectedDateLabel}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {timezone}
                </p>
              </div>
              {loading && (
                <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-500">
                  <Loader2 className="size-3.5 animate-spin" />
                  Checking calendars
                </span>
              )}
            </div>

            {error && (
              <div
                role="alert"
                className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800"
              >
                {error.replaceAll("_", " ")}
              </div>
            )}

            {!loading && slots.length === 0 ? (
              <div className="mt-6 rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                <Clock3 className="mx-auto size-7 text-slate-300" />
                <p className="mt-3 text-sm font-semibold text-slate-900">
                  {availabilityReason === "AVAILABILITY_SERVICE_ERROR"
                    ? "Availability could not be checked"
                    : availabilityReason === "NO_SCHEDULING_MEMBER"
                      ? "No scheduling-ready employee is available"
                      : "Employees are busy for this time"}
                </p>
                <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-slate-500">
                  {availabilityReason === "AVAILABILITY_SERVICE_ERROR"
                    ? "Please try another date or ask the company administrator to restore availability."
                    : "Choose another date or check back later for an available meeting time."}
                </p>
              </div>
            ) : (
              <div className="mt-6 grid max-h-[620px] grid-cols-2 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-3 xl:grid-cols-4">
                {slots.map((slot) => (
                  <button
                    key={slot.startAt}
                    type="button"
                    onClick={() => chooseSlot(slot)}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-left transition hover:-translate-y-0.5 hover:border-blue-400 hover:bg-blue-50/40 hover:shadow-sm"
                  >
                    <span className="block text-sm font-semibold text-slate-950">
                      {formatTime(slot.startAt, timezone)}
                    </span>
                    <span className="mt-1 block text-[11px] text-slate-400">
                      {duration} minutes
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Step 1</p>
                <p className="mt-1 text-xs font-semibold text-slate-800">Choose a date</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Step 2</p>
                <p className="mt-1 text-xs font-semibold text-slate-800">Pick a time</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Step 3</p>
                <p className="mt-1 text-xs font-semibold text-slate-800">Wait for approval</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {modalOpen && selected && !bookingId && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-meeting-title"
        >
          <div className="w-full max-w-lg overflow-hidden rounded-[2rem] bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5 sm:px-7">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
                  Create meeting
                </p>
                <h2 id="create-meeting-title" className="mt-1 text-xl font-semibold text-slate-950">
                  Confirm your meeting request
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="grid size-9 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-4 px-6 py-6 sm:px-7">
              <div className="rounded-2xl bg-slate-950 p-5 text-white">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-white/45">
                  Selected time
                </p>
                <p className="mt-2 text-lg font-semibold">
                  {selectedDateLabel}
                </p>
                <p className="mt-1 text-sm text-white/60">
                  {selectedTime} · {duration} minutes
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    Meeting type
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {type?.name || "Meeting"}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    Company
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {companyName}
                  </p>
                </div>
              </div>

              <div className="flex gap-2 rounded-2xl border border-blue-100 bg-blue-50 p-4">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-blue-600" />
                <p className="text-xs leading-5 text-blue-950/70">
                  After you create the request, a company employee must accept it. When accepted, your meeting link becomes available here.
                </p>
              </div>

              <button
                type="button"
                disabled={loading}
                onClick={() => void submit()}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Creating request...
                  </>
                ) : (
                  <>
                    <CalendarDays className="size-4" />
                    Create meeting request
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {bookingId && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg overflow-hidden rounded-[2rem] bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5 sm:px-7">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
                  {confirmed ? "Meeting ready" : unavailable ? "Availability update" : "Booking request"}
                </p>
                <h2 className="mt-1 text-xl font-semibold text-slate-950">
                  {confirmed
                    ? "Your meeting is ready"
                    : status === "EXPIRED"
                      ? "Request expired"
                      : status === "RETRYING"
                        ? "Employees are busy right now"
                        : "Waiting for company approval"}
                </h2>
              </div>
              {!pending && (
                <button
                  type="button"
                  onClick={resetRequest}
                  className="grid size-9 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"
                  aria-label="Close"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>

            <div className="space-y-4 px-6 py-6 sm:px-7">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold text-slate-700">{selectedDateLabel}</p>
                <p className="mt-1 text-sm text-slate-600">{selectedTime} · {duration} minutes</p>
              </div>

              {pending && (
                <>
                  <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
                    <div className="flex items-center gap-3">
                      <Loader2 className="size-5 animate-spin text-blue-600" />
                      <div>
                        <p className="text-sm font-semibold text-blue-950">
                          {status === "RETRYING"
                            ? "The selected employee is unavailable."
                            : "Waiting for an employee to accept."}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-blue-950/60">
                          {status === "RETRYING"
                            ? "That employee is busy or unavailable right now. Conventus is checking the next available company member."
                            : `The request remains active for ${minutes}:${String(seconds).padStart(2, "0")}.`}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-blue-100">
                      <div
                        className="h-full rounded-full bg-blue-600 transition-all duration-1000"
                        style={{ width: `${Math.min(100, Math.max(0, (remainingSeconds / 300) * 100))}%` }}
                      />
                    </div>
                  </div>
                </>
              )}

              {confirmed && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
                    <div>
                      <p className="text-sm font-semibold text-emerald-950">
                        Meeting confirmed and created.
                      </p>
                      <p className="mt-1 text-xs leading-5 text-emerald-900/70">
                        Your meeting details are ready.
                      </p>
                    </div>
                  </div>
                  <a
                    href={meetingUri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-4 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    <Video className="size-4" />
                    Join meeting
                  </a>
                </div>
              )}

              {status === "EXPIRED" && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  No employee accepted this request in time. The request is closed. Choose another date or time and create a new request.
                </div>
              )}

              {status === "CANCELLED" && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  This booking was cancelled. Please select a new time.
                </div>
              )}

              {!pending && !confirmed && (
                <button
                  type="button"
                  onClick={resetRequest}
                  className="w-full rounded-2xl bg-slate-950 px-5 py-3.5 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Choose another time
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
