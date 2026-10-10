"use client";

import Link from "next/link";
import type { Route } from "next";
import { useMemo, useState } from "react";
import { ArrowUpRight, Building2, HardDrive, Search } from "lucide-react";
import type { AdminCompanyListItem } from "@/lib/admin";

function dateLabel(value: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(value));
}

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

export default function AdminCompanies({ companies }: { companies: AdminCompanyListItem[] }) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return companies;
    return companies.filter((company) =>
      [company.name, company.slug, company.email, company.phone, company.planName]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [companies, query]);

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-600">Companies</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Company directory</h1>
          <p className="mt-2 text-sm text-slate-500">Every company, sorted A–Z, with plan, billing, scheduling, and live vault storage details.</p>
        </div>
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-3 size-4 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search company, slug, email..."
            className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-3 text-sm outline-none focus:border-blue-500"
          />
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <p className="text-xs font-semibold text-slate-900">{visible.length} companies shown</p>
          <p className="mt-1 text-[11px] text-slate-500">All matching companies are loaded A–Z. Vault usage includes stored bytes and active upload reservations.</p>
        </div>
        <div className="hidden overflow-x-auto lg:block">
          <table className="min-w-[1450px] w-full text-left">
            <thead className="bg-slate-50">
              <tr className="border-b border-slate-200">
                {["Company", "Plan", "Company vault", "Employees", "Meetings", "Meeting users", "Tasks", "Payments", "Renewal", ""].map((item) => (
                  <th key={item} className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">{item}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((company) => (
                <tr key={company.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/70">
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <span className="grid size-10 place-items-center rounded-xl bg-slate-950 text-white"><Building2 className="size-4" /></span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{company.name}</p>
                        <p className="truncate text-[11px] text-slate-500">/{company.slug} · {company.email || "No billing email"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700">{company.planName}</span>
                    <p className="mt-1 text-[10px] text-slate-400">{company.monthlyMeetingsUsed}/{company.planLimit || "—"} used</p>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-start gap-2">
                      <HardDrive className={"mt-0.5 size-4 shrink-0 " + (company.vaultUsage?.vaultEnabled ? "text-emerald-600" : "text-slate-400")} />
                      <div>
                        <p className="text-xs font-semibold text-slate-800">{formatBytes(company.vaultUsage?.usedBytes ?? 0)} <span className="font-normal text-slate-400">/ {company.vaultUsage?.vaultEnabled ? formatBytes(company.vaultUsage.quotaBytes) : "No quota"}</span></p>
                        <p className="mt-1 text-[10px] text-slate-500">{company.vaultUsage?.fileCount ?? 0} files · {company.vaultUsage?.usedItems ?? 0} items</p>
                        <p className={"mt-1 text-[10px] font-semibold " + (company.vaultUsage?.vaultEnabled ? "text-emerald-700" : "text-slate-400")}>{company.vaultUsage?.vaultEnabled ? company.vaultUsage.planName + " · enabled" : "Vault disabled"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm font-semibold">{company.employees}</td>
                  <td className="px-4 py-4"><p className="text-sm font-semibold">{company.totalMeetings}</p><p className="text-[10px] text-slate-400">{company.completedMeetings} completed</p></td>
                  <td className="px-4 py-4 text-sm font-semibold">{company.meetingUsers}</td>
                  <td className="px-4 py-4"><p className="text-sm font-semibold">{company.totalTasks}</p><p className="text-[10px] text-slate-400">{company.activeTasks} active · {company.completedTasks} done</p></td>
                  <td className="px-4 py-4"><p className="text-sm font-semibold">{money(company.totalPayments)}</p><p className="text-[10px] text-slate-400">{company.paymentCount} captured</p></td>
                  <td className="px-4 py-4"><p className="text-xs font-semibold">{dateLabel(company.periodEnd)}</p><p className="mt-1 text-[10px] text-slate-400">{company.publicBookingEnabled ? "Public live" : "Draft"}</p></td>
                  <td className="px-4 py-4 text-right"><Link href={`/admin/companies/${company.id}` as Route} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Open <ArrowUpRight className="size-3.5" /></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-slate-100 lg:hidden">
          {visible.map((company) => (
            <Link key={company.id} href={`/admin/companies/${company.id}` as Route} className="block p-4 hover:bg-slate-50">
              <div className="flex items-start gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-slate-950 text-white"><Building2 className="size-4" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-semibold">{company.name}</p>
                    <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700">{company.planName}</span>
                  </div>
                  <p className="mt-1 truncate text-[11px] text-slate-500">{company.email || company.slug}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
                    <span><b>{company.employees}</b> employees</span>
                    <span><b>{company.totalMeetings}</b> meetings</span>
                    <span><b>{company.totalTasks}</b> tasks · {company.activeTasks} active</span>
                    <span><b>{money(company.totalPayments)}</b> paid</span>
                    <span><b>{formatBytes(company.vaultUsage?.usedBytes ?? 0)}</b> vault used</span>
                    <span><b>{company.vaultUsage?.fileCount ?? 0}</b> stored files · {company.vaultUsage?.pendingUploadCount ?? 0} uploading</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {!visible.length && <div className="p-12 text-center text-sm text-slate-500">No companies match the search.</div>}
      </section>
    </div>
  );
}
