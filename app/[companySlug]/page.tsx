import Link from "next/link";
import { CalendarDays, CheckCircle2, Clock3, Command, ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CompanyPublicPage({ params }: { params: Promise<{ companySlug: string }> }) {
  const { companySlug } = await params;

  return (
    <main className="min-h-screen bg-[#f7f8fb]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-5 sm:px-6">
          <div className="flex items-center gap-2 font-semibold text-slate-950">
            <span className="grid size-8 place-items-center rounded-xl bg-slate-950 text-white"><Command className="size-4" /></span>
            Conventus
          </div>
          <span className="text-xs font-medium text-slate-400">Public booking</span>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-5 py-10 sm:px-6 lg:py-14">
        <div className="grid gap-6 lg:grid-cols-[0.76fr_1.24fr]">
          <section>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Company</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">{companySlug}</h1>
            <p className="mt-4 text-sm leading-6 text-slate-600">Choose a time that works for you. Conventus will request an available employee and keep this page updated in real time.</p>
            <div className="mt-8 space-y-3">
              {[
                [CalendarDays, "Pick a date and time", "Availability comes from the company schedule and connected Google calendars."],
                [Clock3, "Choose duration", "The company plan controls the maximum meeting duration."],
                [CheckCircle2, "Wait for acceptance", "The request remains active for five minutes before retrying or expiring."]
              ].map(([Icon, title, text]) => {
                const I = Icon as typeof Clock3;
                return <div key={title as string} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4"><div className="grid size-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><I className="size-4" /></div><div><p className="text-sm font-semibold text-slate-950">{title as string}</p><p className="mt-1 text-xs leading-5 text-slate-500">{text as string}</p></div></div>;
              })}
            </div>
          </section>

          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-slate-950">Book a meeting</p><p className="mt-1 text-xs text-slate-500">The scheduling engine will populate live slots here.</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">Secure</span></div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 p-4"><p className="text-xs text-slate-500">Date</p><p className="mt-2 text-sm font-semibold text-slate-900">Choose a date</p></div>
              <div className="rounded-2xl border border-slate-200 p-4"><p className="text-xs text-slate-500">Duration</p><p className="mt-2 text-sm font-semibold text-slate-900">Choose duration</p></div>
            </div>
            <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5"><p className="text-sm font-semibold text-slate-900">Customer sign-in</p><p className="mt-1 text-xs leading-5 text-slate-500">Customers sign in here with Google before submitting the booking request. Company and employee sign-in stays on the main site.</p></div>
            <button disabled className="mt-6 w-full rounded-2xl bg-slate-950 px-5 py-3.5 text-sm font-semibold text-white opacity-60">Continue with Google — coming in Phase 2</button>
            <div className="mt-4 flex gap-2 text-[11px] leading-5 text-slate-500"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-blue-600" />Only identity permissions are needed for the customer booking flow.</div>
          </section>
        </div>
      </div>
    </main>
  );
}