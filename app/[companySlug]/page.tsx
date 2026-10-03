import { notFound } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { getMongo } from "@/lib/mongodb";
import { Announcement } from "@/models/announcement";
import { getSession } from "@/lib/session";
import { Company } from "@/models/company";
import { Workspace } from "@/models/workspace";
import { MeetingType } from "@/models/meeting-type";
import { getCompanyEntitlements } from "@/lib/plans-server";
import { getMeetingDurationOptions } from "@/lib/plans";
import PublicBooking from "@/components/public-booking";
import PublicBookingHeader from "@/components/public-booking-header";

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

  const [meetingTypes, workspace, plan, announcement] = await Promise.all([
    MeetingType.find({
      companyId: company._id,
      active: true
    }).lean(),
    Workspace.findOne({
      companyId: company._id,
      active: true
    }).select("timezone").lean(),
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
    <main className="min-h-screen bg-[#f7f8fb] text-slate-950">
      <PublicBookingHeader
        companyName={company.name}
        companySlug={company.slug}
        name={session?.role === "CUSTOMER" ? session.name : undefined}
        email={session?.role === "CUSTOMER" ? session.email : undefined}
        authenticated={session?.role === "CUSTOMER"}
      />

      {announcement && (
        <div className="border-b border-blue-100 bg-blue-50/70">
          <div className="mx-auto flex max-w-7xl items-start gap-3 px-4 py-3.5 sm:px-6 lg:px-8">
            <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-blue-600 text-white">
              <CalendarDays className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">{announcement.title}</p>
              <p className="mt-1 text-sm leading-6 text-blue-950">{announcement.message}</p>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">Book a meeting</p>
            <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight text-slate-950">{company.name}</h1>
          </div>
          <span className="hidden rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-medium text-slate-500 shadow-sm sm:inline-flex">
            {workspace?.timezone || "Asia/Kolkata"}
          </span>
        </div>

        <PublicBooking
          companySlug={company.slug}
          types={types}
          access={session?.role === "CUSTOMER" ? "customer" : "anonymous"}
          timezone={workspace?.timezone || "Asia/Kolkata"}
          companyName={company.name}
          companyDescription={company.description ?? ""}
        />
      </div>
    </main>
  );
}
