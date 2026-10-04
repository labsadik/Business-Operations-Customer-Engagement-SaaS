"use client";

import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Rocket, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type PublicPlan = {
  id: string;
  name: string;
  description: string;
  status: "PUBLIC" | "COMING_SOON";
  popular: boolean;
  recommended: boolean;
  priceInr: number;
  discountType: "NONE" | "PERCENTAGE" | "FIXED_AMOUNT";
  discountValue: number;
  discountAmountInr: number;
  finalPriceInr: number;
  maxWorkspaces: number;
  maxCompanies: number;
  maxEmployees: number;
  monthlyMeetingLimit: number;
  maxMeetingDurationMinutes: number;
  maxConcurrentMeetings: number;
  validityDays: number;
  freeFeatureDays: number | null;
  requiresPayment: boolean;
};

function money(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(value);
}

export default function LandingPricingCarousel({ plans }: { plans: PublicPlan[] }) {
  const [visibleCount, setVisibleCount] = useState(1);
  const [startIndex, setStartIndex] = useState(0);
  const [selectedId, setSelectedId] = useState(plans[0]?.id ?? "");

  useEffect(() => {
    const media = window.matchMedia("(min-width: 640px)");
    const large = window.matchMedia("(min-width: 1100px)");

    const update = () => {
      setVisibleCount(large.matches ? 3 : media.matches ? 2 : 1);
    };

    const initial = window.setTimeout(update, 0);
    media.addEventListener("change", update);
    large.addEventListener("change", update);

    return () => {
      window.clearTimeout(initial);
      media.removeEventListener("change", update);
      large.removeEventListener("change", update);
    };
  }, []);

  const maxStart = Math.max(0, plans.length - visibleCount);
  const safeStartIndex = Math.min(startIndex, maxStart);

  const selected = useMemo(
    () => plans.find((plan) => plan.id === selectedId) ?? plans[0],
    [plans, selectedId]
  );

  if (!selected || plans.length === 0) return null;

  const canPrevious = safeStartIndex > 0;
  const canNext = safeStartIndex < maxStart;
  const visiblePlans = plans.slice(safeStartIndex, safeStartIndex + visibleCount);

  function move(delta: number) {
    setStartIndex((current) => Math.min(maxStart, Math.max(0, current + delta)));
  }

  const checkoutHref =
    "/login?returnTo=" +
    encodeURIComponent(
      selected.requiresPayment
        ? "/billing/checkout?plan=" + selected.id
        : "/dashboard"
    );

  return (
    <div className="mt-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Browse plans</p>
          <p className="mt-2 text-sm text-slate-600">
            Public plans are purchasable through the existing authorized billing flow. Coming-soon plans are visible but server-disabled.
          </p>
        </div>
        <div className="flex items-center gap-2" aria-label="Plan navigation">
          <button
            type="button"
            onClick={() => move(-1)}
            disabled={!canPrevious}
            aria-label="Show previous plans"
            className="grid size-11 place-items-center rounded-xl border border-slate-300 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <ArrowLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => move(1)}
            disabled={!canNext}
            aria-label="Show next plans"
            className="grid size-11 place-items-center rounded-xl border border-slate-300 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <ArrowRight className="size-4" />
          </button>
        </div>
      </div>

      <div
        className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        role="listbox"
        aria-label="Conventus plans"
        aria-activedescendant={selected.id}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            move(-1);
          } else if (event.key === "ArrowRight") {
            event.preventDefault();
            move(1);
          } else if (event.key === "Home") {
            event.preventDefault();
            setStartIndex(0);
          } else if (event.key === "End") {
            event.preventDefault();
            setStartIndex(maxStart);
          }
        }}
      >
        {visiblePlans.map((plan) => {
          const active = plan.id === selected.id;
          return (
            <button
              key={plan.id}
              id={plan.id}
              type="button"
              role="option"
              aria-selected={active}
              onClick={() => setSelectedId(plan.id)}
              className={
                "group rounded-[1.75rem] border bg-white p-6 text-left shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 " +
                (active
                  ? "border-blue-500 shadow-[0_12px_35px_rgba(37,99,235,0.12)] ring-1 ring-blue-200"
                  : "border-slate-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md")
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-600">
                      {plan.status === "COMING_SOON" ? "Coming soon" : plan.id === "free" ? "Start here" : plan.validityDays + "-day access"}
                    </p>
                    {plan.popular && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">
                        <Sparkles className="size-3" /> Popular
                      </span>
                    )}
                    {plan.recommended && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700">
                        <Rocket className="size-3" /> Recommended
                      </span>
                    )}
                  </div>
                  <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">{plan.name}</h3>
                </div>
                {active && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-blue-700">
                    <CheckCircle2 className="size-3.5" /> Selected
                  </span>
                )}
              </div>

              {plan.description && <p className="mt-3 text-xs leading-5 text-slate-500">{plan.description}</p>}

              <div className="mt-6 flex flex-wrap items-end gap-2">
                <span className="text-4xl font-semibold tracking-[-0.05em] text-slate-950">
                  {plan.finalPriceInr === 0 ? "Free" : money(plan.finalPriceInr)}
                </span>
                {plan.discountAmountInr > 0 && (
                  <span className="pb-1.5 text-xs font-semibold text-emerald-700">
                    Save {money(plan.discountAmountInr)}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {plan.priceInr > plan.finalPriceInr ? "Discounted plan price" : "Base plan price"} · {plan.validityDays}-day cycle
              </p>

              <div className="mt-6 grid gap-2.5">
                {[
                  plan.maxEmployees + " employees",
                  plan.monthlyMeetingLimit + " meetings / month",
                  plan.maxMeetingDurationMinutes + " min max meeting",
                  plan.maxConcurrentMeetings + " concurrent meetings",
                  plan.maxWorkspaces + " workspace",
                  plan.maxCompanies + " company"
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2 text-sm text-slate-700">
                    <Check className="size-4 shrink-0 text-blue-600" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-5 rounded-[1.75rem] border border-slate-200 bg-slate-950 p-5 text-white sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-300">Selected plan</p>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-white/70">
                {statusLabel(selected.status)}
              </span>
            </div>
            <h3 className="mt-2 text-xl font-semibold">{selected.name}</h3>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-white/60">
              {selected.maxEmployees} employees · {selected.monthlyMeetingLimit} meetings/month · {selected.maxMeetingDurationMinutes} minute maximum · {selected.maxConcurrentMeetings} concurrent meetings.
            </p>
          </div>
          {selected.status === "COMING_SOON" ? (
            <button
              type="button"
              disabled
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-white/45 disabled:cursor-not-allowed"
            >
              Coming soon
            </button>
          ) : (
            <Link
              href={checkoutHref as Route}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              {selected.requiresPayment ? "Continue with " + selected.name : "Start with " + selected.name}
              <ArrowRight className="size-4" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function statusLabel(status: "PUBLIC" | "COMING_SOON") {
  return status === "PUBLIC" ? "Public" : "Coming soon";
}
