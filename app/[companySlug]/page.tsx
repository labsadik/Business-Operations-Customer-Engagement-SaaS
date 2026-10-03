import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, CalendarDays, CheckCircle2, Clock3, Command, LogIn, LogOut, ShieldCheck } from "lucide-react";
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

  const features = [
    [CalendarDays, "Choose a time", "Pick the date and duration that fits your schedule."],
    [Clock3, "Send a request", "The company team reviews the request inside their workspace."],
    [CheckCircle2, "Join when ready", "Once accepted, your meeting link appears immediately."]
  ] as const;

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
          <div className="grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
            <div className="max-w-xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-[11px] font-semibold text-blue-700">
                <span className="size-1.5 rounded-full bg-blue-600" />
                Public scheduling
              </div>

              <h1 className="mt-5 text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">
                Schedule time with {company.name}.
              </h1>
              <p className="mt-5 text-base leading-7 text-slate-600">
                Choose a suitable date and duration. Your request is routed to the company team and the confirmed meeting link becomes available in the same flow.
              </p>

              <div className="mt-8 grid gap-3">
                {features.map(([Icon, title, description]) => (
                  <div key={title} className="flex gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-blue-600 shadow-sm ring-1 ring-slate-200">
                      <Icon className="size-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{title}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 size-5 shrink-0 text-blue-600" />
                  <div>
                    <p className="text-sm font-semibold">Secure company access</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Requests are linked to your account and checked again on the server before anything is created.
                    </p>
                  </div>
                </div>
              </div>

              <Link
                href={`/${company.slug}/login`}
                className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-900"
              >
                Employee access
                <ArrowRight className="size-3.5" />
              </Link>
            </div>

            <div className="min-w-0">
              <PublicBooking
                companySlug={company.slug}
                types={types}
                access={session?.role === "CUSTOMER" ? "customer" : "anonymous"}
                timezone={workspace?.timezone || "Asia/Kolkata"}
                companyName={company.name}
                companyDescription={company.description || ""}
              />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
