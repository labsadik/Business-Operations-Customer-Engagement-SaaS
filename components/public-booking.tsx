"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  LogIn,
  ShieldCheck,
  Video,
  X
} from "lucide-react";
import { getTodayIso, zonedDateTimeToUtc } from "@/lib/timezone";
import { playMeetingSound, unlockMeetingSound } from "@/lib/client-meeting-sound";
import GoogleIntegrationNotice from "@/components/google-integration-notice";

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
  | "NO_GOOGLE_SCHEDULING_MEMBER"
  | "NO_CONFIGURED_SCHEDULE"
  | "GOOGLE_CALENDAR_ERROR"
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
  const [duration, setDuration] = useState(type?.durationOptionsMinutes[0] ?? 0);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selected, setSelected] = useState<Slot | null>(null);
  const [loading, setLoading] = useState(
    access === "customer" &&
    Boolean(types[0]?.id) &&
    (types[0]?.durationOptionsMinutes.length ?? 0) > 0
  );
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
  const bookingDialogCloseRef = useRef<HTMLButtonElement | null>(null);
  const statusDialogCloseRef = useRef<HTMLButtonElement | null>(null);
  const availabilityAbortRef = useRef<AbortController | null>(null);
  const availabilityRequestRef = useRef(0);
  const availabilityInFlightRef = useRef(false);
  const availabilityPollingDisabledRef = useRef(false);

  const calendarDays = useMemo(() => buildCalendarDays(calendarMonth), [calendarMonth]);

  const cancelAvailability = useCallback(() => {
    availabilityRequestRef.current += 1;
    availabilityAbortRef.current?.abort();
    availabilityAbortRef.current = null;
    availabilityInFlightRef.current = false;
  }, []);

  const availabilityErrorMessage = useCallback((code: string) => {
    switch (code) {
      case "INVALID_DURATION":
        return "That duration is no longer available for this meeting type. Choose one of the current duration options.";
      case "MEETING_DURATION_NOT_CONFIGURED":
        return "This meeting type has no supported duration configured right now.";
      case "DATE_IN_PAST":
        return "Choose today or a future date.";
      case "INVALID_DATE":
        return "Choose a valid calendar date.";
      case "NO_CONFIGURED_SCHEDULE":
        return "There is no working schedule configured for this date.";
      case "GOOGLE_CALENDAR_ERROR":
        return "Google Calendar availability could not be checked. Please try another date.";
      case "CUSTOMER_LOGIN_REQUIRED":
        return "Sign in with Google to see live availability.";
      default:
        return "Availability could not be checked. Please try again.";
    }
  }, []);

  const bookingErrorMessage = useCallback((code: string) => {
    switch (code) {
      case "INVALID_DURATION":
        return "This meeting duration is no longer valid. Choose a current duration option and try again.";
      case "MEETING_DURATION_NOT_CONFIGURED":
        return "This meeting type has no supported duration configured right now.";
      case "BOOKING_TIME_IN_PAST":
        return "That time has already passed. Choose another available time.";
      case "INVALID_TIME_RANGE":
        return "That time is no longer available. Please choose another slot.";
      case "NO_EMPLOYEE_AVAILABLE":
        return "No eligible employee is available for that slot anymore. Choose another time.";
      case "CONCURRENT_MEETING_LIMIT":
        return "The company's meeting capacity is full for that time. Choose another slot.";
      case "MONTHLY_MEETING_LIMIT":
        return "This company has reached its current meeting limit.";
      case "FREE_FEATURE_DAYS_EXHAUSTED":
        return "This company's free scheduling period has ended.";
      default:
        return "The meeting request could not be created. Please try another slot.";
    }
  }, []);

  const loadAvailability = useCallback(
    async (silent = false) => {
      if (
        !typeId ||
        access !== "customer" ||
        !date ||
        duration <= 0 ||
        !(type?.durationOptionsMinutes ?? []).includes(duration)
      ) {
        return;
      }

      if (silent && availabilityPollingDisabledRef.current) return;
      if (availabilityInFlightRef.current) return;

      availabilityInFlightRef.current = true;
      const requestId = ++availabilityRequestRef.current;
      const controller = new AbortController();
      availabilityAbortRef.current = controller;

      if (!silent) setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/api/public/${encodeURIComponent(companySlug)}/availability?date=${date}&meetingTypeId=${typeId}&duration=${duration}`,
          {
            cache: "no-store",
            headers: { "Cache-Control": "no-cache" },
            signal: controller.signal
          }
        );

        const body = await response.json();
        if (!response.ok) {
          const code = String(body.error || "AVAILABILITY_FAILED");
          if (
            code === "INVALID_DURATION" ||
            code === "MEETING_DURATION_NOT_CONFIGURED" ||
            code === "MEETING_TYPE_NOT_FOUND" ||
            code === "WORKSPACE_NOT_FOUND" ||
            code === "COMPANY_NOT_FOUND" ||
            code === "CUSTOMER_LOGIN_REQUIRED"
          ) {
            availabilityPollingDisabledRef.current = true;
          }
          throw new Error(code);
        }

        if (requestId !== availabilityRequestRef.current) return;

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
        if (controller.signal.aborted || requestId !== availabilityRequestRef.current) {
          return;
        }

        const code = err instanceof Error ? err.message : "AVAILABILITY_FAILED";
        setSlots([]);
        setSelected(null);
        setAvailabilityReason(null);
        setError(availabilityErrorMessage(code));
      } finally {
        if (requestId === availabilityRequestRef.current) {
          availabilityInFlightRef.current = false;
          availabilityAbortRef.current = null;
          if (!silent) setLoading(false);
        }
      }
    },
    [
      access,
      availabilityErrorMessage,
      companySlug,
      date,
      duration,
      type,
      typeId
    ]
  );

  useEffect(() => {
    if (
      !typeId ||
      access !== "customer" ||
      duration <= 0 ||
      !(type?.durationOptionsMinutes ?? []).includes(duration) ||
      modalOpen ||
      Boolean(bookingId)
    ) {
      return () => cancelAvailability();
    }

    availabilityPollingDisabledRef.current = false;

    const initial = window.setTimeout(() => {
      void loadAvailability();
    }, 0);

    const interval = window.setInterval(() => {
      void loadAvailability(true);
    }, 15000);

    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      cancelAvailability();
    };
  }, [
    access,
    cancelAvailability,
    bookingId,
    duration,
    loadAvailability,
    modalOpen,
    type,
    typeId
  ]);

  const resetRequest = useCallback(() => {
    setBookingId("");
    setStatus("");
    setMeetingUri("");
    setExpiresAt("");
    setRemainingSeconds(0);
    setModalOpen(false);
    setSelected(null);
    setError("");
    availabilityPollingDisabledRef.current = false;
    void loadAvailability(true);
  }, [loadAvailability]);

  useEffect(() => {
    if (!modalOpen && !bookingId) return;

    const statusIsBlockingClose =
      Boolean(
        bookingId &&
        !meetingUri &&
        !["EXPIRED", "CANCELLED"].includes(status)
      );

    const timer = window.setTimeout(() => {
      (bookingId ? statusDialogCloseRef.current : bookingDialogCloseRef.current)?.focus();
    }, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (bookingId) {
        if (!statusIsBlockingClose) resetRequest();
      } else {
        setModalOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [bookingId, meetingUri, modalOpen, resetRequest, status]);

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
        const acceptedStatus = ["ASSIGNED", "CREATING_MEETING", "CONFIRMED"].includes(
          nextStatus
        );
        const previousAcceptedStatus = [
          "ASSIGNED",
          "CREATING_MEETING",
          "CONFIRMED"
        ].includes(previousStatus);

        // Play the acceptance sound as soon as the employee accepts the request.
        // Do not wait for Google Meet creation to finish.
        if (acceptedStatus && previousStatus && !previousAcceptedStatus) {
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
    cancelAvailability();
    availabilityPollingDisabledRef.current = false;
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
      const code = err instanceof Error ? err.message : "BOOKING_FAILED";
      setError(bookingErrorMessage(code));
    } finally {
      setLoading(false);
    }
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
      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl shadow-slate-200/40">
        <div className="grid lg:grid-cols-[420px_minmax(0,1fr)]">
          <aside className="border-b border-slate-200 bg-[#faf9f1] p-5 sm:p-7 lg:border-b-0 lg:border-r">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  <span className="text-blue-600">01</span>
                  <span>Choose date</span>
                  <span>•</span>
                  <span className="text-blue-600">02</span>
                  <span>Meeting</span>
                  <span>•</span>
                  <span className="text-blue-600">03</span>
                  <span>Confirm</span>
                </div>
                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Create meeting</p>
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
                      aria-current={today ? "date" : undefined}
                      aria-pressed={selectedDay}
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
                    aria-pressed={item.id === typeId}
                    onClick={() => {
                      cancelAvailability();
                      availabilityPollingDisabledRef.current = false;
                      setTypeId(item.id);
                      setDuration(item.durationOptionsMinutes[0] ?? 0);
                      setSelected(null);
                    }}
                    className={[
                      "w-full rounded-2xl border p-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2",
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

            {companyDescription && (
              <div className="mt-4 rounded-2xl border border-blue-100 bg-white p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-600">About {companyName}</p>
                <p className="mt-2 text-xs leading-5 text-slate-600">{companyDescription}</p>
              </div>
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
                className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs leading-5 text-red-800"
              >
                {error.replaceAll("_", " ")}
              </div>
            )}

            {access === "anonymous" ? (
              <div className="mt-6 grid min-h-[480px] place-items-center rounded-3xl border border-slate-200 bg-slate-50 p-8 text-center">
                <div className="max-w-sm">
                  <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-white text-slate-950 shadow-sm ring-1 ring-slate-200">
                    <LogIn className="size-5" />
                  </div>
                  <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Customer access</p>
                  <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Sign in to see available times</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">Your Google account identifies the customer attached to the request. Sign-in is required before Conventus reveals live availability or accepts a booking request.</p>
                  <div className="mt-5 text-left">
                    <GoogleIntegrationNotice mode="customer" />
                  </div>
                  <a
                    href={loginUrl}
                    className="mt-7 inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-6 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
                  >
                    <LogIn className="size-4" />
                    Continue with Google
                  </a>
                </div>
              </div>
            ) : loading ? (
              <div className="mt-6 grid max-h-[620px] grid-cols-2 gap-2.5 overflow-hidden sm:grid-cols-3 xl:grid-cols-4" aria-label="Loading availability">
                {Array.from({ length: 16 }, (_, index) => (
                  <div key={index} className="h-[72px] animate-pulse rounded-2xl border border-slate-200 bg-slate-50">
                    <div className="mx-4 mt-4 h-3 w-16 rounded bg-slate-200" />
                    <div className="mx-4 mt-3 h-2 w-20 rounded bg-slate-100" />
                  </div>
                ))}
              </div>
            ) : slots.length === 0 ? (
              <div className="mt-6 rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                <Clock3 className="mx-auto size-7 text-slate-300" />
                <p className="mt-3 text-sm font-semibold text-slate-900">
                  {availabilityReason === "NO_ACTIVE_MEMBERS"
                    ? "This company has no active scheduling members"
                    : availabilityReason === "NO_GOOGLE_SCHEDULING_MEMBER"
                      ? "No employee is ready for Google scheduling"
                      : availabilityReason === "NO_CONFIGURED_SCHEDULE"
                        ? "No working hours are configured for this date"
                        : availabilityReason === "GOOGLE_CALENDAR_ERROR"
                          ? "Google Calendar availability could not be checked"
                          : availabilityReason === "AVAILABILITY_SERVICE_ERROR"
                            ? "Availability could not be checked"
                            : "No eligible employee is available for this time"}
                </p>
                <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-slate-500">
                  {availabilityReason === "NO_ACTIVE_MEMBERS"
                    ? "Please ask the company administrator to add or activate a scheduling member."
                    : availabilityReason === "NO_GOOGLE_SCHEDULING_MEMBER"
                      ? "A company employee must connect the required Google Calendar permissions before live availability can be shown."
                      : availabilityReason === "NO_CONFIGURED_SCHEDULE"
                        ? "Choose another date or ask the company administrator to configure working hours."
                        : availabilityReason === "GOOGLE_CALENDAR_ERROR"
                          ? "Please try another date. The company may need to reconnect Google Calendar."
                          : availabilityReason === "AVAILABILITY_SERVICE_ERROR"
                            ? "Please try another date or try again later."
                            : "Choose another date or time. Calendar and existing booking constraints are checked before a request is accepted."}
                </p>
              </div>
            ) : (
              <div className="mt-6 grid max-h-[620px] grid-cols-2 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-3 xl:grid-cols-4">
                {slots.map((slot) => (
                  <button
                    key={slot.startAt}
                    type="button"
                    aria-label="Select available time"
                    aria-pressed={selected?.startAt === slot.startAt}
                    onClick={() => chooseSlot(slot)}
                    className={[
                      "rounded-2xl border px-4 py-3.5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2",
                      selected?.startAt === slot.startAt
                        ? "border-blue-600 bg-blue-50 shadow-sm"
                        : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-blue-400 hover:bg-blue-50/40 hover:shadow-sm"
                    ].join(" ")}
                  >
                    <span className="block text-sm font-semibold text-slate-950">
                      {formatTime(slot.startAt, timezone)}
                    </span>

                  </button>
                ))}
              </div>
            )}

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
                ref={bookingDialogCloseRef}
                type="button"
                onClick={() => setModalOpen(false)}
                className="grid size-9 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                aria-label="Close meeting request confirmation"
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
                  {selectedTime}
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
                  ref={statusDialogCloseRef}
                  type="button"
                  onClick={resetRequest}
                  className="grid size-9 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                  aria-label="Close booking status"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>

            <div className="space-y-4 px-6 py-6 sm:px-7">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold text-slate-700">{selectedDateLabel}</p>
                <p className="mt-1 text-sm text-slate-600">{selectedTime}</p>
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
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                  <p className="font-semibold">Request expired</p>
                  <p className="mt-1 leading-6">No employee accepted this request in time. The request is closed. Choose another date or time and create a new request.</p>
                </div>
              )}

              {status === "CANCELLED" && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                  <p className="font-semibold">Booking cancelled</p>
                  <p className="mt-1 leading-6">This booking was cancelled. Please select a new time.</p>
                </div>
              )}

              {!pending && !confirmed && (
                <button
                  type="button"
                  onClick={resetRequest}
                  className="w-full rounded-2xl bg-blue-600 px-5 py-3.5 text-sm font-semibold text-white hover:bg-blue-700"
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
