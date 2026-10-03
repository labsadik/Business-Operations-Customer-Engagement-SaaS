"use client";

import {
  Activity,
  BadgeIndianRupee,
  Building2,
  CalendarCheck2,
  CreditCard,
  UsersRound
} from "lucide-react";

function money(minor: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(minor / 100);
}

export default function AdminOverview({
  data
}: {
  data: {
    totalCompanies: number;
    activeCompanies: number;
    paidCompanies: number;
    activeSubscriptions: number;
    totalEmployees: number;
    totalMeetingUsers: number;
    totalMeetings: number;
    completedMeetings: number;
    activeMeetings: number;
    totalPayments: number;
    totalRevenue: number;
    planMix: Record<string, number>;
  };
}) {
  const cards = [
    { label: "Total companies", value: data.totalCompanies, icon: Building2, detail: `${data.paidCompanies} companies have captured payments` },
    { label: "Total revenue", value: money(data.totalRevenue), icon: BadgeIndianRupee, detail: `${data.totalPayments} captured payments` },
    { label: "Active subscriptions", value: data.activeSubscriptions, icon: CreditCard, detail: `${data.planMix.free ?? 0} Free · ${data.planMix.starter ?? 0} Starter · ${data.planMix.elite ?? 0} Elite · ${data.planMix.pro ?? 0} Pro · ${data.planMix.plus ?? 0} Plus` },
    { label: "Meeting users", value: data.totalMeetingUsers, icon: UsersRound, detail: "Unique public customers who submitted booking requests" },
    { label: "Meetings happened", value: data.completedMeetings, icon: CalendarCheck2, detail: `${data.totalMeetings} total meetings recorded` },
    { label: "Live / active meetings", value: data.activeMeetings, icon: Activity, detail: `${data.activeCompanies} public booking pages live` }
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-slate-200 bg-slate-950 p-6 text-white shadow-sm sm:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-300">Control center</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Platform overview</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">
              One place to monitor companies, subscription revenue, team capacity, customer scheduling activity, and meetings.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-white/45">Companies</p>
              <p className="mt-1 text-lg font-semibold">{data.totalCompanies}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-white/45">Employees</p>
              <p className="mt-1 text-lg font-semibold">{data.totalEmployees}</p>
            </div>
            <div className="col-span-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 sm:col-span-1">
              <p className="text-[10px] uppercase tracking-[0.14em] text-white/45">Revenue</p>
              <p className="mt-1 text-lg font-semibold">{money(data.totalRevenue)}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <article key={card.label} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-700">
                  <Icon className="size-5" />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Live data</span>
              </div>
              <p className="mt-5 text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">{card.label}</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight">{card.value}</p>
              <p className="mt-2 text-xs leading-5 text-slate-500">{card.detail}</p>
            </article>
          );
        })}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.15fr_.85fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Platform coverage</p>
              <h2 className="mt-2 text-base font-semibold">Operational footprint</h2>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-semibold text-emerald-700">Production data</span>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              ["Public pages", data.activeCompanies, data.totalCompanies],
              ["Employees", data.totalEmployees, null],
              ["Completed meetings", data.completedMeetings, data.totalMeetings]
            ].map(([label, value, total]) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs text-slate-500">{label as string}</p>
                <p className="mt-2 text-2xl font-semibold">{value as number}</p>
                {total !== null && <p className="mt-1 text-[11px] text-slate-400">of {total as number} total</p>}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Plans</p>
              <h2 className="mt-2 text-base font-semibold">Current subscription split</h2>
            </div>
          </div>
          <div className="mt-6 space-y-4">
            {[
              ["Free", data.planMix.free ?? 0],
              ["Starter", data.planMix.starter ?? 0],
              ["Elite", data.planMix.elite ?? 0],
              ["Pro", data.planMix.pro ?? 0],
              ["Plus", data.planMix.plus ?? 0]
            ].map(([label, value]) => (
              <div key={label}>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700">{label}</span>
                  <span className="text-slate-500">{value as number}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-blue-600"
                    style={{ width: `${data.totalCompanies ? Math.min(100, ((value as number) / data.totalCompanies) * 100) : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
