import { notFound } from "next/navigation";
import { CalendarDays, CheckCircle2, Clock3, Command, ShieldCheck, UsersRound } from "lucide-react";
import Link from "next/link";
import { getMongo } from "@/lib/mongodb";
import { getSession } from "@/lib/session";
import { Company } from "@/models/company";
import { Workspace } from "@/models/workspace";
import { MeetingType } from "@/models/meeting-type";
import { Membership } from "@/models/membership";
import { User } from "@/models/user";
import { getCompanyEntitlements } from "@/lib/plans-server";
import { getMeetingDurationOptions } from "@/lib/plans";
import PublicBooking from "@/components/public-booking";

export const dynamic = "force-dynamic";

export default async function CompanyPublicPage({ params }: { params: Promise<{ companySlug: string }> }) {
  const { companySlug } = await params;
  await getMongo();

  const company = await Company.findOne({ slug: companySlug.toLowerCase(), publicBookingEnabled: true }).lean();
  if (!company) notFound();

  const meetingTypes = await MeetingType.find({ companyId: company._id, active: true }).lean();
  const workspace = await Workspace.findOne({ companyId: company._id, active: true }).select("timezone").lean();
  const plan = await getCompanyEntitlements(String(company._id));
  const session = await getSession();

  let access: "anonymous" | "company-member" | "customer" = "anonymous";
  let sessionName = "";

  if (session) {
    const membership = await Membership.findOne({
      companyId: company._id,
      userId: session.userId,
      active: true
    }).lean();

    access = membership ? "company-member" : "customer";
    sessionName = session.name;
  }

  const teamMembers = await Membership.find({
    companyId: company._id,
    active: true,
    role: { $in: ["COMPANY_OWNER", "COMPANY_ADMIN", "EMPLOYEE"] }
  }).select("userId role").lean();

  const teamUsers = await User.find({ _id: { $in: teamMembers.map((member) => member.userId) } })
    .select("name")
    .sort({ name: 1 })
    .lean();
  const teamMap = new Map(teamUsers.map((user) => [String(user._id), user]));

  const team = teamMembers.map((member) => {
    const user = teamMap.get(String(member.userId));
    return user ? { name: user.name, role: member.role } : null;
  }).filter((item): item is { name: string; role: string } => Boolean(item));

  const types = meetingTypes.map((type) => ({
    id: String(type._id),
    name: type.name,
    description: type.description ?? "",
    durationOptionsMinutes: getMeetingDurationOptions(plan.maxMeetingDurationMinutes, type.durationOptionsMinutes)
  }));

  return (
    <main className="min-h-screen bg-[#f7f8fb]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-5 sm:px-6">
          <div className="flex items-center gap-2 font-semibold text-slate-950">
            <span className="grid size-8 place-items-center rounded-xl bg-slate-950 text-white"><Command className="size-4" /></span>
            Conventus
          </div>
          <Link href={`/${company.slug}/login`} className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            Employee sign in
          </Link>
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

            <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <UsersRound className="size-4 text-blue-600" />
                <p className="text-sm font-semibold text-slate-950">Company employees</p>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">Employee login is restricted to the Google email addresses added by this company.</p>
              <div className="mt-4 max-h-60 space-y-2 overflow-auto pr-1">
                {team.map((member) => (
                  <div key={member.name + member.role} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <p className="truncate text-xs font-semibold text-slate-900">{member.name}</p>
                    <p className="truncate text-[11px] text-slate-500">{member.role.replaceAll("_", " ")}</p>
                  </div>
                ))}
                {team.length === 0 && <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">No employees have been added yet.</p>}
              </div>
              <Link href={`/${company.slug}/login`} className="mt-4 inline-flex text-xs font-semibold text-blue-700">Open company login →</Link>
            </section>

            <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
              <div className="flex gap-3">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-blue-600" />
                <p className="text-xs leading-5 text-blue-900/70">
                  Company members are routed to their company dashboard. Google accounts that are not members continue as customers and can use this public page for meeting requests.
                </p>
              </div>
            </div>
          </section>

          <PublicBooking
            companyId={String(company._id)}
            companySlug={company.slug}
            types={types}
            access={access}
            sessionName={sessionName}
            employeeLoginUrl={`/${company.slug}/login`}
            timezone={workspace?.timezone || "Asia/Kolkata"}
          />
        </div>
      </div>
    </main>
  );
}
