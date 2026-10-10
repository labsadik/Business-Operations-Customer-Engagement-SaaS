"use client";

import { useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Link2,
  ShieldCheck,
  Video,
  X
} from "lucide-react";

type Stage = 0 | 1 | 2;
type RequestDecision = "pending" | "accepted" | "declined";

const stages = [
  { number: "01", label: "Customer booking" },
  { number: "02", label: "Team acceptance" },
  { number: "03", label: "Calendar & room" }
] as const;

export default function LandingWorkflowMockup() {
  const [stage, setStage] = useState<Stage>(0);
  const [decision, setDecision] = useState<RequestDecision>("pending");
  const [selectedTime, setSelectedTime] = useState("11:30 AM");

  function acceptRequest() {
    setDecision("accepted");
  }

  function declineRequest() {
    setDecision("declined");
  }

  return (
    <div className="relative mx-auto w-full max-w-[620px]">
      <div className="pointer-events-none absolute -inset-5 rounded-[2.5rem] bg-blue-100/60 blur-2xl" />
      <div className="relative overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.13)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-600/20">
              <CalendarDays className="size-[18px]" />
            </span>
            <div>
              <p className="text-xs font-bold tracking-tight text-slate-950">Conventus workflow</p>
              <p className="mt-0.5 text-[10px] text-slate-500">Illustrative enterprise workspace</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-800">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Live workflow demo
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 border-b border-slate-100 px-3 py-3 sm:px-5">
          {stages.map((item, index) => (
            <button
              key={item.number}
              type="button"
              onClick={() => setStage(index as Stage)}
              aria-pressed={stage === index}
              className={
                "min-w-0 rounded-xl border px-2 py-2.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:px-3 " +
                (stage === index
                  ? "border-blue-200 bg-blue-50"
                  : "border-transparent bg-white hover:border-slate-200 hover:bg-slate-50")
              }
            >
              <span className={"text-[10px] font-bold tracking-[0.14em] " + (stage === index ? "text-blue-700" : "text-slate-400")}>
                STEP {item.number}
              </span>
              <span className="mt-1 block text-[11px] font-semibold leading-4 text-slate-800 sm:text-xs">{item.label}</span>
            </button>
          ))}
        </div>

        <div className="p-4 sm:p-5">
          {stage === 0 && (
            <div className="animate-in fade-in duration-200">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[10px] font-semibold text-slate-500">
                    <ShieldCheck className="size-3.5 text-emerald-600" />
                    VERIFIED CLIENT BOOKING
                  </div>
                  <h2 className="mt-2 text-lg font-semibold tracking-tight text-slate-950 sm:text-xl">Meridian Health</h2>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                    <Link2 className="size-3.5" />
                    meridian.conventus.com
                  </p>
                </div>
                <span className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[10px] font-semibold text-slate-600">Client portal</span>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-700">Choose a meeting</p>
                    <h3 className="mt-1.5 text-sm font-semibold leading-5 text-slate-950">Product Architecture Review</h3>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500"><Clock3 className="size-3.5" />30 minutes · Virtual Meeting</p>
                  </div>
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700">
                    <Video className="size-5" />
                  </span>
                </div>

                <div className="mt-5 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-800">Thursday, October 15</p>
                  <p className="text-[10px] text-slate-500">Times shown in your timezone</p>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {["10:00 AM", "11:30 AM", "02:00 PM"].map((time) => (
                    <button
                      type="button"
                      key={time}
                      aria-pressed={selectedTime === time}
                      onClick={() => setSelectedTime(time)}
                      className={
                        "rounded-xl border px-2 py-3 text-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 " +
                        (selectedTime === time
                          ? "border-blue-600 bg-blue-600 text-white ring-2 ring-blue-200 ring-offset-2"
                          : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50")
                      }
                    >
                      <span className="block text-xs font-semibold">{time}</span>
                      {selectedTime === time && <span className="mt-1 block text-[9px] font-medium text-blue-100">Selected</span>}
                    </button>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
                  <span className="text-[11px] text-slate-600">Next available with an eligible specialist</span>
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                </div>
              </div>

              <button
                type="button"
                onClick={() => setStage(1)}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                Send booking request <ArrowRight className="size-4" />
              </button>
            </div>
          )}

          {stage === 1 && (
            <div className="animate-in fade-in duration-200">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-700">Team routing & acceptance</p>
                  <h2 className="mt-1.5 text-lg font-semibold tracking-tight text-slate-950">One request. The right owner.</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Only active, eligible teammates receive requests.</p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[10px] font-semibold text-blue-800">
                  <span className="size-1.5 rounded-full bg-blue-600" /> Routing complete
                </span>
              </div>

              <div className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-blue-100 bg-white text-blue-700">
                  <CalendarDays className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-950">Client request received</p>
                  <p className="mt-1 text-[11px] text-slate-500">Meridian Health · Oct 15 at {selectedTime}</p>
                </div>
                <Check className="size-4 shrink-0 text-emerald-600" />
              </div>

              <div className="flex items-center justify-center py-2.5 text-blue-600"><ArrowDown className="size-5" /></div>

              <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-violet-100 text-sm font-bold text-violet-800">SJ</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-blue-700">Assigned team member</p>
                    <p className="mt-1 text-sm font-semibold text-slate-950">Sarah Jenkins</p>
                    <p className="mt-0.5 text-xs text-slate-600">Solutions Architect · Active</p>
                  </div>
                  <span className={"shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold " + (decision === "accepted" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800")}>
                    {decision === "pending" ? "Awaiting response" : decision === "accepted" ? "Confirmed" : "Declined"}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 rounded-xl border border-white bg-white p-3.5 sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] text-slate-500">Client</p>
                    <p className="mt-1 text-xs font-semibold text-slate-900">Morgan Ellis · Meridian Health</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500">Requested topic</p>
                    <p className="mt-1 text-xs font-semibold text-slate-900">Product Architecture Review</p>
                  </div>
                </div>

                {decision === "declined" ? (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                    Request declined in this demo. The time is not locked, and another eligible teammate can be considered.
                  </div>
                ) : decision === "accepted" ? (
                  <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">
                    <CheckCircle2 className="size-4" /> Accepted — meeting is confirmed.
                  </div>
                ) : (
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={acceptRequest}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                    >
                      <Check className="size-3.5" /> Accept
                    </button>
                    <button
                      type="button"
                      onClick={declineRequest}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                    >
                      <X className="size-3.5" /> Decline
                    </button>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setStage(2)}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                View calendar & room step <ChevronRight className="size-4" />
              </button>
            </div>
          )}

          {stage === 2 && (
            <div className="animate-in fade-in duration-200">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700">Calendar & meeting room</p>
                  <h2 className="mt-1.5 text-lg font-semibold tracking-tight text-slate-950">Everything is ready to meet.</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Shown after explicit employee acceptance.</p>
                </div>
                <span className={"inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10px] font-semibold " + (decision === "declined" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800")}>
                  {decision === "declined" ? <Clock3 className="size-3.5" /> : <CheckCircle2 className="size-3.5" />}
                  {decision === "declined" ? "Demo: not accepted" : decision === "accepted" ? "Confirmed" : "Example confirmation"}
                </span>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Video className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-950">Product Architecture Review</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">Thursday, October 15 · {selectedTime} · 30 minutes</p>
                    <p className="mt-1 text-xs text-slate-500">Sarah Jenkins with Morgan Ellis</p>
                  </div>
                </div>
                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-800">Meeting room link generated</p>
                  <p className="mt-1.5 break-all font-mono text-[11px] leading-5 text-emerald-950">conventus.com/room/abc-defg-hij</p>
                  <p className="mt-2 text-[11px] leading-5 text-emerald-800">A private room link is attached to the confirmed meeting.</p>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center gap-2"><CalendarDays className="size-4 text-blue-700" /><p className="text-xs font-semibold text-slate-900">Client calendar</p></div>
                    <p className="mt-2 text-[11px] leading-5 text-slate-500">Event invitation sent with the meeting details.</p>
                    <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700"><CheckCircle2 className="size-3.5" /> Time reserved</span>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center gap-2"><CalendarDays className="size-4 text-violet-700" /><p className="text-xs font-semibold text-slate-900">Team calendar</p></div>
                    <p className="mt-2 text-[11px] leading-5 text-slate-500">Accepted meeting blocks Sarah’s availability.</p>
                    <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700"><CheckCircle2 className="size-3.5" /> Time reserved</span>
                  </div>
                </div>
              </div>

              {decision === "declined" && (
                <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                  This is a preview of the final step. In a real workflow, room and calendar creation follow acceptance only.
                </p>
              )}

              <button
                type="button"
                onClick={() => setStage(0)}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                Explore booking step again <ArrowRight className="size-4" />
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/80 px-4 py-3 text-[10px] text-slate-500 sm:px-5">
          <span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-3.5 text-emerald-600" /> Acceptance-gated scheduling</span>
          <span>Illustrative data · Not a live booking</span>
        </div>
      </div>
    </div>
  );
}
