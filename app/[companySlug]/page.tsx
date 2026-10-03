import { notFound, redirect } from "next/navigation";
import { getMongo } from "@/lib/mongodb";
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
    <main className="min-h-screen bg-[#f7f8fb] text-slate-950">
      <PublicBookingHeader
        companyName={company.name}
        companySlug={company.slug}
        name={session?.role === "CUSTOMER" ? session.name : undefined}
        email={session?.role === "CUSTOMER" ? session.email : undefined}
        authenticated={session?.role === "CUSTOMER"}
      />

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
          companyDescription=""
        />
      </div>
    </main>
  );
}
