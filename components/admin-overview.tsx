"use client";

import Link from "next/link";
import type { Route } from "next";
import {
  Activity,
  BadgeIndianRupee,
  Building2,
  CalendarCheck2,
  ClipboardList,
  CreditCard,
  HardDrive,
  ShieldCheck,
  UsersRound
} from "lucide-react";
import type { AdminVaultUsageItem, AdminVaultUsageTotals } from "@/lib/admin-vault-usage";

function money(minor: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(minor / 100);
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let amount = value;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }
  return `${amount >= 100 || index === 0 ? amount.toFixed(0) : amount >= 10 ? amount.toFixed(1) : amount.toFixed(2)} ${units[index]}`;
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
    totalTasks: number;
    activeTasks: number;
    overdueTasks: number;
    activeMeetings: number;
    totalPayments: number;
    totalRevenue: number;
    planMix: Record<string, number>;
    vaultUsage: { totals: AdminVaultUsageTotals; items: AdminVaultUsageItem[] };
  };
}) {
  const cards = [
    { label: "Total companies", value: data.totalCompanies, icon: Building2, detail: `${data.paidCompanies} companies have captured payments` },
    { label: "Total revenue", value: money(data.totalRevenue), icon: BadgeIndianRupee, detail: `${data.totalPayments} captured payments` },
    { label: "Active subscriptions", value: data.activeSubscriptions, icon: CreditCard, detail: `${data.planMix.free ?? 0} Free · ${data.planMix.starter ?? 0} Starter · ${data.planMix.elite ?? 0} Elite · ${data.planMix.pro ?? 0} Pro · ${data.planMix.plus ?? 0} Plus` },
    { label: "Meeting users", value: data.totalMeetingUsers, icon: UsersRound, detail: "Unique public customers who submitted booking requests" },
    { label: "Meetings happened", value: data.completedMeetings, icon: CalendarCheck2, detail: `${data.totalMeetings} total meetings recorded` },
    { label: "Total tasks", value: data.totalTasks, icon: ClipboardList, detail: `${data.activeTasks} active · ${data.overdueTasks} overdue across all companies` },
    { label: "Live / active meetings", value: data.activeMeetings, icon: Activity, detail: `${data.activeCompanies} public booking pages live` }
  ];
  const vault = data.vaultUsage;
  const vaultPercent = vault.totals.quotaBytes > 0
    ? Math.min(100, (vault.totals.usedBytes / vault.totals.quotaBytes) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-slate-200 bg-slate-950 p-6 text-white shadow-sm sm:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-300">Control center</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Platform overview</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">
              Monitor company growth, subscriptions, revenue, team capacity, meetings, and company vault storage from one place.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-white/45">Companies</p>
              <p className="mt-1 text-lg font-semibold">{data.totalCompanies.toLocaleString("en-IN")}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-white/45">Employees</p>
              <p className="mt-1 text-lg font-semibold">{data.totalEmployees.toLocaleString("en-IN")}</p>
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

      <section className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-600">Company Vault</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">Platform storage overview</h2>
            <p className="mt-1 text-sm leading-5 text-slate-500">Server-calculated usage across every company, including active upload reservations.</p>
          </div>
          <Link href={"/admin/vault-usage" as Route} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            <HardDrive className="size-4" /> Full vault breakdown
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Total companies", value: vault.totals.companies.toLocaleString("en-IN"), detail: "All registered companies" },
            { label: "Vaults enabled", value: vault.totals.enabledCompanies.toLocaleString("en-IN"), detail: `${vault.totals.disabledCompanies.toLocaleString("en-IN")} without vault entitlement` },
            { label: "Storage in use", value: formatBytes(vault.totals.usedBytes), detail: `${formatBytes(vault.totals.pendingUploadBytes)} reserved by active uploads` },
            { label: "Storage quota assigned", value: formatBytes(vault.totals.quotaBytes), detail: `${formatBytes(vault.totals.availableBytes)} available across enabled vaults` }
          ].map((item) => (
            <article key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">{item.label}</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{item.value}</p>
              <p className="mt-1 text-[11px] leading-5 text-slate-500">{item.detail}</p>
            </article>
          ))}
        </div>

        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-slate-700">Aggregate storage utilization</span>
            <span className="text-slate-500">{vaultPercent.toFixed(1)}% of assigned quota</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-blue-600" style={{ width: vaultPercent + "%" }} />
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-500">
            <span>{vault.totals.fileCount.toLocaleString("en-IN")} stored files</span>
            <span>{vault.totals.usedItems.toLocaleString("en-IN")} items including active uploads</span>
            <span>{vault.totals.pendingUploadCount.toLocaleString("en-IN")} active upload reservations</span>
            {vault.totals.overQuotaCompanies > 0 && <span className="font-semibold text-rose-700">{vault.totals.overQuotaCompanies} companies over quota</span>}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <div className="border-b border-slate-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-900">Company vault directory · A–Z</h3>
            <p className="mt-1 text-[11px] text-slate-500">Alphabetical preview. Open the full breakdown for every company.</p>
          </div>
          {vault.items.length ? (
            <div className="divide-y divide-slate-100">
              {vault.items.map((item) => {
                const percent = item.quotaBytes > 0 ? Math.min(100, item.usedBytes / item.quotaBytes * 100) : 0;
                return (
                  <Link key={item.companyId} href={`/admin/companies/${item.companyId}` as Route} className="grid gap-3 px-4 py-3 transition hover:bg-slate-50 sm:grid-cols-[minmax(180px,1.1fr)_minmax(140px,.8fr)_minmax(180px,1fr)_auto] sm:items-center">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600"><Building2 className="size-4" /></span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-900">{item.companyName}</p>
                        <p className="truncate text-[10px] text-slate-500">/{item.companySlug} · {item.planName}</p>
                      </div>
                    </div>
                    <div className="text-xs">
                      <p className="font-semibold text-slate-800">{formatBytes(item.usedBytes)} <span className="font-normal text-slate-400">/ {item.vaultEnabled ? formatBytes(item.quotaBytes) : "No quota"}</span></p>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={"h-full rounded-full " + (item.quotaExceeded ? "bg-rose-500" : "bg-blue-600")} style={{ width: percent + "%" }} /></div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                      <span>{item.fileCount} files</span>
                      <span>·</span>
                      <span>{item.usedItems} items</span>
                      <span className={item.vaultEnabled ? "font-semibold text-emerald-700" : "font-semibold text-slate-500"}><ShieldCheck className="mr-1 inline size-3" />{item.vaultEnabled ? "Enabled" : "Disabled"}</span>
                    </div>
                    <span className="text-xs font-semibold text-blue-700">Company details →</span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="p-8 text-center text-sm text-slate-500">No companies have been created yet.</p>
          )}
        </div>
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
