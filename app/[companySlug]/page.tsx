import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, CalendarDays, CheckCircle2, Clock3, LockKeyhole } from "lucide-react";
import { getMongo } from "@/lib/mongodb";
import { Announcement } from "@/models/announcement";
import { getSession } from "@/lib/session";
import CookieSettingsButton from "@/components/cookie-settings-button";
import { Company } from "@/models/company";
import { Workspace } from "@/models/workspace";
import { MeetingType } from "@/models/meeting-type";
import { getCompanyEntitlements } from "@/lib/plans-server";
import { getMeetingDurationOptions } from "@/lib/plans";
import PublicBooking from "@/components/public-booking";
import CompanyAnnouncementBar from "@/components/company-announcement-bar";
import PublicFeedbackEntry from "@/components/public-feedback-entry";
import PublicBookingHeader from "@/components/public-booking-header";
import { isDevelopmentOnlyUrl } from "@/lib/public-origin";

export const dynamic = "force-dynamic";

export default async function CompanyPublicPage({
  params
}: {
  params: Promise<{ companySlug: string }>;
}) {
  const { companySlug } = await params;
  await getMongo();

  const company = await Company.findOne({
    slug: companySlug.toLowerCase(),
    publicBookingEnabled: true
  }).lean();

  if (!company) notFound();

  const displayLogoUrl =
    company.logoUrl && !isDevelopmentOnlyUrl(company.logoUrl)
      ? company.logoUrl
      : "";

  const session = await getSession();

  const workspace = await Workspace.findOne({
    companyId: company._id,
    active: true
  })
    .select("_id timezone")
    .lean();

  if (!workspace) notFound();

  const [meetingTypes, plan, announcement] = await Promise.all([
    MeetingType.find({
      companyId: company._id,
      workspaceId: workspace._id,
      active: true
    }).lean(),
    getCompanyEntitlements(String(company._id)),
    Announcement.findOne({
      companyId: company._id,
      active: true
    }).sort({ createdAt: -1 }).select("title message createdAt").lean()
  ]);

  const types = meetingTypes.map((type) => ({
    id: String(type._id),
    name: type.name,
    description: type.description ?? "",
    durationOptionsMinutes: getMeetingDurationOptions(
      plan.maxMeetingDurationMinutes,
      type.durationOptionsMinutes
    )
  }));

  return (
    <main className="min-h-screen bg-[#faf9f1] text-slate-950">
      <PublicBookingHeader
        companyName={company.name}
        companySlug={company.slug}
        logoUrl={displayLogoUrl}
        name={session?.role === "CUSTOMER" ? session.name : undefined}
        email={session?.role === "CUSTOMER" ? session.email : undefined}
        image={session?.role === "CUSTOMER" ? session.image : undefined}
        authenticated={session?.role === "CUSTOMER"}
      />

      <div className="mx-auto max-w-7xl px-4 pb-6 pt-5 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">
        {announcement ? (
          <CompanyAnnouncementBar
            title={announcement.title}
            message={announcement.message}
          />
        ) : null}

        <section className="relative overflow-hidden rounded-[2rem] border border-blue-100 bg-white p-6 shadow-sm sm:p-8 lg:p-10">
          <div className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full bg-[#fbf4c9]/70 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-20 size-56 rounded-full bg-blue-50 blur-3xl" />
          <div className="relative grid gap-8 lg:items-end">
            <div className="max-w-3xl">
              <div className="flex items-start gap-4">
                <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl border border-blue-100 bg-blue-50 text-blue-700 shadow-sm sm:size-16">
                  {displayLogoUrl ? (
                    // Company-provided logo URLs are not constrained to the Next image allowlist.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={displayLogoUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <Building2 className="size-6 sm:size-7" aria-hidden="true" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">Book time with {company.name}</p>
                  <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-4xl lg:text-5xl">
                    A clear path to the right conversation.
                  </h1>
                  <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                    {company.description || `Choose a meeting type, select a time that works for you, and send a request to ${company.name}.`}
                  </p>
                </div>
              </div>
              <div className="mt-7 grid gap-2 sm:grid-cols-4">
                {[
                  ["01", "Pick a date", CalendarDays],
                  ["02", "Choose meeting", CheckCircle2],
                  ["03", "Select a time", Clock3],
                  ["04", "Confirm request", LockKeyhole]
                ].map(([number, label, Icon]) => {
                  const StepIcon = Icon as typeof CalendarDays;
                  return (
                    <div key={number as string} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-3.5 py-3">
                      <span className="text-[10px] font-semibold tracking-[0.14em] text-blue-600">{number as string}</span>
                      <StepIcon className="size-4 text-slate-500" aria-hidden="true" />
                      <span className="text-xs font-semibold text-slate-700">{label as string}</span>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        </section>

        <section className="mt-5" aria-labelledby="booking-experience-title">
          <div className="mb-3 flex flex-col gap-3 px-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-600">Availability</p>
              <h2 id="booking-experience-title" className="mt-1 text-lg font-semibold tracking-tight text-slate-950">Choose a time that works.</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-medium text-slate-500 shadow-sm">
                {workspace?.timezone || "Asia/Kolkata"}
              </span>
              <PublicFeedbackEntry
                companySlug={company.slug}
                authenticated={session?.role === "CUSTOMER"}
              />
            </div>
          </div>

          <PublicBooking
            companySlug={company.slug}
            types={types}
            access={session?.role === "CUSTOMER" ? "customer" : "anonymous"}
            timezone={workspace?.timezone || "Asia/Kolkata"}
            companyName={company.name}
            companyDescription={company.description ?? ""}
          />
        </section>

        <footer className="mt-8 flex flex-col gap-4 border-t border-slate-200 px-1 pt-5 text-[10px] leading-5 text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p>Secure scheduling for {company.name}.</p>
            <p className="mt-1">Powered by <span className="font-semibold text-slate-600">Conventus</span> · company-specific booking</p>
          </div>
          <nav aria-label="Company booking legal links" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
            <Link href="/terms" className="rounded-md py-1 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Terms</Link>
            <Link href="/privacy" className="rounded-md py-1 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Privacy</Link>
            <Link href={`/${company.slug}/login`} className="rounded-md py-1 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Team sign in</Link>
            <CookieSettingsButton className="py-1" aria-label="Open cookie settings">Cookie settings</CookieSettingsButton>
          </nav>
        </footer>
      </div>

    </main>
  );
}