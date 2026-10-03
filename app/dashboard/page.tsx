import Link from "next/link";
import { CalendarDays, Command, ExternalLink, Settings2, UsersRound, Video } from "lucide-react";

export const metadata = { title: "Workspace" };

const cards = [
  ["Bookings", "Requests, acceptance timers, retries and confirmed meetings.", "/book/demo"],
  ["Employees", "Availability, Google connection status and assignment readiness.", "#"],
  ["Meetings", "Company-scoped meeting routes and history.", "/meet/demo"],
  ["Settings", "Workspace, branding, integrations and subscription.", "#"]
] as const;

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-[#f7f8fb]">
      <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-6 lg:px-8"><Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-slate-950"><span className="grid size-8 place-items-center rounded-xl bg-slate-950 text-white"><Command className="size-4" /></span>Conventus</Link><span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">Phase 1 foundation</span></div></header>
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between"><div><p className="text-sm font-semibold text-blue-600">Workspace</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Operate customer meetings from one place.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Authentication, persistence and live scheduling are being layered into the application phase by phase.</p></div><Link href="/book/demo" className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white">Preview public page <ExternalLink className="size-4" /></Link></div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map(([title, text, href]) => <Link key={title} href={href} className="group rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="flex items-center justify-between"><div className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-700">{title === "Bookings" ? <CalendarDays className="size-5" /> : title === "Employees" ? <UsersRound className="size-5" /> : title === "Meetings" ? <Video className="size-5" /> : <Settings2 className="size-5" />}</div><ExternalLink className="size-4 text-slate-300 transition group-hover:text-slate-500" /></div><h2 className="mt-5 text-base font-semibold text-slate-950">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{text}</p></Link>)}
        </div>
      </div>
    </main>
  );
}