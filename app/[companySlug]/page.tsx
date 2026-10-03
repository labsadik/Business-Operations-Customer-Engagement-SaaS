import { notFound } from "next/navigation";
import { CalendarDays, CheckCircle2, Clock3, Command, ShieldCheck } from "lucide-react";
import { getMongo } from "@/lib/mongodb";
import { getSession } from "@/lib/session";
import { Company } from "@/models/company";
import { MeetingType } from "@/models/meeting-type";
import PublicBooking from "@/components/public-booking";

export const dynamic = "force-dynamic";

export default async function CompanyPublicPage({ params }: { params: Promise<{ companySlug: string }> }) {
  const { companySlug } = await params;
  await getMongo();

  const company = await Company.findOne({ slug: companySlug.toLowerCase(), publicBookingEnabled: true }).lean();
  if (!company) notFound();

  const meetingTypes = await MeetingType.find({ companyId: company._id, active: true }).lean();
  const session = await getSession();

  const types = meetingTypes.map((type) => ({
    id: String(type._id),
    name: type.name,
    description: type.description ?? "",
    durationOptionsMinutes: type.durationOptionsMinutes
  }));

  return (
    <main className="min-h-screen bg-[#f7f8fb]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5 sm:px-6">
          <div className="flex items-center gap-2 font-semibold text-slate-950">
            <span className="grid size-8 place-items-center rounded-xl bg-slate-950 text-white"><Command className="size-4" /></span>
            Conventus
          </div>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">Book with {company.name}</span>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5 py-10 sm:px-6 lg:py-14">
        <div className="grid gap-6 lg:grid-cols-[0.72fr_1.28fr]">
          <section>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Public booking</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">{company.name}</h1>
            <p className="mt-4 text-base leading-7 text-slate-600">{company.description || "Choose a suitable time and Conventus will route your request to an available employee."}</p>

            <div className="mt-8 space-y-3">
              {[
                [CalendarDays, "Choose a time", "Availability combines company rules with connected Google Calendar free/busy data."],
                [Clock3, "Request a duration", "The company's current plan determines the maximum meeting duration."],
                [CheckCircle2, "Wait for acceptance", "Your request remains active for five minutes and retries automatically when needed."]
              ].map(([Icon, title, text]) => {
                const I = Icon as typeof Clock3;
                return <div key={title as string} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="grid size-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><I className="size-4" /></div><div><p className="text-sm font-semibold text-slate-950">{title as string}</p><p className="mt-1 text-xs leading-5 text-slate-500">{text as string}</p></div></div>;
              })}
            </div>

            <div className="mt-8 rounded-2xl border border-blue-100 bg-blue-50/60 p-4"><div className="flex gap-3"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-blue-600" /><p className="text-xs leading-5 text-blue-900/70">Customer login is isolated to this company's shared page. Company and employee authentication stays on the main Conventus application.</p></div></div>
          </section>

          <PublicBooking companySlug={company.slug} types={types} authenticated={Boolean(session)} />
        </div>
      </div>
    </main>
  );
}
