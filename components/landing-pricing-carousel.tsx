"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, CheckCircle2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { PlanEntitlements } from "@/lib/plans";

function money(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(value);
}

export default function LandingPricingCarousel({
  plans
}: {
  plans: PlanEntitlements[];
}) {
  const [visibleCount, setVisibleCount] = useState(1);
  const [startIndex, setStartIndex] = useState(0);
  const [selectedId, setSelectedId] = useState(plans[1]?.id ?? plans[0]?.id ?? "");

  useEffect(() => {
    const media = window.matchMedia("(min-width: 640px)");
    const large = window.matchMedia("(min-width: 1100px)");

    const update = () => {
      setVisibleCount(large.matches ? 3 : media.matches ? 2 : 1);
    };

    update();
    media.addEventListener("change", update);
    large.addEventListener("change", update);
    return () => {
      media.removeEventListener("change", update);
      large.removeEventListener("change", update);
    };
  }, []);

  useEffect(() => {
    const maxStart = Math.max(0, plans.length - visibleCount);
    setStartIndex((current) => Math.min(current, maxStart));
  }, [plans.length, visibleCount]);

  const selected = useMemo(
    () => plans.find((plan) => plan.id === selectedId) ?? plans[0],
    [plans, selectedId]
  );

  if (!selected || plans.length === 0) return null;

  const maxStart = Math.max(0, plans.length - visibleCount);
  const canPrevious = startIndex > 0;
  const canNext = startIndex < maxStart;
  const visiblePlans = plans.slice(startIndex, startIndex + visibleCount);
  const checkoutHref = selected.requiresPayment
    ? "/login?returnTo=" + encodeURIComponent("/billing/checkout?plan=" + selected.id)
    : "/login";

  function move(delta: number) {
    setStartIndex((current) => Math.min(maxStart, Math.max(0, current + delta)));
  }

  return (
    <div className="mt-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Browse plans</p>
          <p className="mt-2 text-sm text-slate-600">
            Select a plan to see its limits. No plan is marked as recommended because the current configuration does not define one.
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
                "group text-left rounded-[1.75rem] border bg-white p-6 shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 " +
                (active
                  ? "border-blue-500 shadow-[0_12px_35px_rgba(37,99,235,0.12)] ring-1 ring-blue-200"
                  : "border-slate-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md")
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-600">
                    {plan.id === "free" ? "Start here" : "30-day access"}
                  </p>
                  <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">{plan.name}</h3>
                </div>
                {active && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-blue-700">
                    <CheckCircle2 className="size-3.5" />
                    Selected
                  </span>
                )}
              </div>

              <div className="mt-6 flex items-end gap-2">
                <span className="text-4xl font-semibold tracking-[-0.05em] text-slate-950">
                  {plan.priceInr === 0 ? "Free" : money(plan.priceInr)}
                </span>
                <span className="pb-1.5 text-xs text-slate-500">
                  {plan.priceInr === 0 ? "per 30-day cycle" : "per 30-day cycle"}
                </span>
              </div>

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
                {selected.validityDays}-day validity
              </span>
            </div>
            <h3 className="mt-2 text-xl font-semibold">{selected.name}</h3>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-white/60">
              {selected.maxEmployees} employees · {selected.monthlyMeetingLimit} meetings/month · {selected.maxMeetingDurationMinutes} minute maximum · {selected.maxConcurrentMeetings} concurrent meetings.
            </p>
          </div>
          <Link
            href={checkoutHref}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            {selected.requiresPayment ? "Continue with " + selected.name : "Start with " + selected.name}
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
