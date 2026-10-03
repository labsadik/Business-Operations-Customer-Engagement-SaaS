import { notFound, redirect } from "next/navigation";
import { Command } from "lucide-react";
import { getMongo } from "@/lib/mongodb";
import { getSession } from "@/lib/session";
import { Company } from "@/models/company";
import { Workspace } from "@/models/workspace";
import { MeetingType } from "@/models/meeting-type";
import { Membership } from "@/models/membership";
import { getCompanyEntitlements } from "@/lib/plans-server";
import { getMeetingDurationOptions } from "@/lib/plans";
import PublicBooking from "@/components/public-booking";

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

  const session = await getSession();

  if (session) {
    const membership = await Membership.findOne({
      companyId: company._id,
      userId: session.userId,
      active: true
    }).lean();

    if (membership) redirect("/dashboard");
  }

  const [meetingTypes, workspace, plan] = await Promise.all([
    MeetingType.find({
      companyId: company._id,
      active: true
    }).lean(),
    Workspace.findOne({
      companyId: company._id,
      active: true
    }).select("timezone").lean(),
    getCompanyEntitlements(String(company._id))
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
    <main className="min-h-screen bg-slate-950">
      <header className="border-b border-white/10 bg-slate-950">
        <div className="mx-auto flex h-16 max-w-7xl items-center px-5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 text-white">
            <span className="grid size-9 place-items-center rounded-xl bg-white text-slate-950">
              <Command className="size-4" />
            </span>
            <span className="text-base font-semibold tracking-tight">{company.name}</span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
        <div className="mb-8 max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">
            Schedule a meeting
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Find a time that works for you.
          </h1>
          <p className="mt-3 text-sm leading-6 text-white/55">
            Choose a date and an available time. Your request is reviewed by the company team before the Google Meet is created.
          </p>
        </div>

        <PublicBooking
          companySlug={company.slug}
          types={types}
          access={session ? "customer" : "anonymous"}
          timezone={workspace?.timezone || "Asia/Kolkata"}
          companyName={company.name}
          companyDescription={company.description || ""}
        />
      </div>
    </main>
  );
}
