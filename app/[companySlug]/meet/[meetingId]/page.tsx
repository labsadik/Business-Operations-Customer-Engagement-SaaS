import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Command, ExternalLink, ShieldCheck, Video } from "lucide-react";
import { getMongo } from "@/lib/mongodb";
import { getSession } from "@/lib/session";
import { Company } from "@/models/company";
import { Meeting } from "@/models/meeting";
import { Membership } from "@/models/membership";
import { verifyMeetingAccessToken } from "@/lib/security";
import GoogleMeetEmbed from "@/components/google-meet-embed";

export const dynamic = "force-dynamic";
export const metadata = {
  robots: {
    index: false,
    follow: false
  }
};

function extractGoogleMeetCode(uri: string | null) {
  if (!uri) return null;
  try {
    const url = new URL(uri);
    if (url.hostname !== "meet.google.com") return null;
    const code = url.pathname.replace(/^\/+/, "").split("/")[0];
    return code || null;
  } catch {
    return null;
  }
}

export default async function CompanyMeetingPage({ params }: { params: Promise<{ companySlug: string; meetingId: string }> }) {
  const { companySlug, meetingId: meetingToken } = await params;
  const session = await getSession();
  if (!session) {
    redirect(
      `/login?error=signin_required&returnTo=/${encodeURIComponent(companySlug)}/meet/${encodeURIComponent(meetingToken)}`
    );
  }

  let meetingId: string;
  try {
    ({ meetingId } = verifyMeetingAccessToken(meetingToken));
  } catch {
    notFound();
  }

  await getMongo();
  const company = await Company.findOne({ slug: companySlug.toLowerCase() }).lean();
  if (!company) notFound();

  const meeting = await Meeting.findOne({ _id: meetingId, companyId: company._id }).lean();
  if (!meeting) notFound();

  let activeMembership = null;
  if (session.companyId === String(company._id) && session.role !== "PLATFORM_ADMIN") {
    activeMembership = await Membership.findOne({
      companyId: company._id,
      userId: session.userId,
      active: true
    }).lean();
  }

  const isCustomer = String(meeting.customerId) === session.userId;
  const isActiveEmployee = String(meeting.employeeId) === session.userId && Boolean(activeMembership);
  const isCompanyManager =
    session.role === "PLATFORM_ADMIN" ||
    (Boolean(activeMembership) && ["COMPANY_OWNER", "COMPANY_ADMIN"].includes(activeMembership.role));

  if (!isCustomer && !isActiveEmployee && !isCompanyManager) {
    redirect(`/${company.slug}?error=meeting_access_denied`);
  }

  const duration = Math.max(1, Math.round((meeting.endAt.getTime() - meeting.startAt.getTime()) / 60000));
  const meetingUri = meeting.googleMeetingUri ?? null;
  const googleMeetCode = extractGoogleMeetCode(meetingUri);
  const meetingIsActive = ["READY", "LIVE"].includes(meeting.status);

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-white/10 bg-slate-950/95">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-6 lg:px-8">
          <Link href={`/${company.slug}`} className="flex items-center gap-2 font-semibold">
            <span className="grid size-8 place-items-center rounded-xl bg-white text-slate-950"><Command className="size-4" /></span>
            Conventus
          </Link>
          <div className="flex items-center gap-3 text-xs text-white/50">
            <span>{company.name}</span>
            {googleMeetCode && (
              <span className="rounded-full border border-white/10 px-3 py-1">
                Google Meet · {googleMeetCode}
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-5 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-sm font-semibold text-blue-300">Meet with your client</p><h1 className="mt-1 text-xl font-semibold">{company.name}</h1></div>
          <div className="text-xs text-white/50">{meeting.startAt.toLocaleString()} · {duration} minutes</div>
        </div>

        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-black shadow-2xl">
          {meetingUri && meetingIsActive ? (
            <GoogleMeetEmbed
              meetingCode={googleMeetCode ?? ""}
              meetingUri={meetingUri}
            />
          ) : (
            <div className="grid min-h-[68vh] place-items-center p-8 text-center">
              <div className="max-w-md">
                <Video className="mx-auto size-12 text-blue-300" />
                <h2 className="mt-5 text-2xl font-semibold">
                  {meetingIsActive ? "Meeting is being created" : "This meeting has ended"}
                </h2>
                <p className="mt-3 text-sm leading-6 text-white/55">
                  {meetingIsActive
                    ? "Conventus has the booking and Calendar event. Google is still generating the Meet entry point. Refresh this page after a moment; the booking remains company-scoped and protected."
                    : "The Conventus meeting flow is closed. This booking cannot be joined or reused. Create a new booking for another meeting."}
                </p>
                <p className="mt-4 text-xs text-white/35">
                  {meetingIsActive ? "Secure participant link required to access this meeting." : "Meeting access has been revoked."}
                </p>
              </div>
            </div>
          )}
        </section>

        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-blue-300" /><div><p className="text-sm font-semibold">Company-scoped meeting</p><p className="mt-1 text-xs leading-5 text-white/50">This route is authorized against the stored company, booking, customer, and employee records before the meeting surface is exposed.</p></div></div></div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><p className="text-xs uppercase tracking-[0.18em] text-white/35">Meeting details</p><div className="mt-4 space-y-3">{googleMeetCode && <div><p className="text-[11px] text-white/35">Google Meet code</p><p className="mt-1 break-all font-mono text-xs">{googleMeetCode}</p></div>}<div><p className="text-[11px] text-white/35">Calendar</p><p className="mt-1 text-xs">{meeting.googleCalendarEventId ? "Synced" : "Pending"}</p></div>{meetingUri && <a href={meetingUri} className="inline-flex items-center gap-2 text-xs font-semibold text-blue-300" target="_self"><ExternalLink className="size-3.5" /> Open Google Meet fallback</a>}<Link href={`/${company.slug}`} className="inline-flex items-center gap-2 text-xs font-semibold text-white/60"><ArrowLeft className="size-3.5" /> Back to company page</Link></div></div>
        </div>
      </div>
    </main>
  );
}
