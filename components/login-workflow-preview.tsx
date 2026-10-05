import { useEffect, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Route,
  UserCheck,
  Video
} from "lucide-react";

type WorkflowStage = {
  key: "request" | "routing" | "accepted" | "confirmed";
  shortLabel: string;
  title: string;
  status: string;
};

const stages: WorkflowStage[] = [
  {
    key: "request",
    shortLabel: "Request",
    title: "Customer request",
    status: "Sample request"
  },
  {
    key: "routing",
    shortLabel: "Routing",
    title: "Routing",
    status: "Matching request"
  },
  {
    key: "accepted",
    shortLabel: "Accepted",
    title: "Employee accepted",
    status: "Request accepted"
  },
  {
    key: "confirmed",
    shortLabel: "Confirmed",
    title: "Meeting confirmed",
    status: "Confirmed meeting"
  }
];

function StageIcon({ stage }: { stage: WorkflowStage["key"] }) {
  const className = "size-3.5";

  switch (stage) {
    case "request":
      return <CalendarDays className={className} aria-hidden="true" />;
    case "routing":
      return <Route className={className} aria-hidden="true" />;
    case "accepted":
      return <UserCheck className={className} aria-hidden="true" />;
    case "confirmed":
      return <Video className={className} aria-hidden="true" />;
  }
}

function StageContent({ stage }: { stage: WorkflowStage["key"] }) {
  switch (stage) {
    case "request":
      return (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
              <p className="text-[9px] font-medium uppercase tracking-[0.12em] text-slate-400">
                Meeting type
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-900">
                Product consultation
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
              <p className="text-[9px] font-medium uppercase tracking-[0.12em] text-slate-400">
                Selected time
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-900">
                Tue · 10:30 AM
              </p>
            </div>
          </div>
          <div className="mt-2.5 flex items-center justify-between rounded-lg border border-blue-100 bg-blue-50/70 px-2.5 py-2">
            <span className="text-[11px] font-medium text-blue-950">30 min</span>
            <span className="text-[10px] text-blue-700">Customer request</span>
          </div>
        </>
      );
    case "routing":
      return (
        <div className="space-y-2.5">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
            <div className="flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-lg border border-amber-200 bg-amber-50 text-amber-700">
                <Route className="size-3.5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-semibold text-slate-900">
                  Match to an eligible team member
                </p>
                <p className="mt-0.5 text-[10px] leading-4 text-slate-500">
                  Availability and scheduling rules are checked.
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-2 text-[10px] text-slate-600">
            <Clock3 className="size-3.5 text-slate-400" aria-hidden="true" />
            <span>Request time is kept unchanged.</span>
          </div>
        </div>
      );
    case "accepted":
      return (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 p-3">
          <div className="flex items-start gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-emerald-200 bg-white text-emerald-700">
              <CheckCircle2 className="size-4" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-semibold text-emerald-950">
                Employee accepted the request
              </p>
              <p className="mt-1 text-[10px] leading-4 text-emerald-800">
                The request is assigned and meeting creation can proceed.
              </p>
            </div>
          </div>
        </div>
      );
    case "confirmed":
      return (
        <div className="space-y-2">
          <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 p-2.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[9px] font-medium uppercase tracking-[0.12em] text-emerald-700">
                  Confirmed meeting
                </p>
                <p className="mt-1 text-xs font-semibold text-emerald-950">
                  Tue · 10:30 AM–11:00 AM
                </p>
              </div>
              <Video className="size-4 shrink-0 text-emerald-700" aria-hidden="true" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-600">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
              Google Meet
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
              Calendar event
            </div>
          </div>
        </div>
      );
  }
}

export default function LoginWorkflowPreview() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotionPreference = () => setReducedMotion(mediaQuery.matches);

    syncMotionPreference();
    mediaQuery.addEventListener("change", syncMotionPreference);

    return () => mediaQuery.removeEventListener("change", syncMotionPreference);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;

    let transitionTimeout: number | undefined;

    const cycle = () => {
      setTransitioning(true);
      transitionTimeout = window.setTimeout(() => {
        setActiveIndex((current) => (current + 1) % stages.length);
        setTransitioning(false);
        transitionTimeout = window.setTimeout(cycle, 1820);
      }, 180);
    };

    const initialTimeout = window.setTimeout(cycle, 2000);

    return () => {
      window.clearTimeout(initialTimeout);
      if (transitionTimeout !== undefined) {
        window.clearTimeout(transitionTimeout);
      }
    };
  }, [reducedMotion]);

  const stage = stages[activeIndex];

  return (
    <section
      aria-labelledby="workflow-heading"
      className="login-workflow-preview w-full max-w-[520px]"
    >
      <div className="mb-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-700">
            How scheduling works
          </p>
          <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[9px] font-medium text-slate-400">
            Illustrative preview
          </span>
        </div>
        <h2
          id="workflow-heading"
          className="mt-1 text-xl font-semibold leading-tight tracking-[-0.03em] text-slate-950 sm:text-2xl"
        >
          From request to confirmed meeting.
        </h2>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-[0_18px_45px_rgba(15,23,42,0.07)] sm:p-3">
        <div className="flex min-h-[186px] flex-col rounded-xl border border-slate-100 bg-slate-50/70 p-3 sm:min-h-[212px] sm:p-3.5">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-slate-950 text-white">
                <StageIcon stage={stage.key} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Conventus · Meeting request
                </p>
                <p className="truncate text-xs font-semibold text-slate-950">
                  {stage.status}
                </p>
              </div>
            </div>
            <span className="shrink-0 text-[9px] font-medium text-slate-400">
              {String(activeIndex + 1).padStart(2, "0")} / 04
            </span>
          </div>

          <div
            aria-live="off"
            className={`flex flex-1 items-center pt-3 transition-[transform,opacity] duration-[180ms] ease-out motion-reduce:transition-none ${transitioning ? "opacity-0 [transform:perspective(900px)_rotateY(10deg)_translateX(8px)_scale(0.985)]" : "opacity-100 [transform:perspective(900px)_rotateY(0deg)_translateX(0)_scale(1)]"}`}
          >
            <div className="w-full">
              <div className="mb-2.5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                    Stage
                  </p>
                  <p className="text-sm font-semibold tracking-[-0.02em] text-slate-950">
                    {stage.title}
                  </p>
                </div>
                <span
                  aria-hidden="true"
                  className="grid size-7 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500"
                >
                  <StageIcon stage={stage.key} />
                </span>
              </div>
              <StageContent stage={stage.key} />
            </div>
          </div>
        </div>

        <div
          className="mt-2.5 flex items-center gap-2 px-1"
          aria-label="Workflow stages"
        >
          {stages.map((item, index) => (
            <div key={item.key} className="flex min-w-0 flex-1 items-center gap-1.5">
              <span
                aria-hidden="true"
                className={`h-1 flex-1 rounded-full transition-all duration-200 ${index === activeIndex ? "bg-slate-700" : "bg-slate-200"}`}
              />
              <span
                className={index === activeIndex ? "text-[9px] font-semibold text-slate-700" : "text-[9px] text-slate-400"}
              >
                {item.shortLabel}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
