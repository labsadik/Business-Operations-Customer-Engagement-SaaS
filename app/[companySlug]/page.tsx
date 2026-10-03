import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Command, LogIn, LogOut } from "lucide-react";
import { getMongo } from "@/lib/mongodb";
import { getSession } from "@/lib/session";
import { Company } from "@/models/company";
import { Workspace } from "@/models/workspace";
import { MeetingType } from "@/models/meeting-type";
import { Membership } from "@/models/membership";
import { getCompanyEntitlements } from "@/lib/plans-server";
import { getMeetingDurationOptions } from "@/lib/plans";
import PublicBooking from "@/components/public-booking";
import UserAvatar from "@/components/user-avatar";

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
    <main className="min-h-screen bg-[#f7f8fb] text-slate-950">
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-5 sm:px-6 lg:px-8">
          <Link href={`/${company.slug}`} className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-slate-950 text-white shadow-sm">
              <Command className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight">{company.name}</p>
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">Schedule</p>
            </div>
          </Link>

          {session ? (
            <div className="flex items-center gap-2.5">
              <div className="hidden text-right sm:block">
                <p className="text-xs font-semibold text-slate-900">{session.name}</p>
                <p className="max-w-48 truncate text-[10px] text-slate-400">{session.email}</p>
              </div>
              <UserAvatar name={session.name} email={session.email} size={38} />
              <form action="/api/auth/logout" method="post">
                <button
                  type="submit"
                  aria-label="Sign out"
                  title="Sign out"
                  className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                >
                  <LogOut className="size-4" />
                </button>
              </form>
            </div>
          ) : (
            <a
              href={`/api/auth/google/start?intent=customer&companySlug=${encodeURIComponent(company.slug)}&returnTo=%2F${encodeURIComponent(company.slug)}`}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <LogIn className="size-4" />
              Continue securely
            </a>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-6 lg:px-8 lg:py-12">
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8 lg:p-10">
          <div className="mx-auto max-w-4xl">
            <div className="mb-6 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Schedule</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{company.name}</h1>
              </div>
              <p className="hidden text-xs font-medium text-slate-400 sm:block">{workspace?.timezone || "Asia/Kolkata"}</p>
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
        </section>
      </div>
    </main>
  );
}
