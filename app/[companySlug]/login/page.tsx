import { notFound } from "next/navigation";
import { ArrowLeft, Building2, CheckCircle2, Command, ShieldCheck, UsersRound } from "lucide-react";
import Link from "next/link";
import { getMongo } from "@/lib/mongodb";
import { getSession } from "@/lib/session";
import { Company } from "@/models/company";
import { Membership } from "@/models/membership";
import { User } from "@/models/user";
import { Invitation } from "@/models/invitation";

export const dynamic = "force-dynamic";

function humanizeError(error?: string) {
  const messages: Record<string, string> = {
    company_employee_access_required: "This Google account is not registered as an employee or workspace member of this company.",
    company_not_found: "This company login page is no longer available.",
    google_email_not_verified: "Google did not return a verified email address.",
    google_auth_failed: "Google sign-in could not be completed. Please try again."
  };
  return error ? messages[error] ?? error.replaceAll("_", " ") : "";
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ companySlug: string }>;
}) {
  const { companySlug } = await params;
  await getMongo();
  const company = await Company.findOne({ slug: companySlug.toLowerCase() }).select("name").lean();
  return { title: company ? `${company.name} · Employee sign in` : "Company sign in" };
}

export default async function CompanyLoginPage({
  params,
  searchParams
}: {
  params: Promise<{ companySlug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { companySlug } = await params;
  const { error } = await searchParams;
  await getMongo();

  const company = await Company.findOne({ slug: companySlug.toLowerCase() }).lean();
  if (!company) notFound();

  const session = await getSession();
  if (session?.companyId === String(company._id) && ["COMPANY_OWNER", "COMPANY_ADMIN", "EMPLOYEE"].includes(session.role)) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f7f8fb] px-5">
        <section className="w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-blue-600 text-white"><CheckCircle2 className="size-6" /></div>
          <p className="mt-5 text-sm font-semibold text-blue-600">Already signed in</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{company.name} workspace</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">You already have an active company-scoped session.</p>
          <Link href="/dashboard" className="mt-6 inline-flex rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white">Open dashboard</Link>
        </section>
      </main>
    );
  }

  const members = await Membership.find({
    companyId: company._id,
    active: true,
    role: { $in: ["COMPANY_OWNER", "COMPANY_ADMIN", "EMPLOYEE"] }
  }).select("userId role").lean();

  const users = await User.find({ _id: { $in: members.map((member) => member.userId) } })
    .select("name email image")
    .sort({ email: 1 })
    .lean();

  const userMap = new Map(users.map((user) => [String(user._id), user]));
  const activeAccess = members
    .map((member) => {
      const user = userMap.get(String(member.userId));
      return user ? { email: user.email, name: user.name, role: member.role } : null;
    })
    .filter((item): item is { email: string; name: string; role: string } => Boolean(item));

  const pendingInvites = await Invitation.find({
    companyId: company._id,
    role: "EMPLOYEE",
    acceptedAt: null,
    expiresAt: { $gt: new Date() }
  }).select("invitedEmail").sort({ invitedEmail: 1 }).lean();

  const activeEmails = new Set(activeAccess.map((item) => item.email.toLowerCase()));
  const pendingEmails = pendingInvites
    .map((invite) => invite.invitedEmail.toLowerCase())
    .filter((email) => !activeEmails.has(email));

  const loginUrl = `/api/auth/google/start?intent=company&companySlug=${encodeURIComponent(company.slug)}&returnTo=%2Fdashboard`;
  const errorMessage = humanizeError(error);

  return (
    <main className="min-h-screen bg-[#f7f8fb]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5 sm:px-6">
          <Link href={`/${company.slug}`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-950">
            <ArrowLeft className="size-4" /> Back to {company.name}
          </Link>
          <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
            <Building2 className="size-3.5" /> Employee access
          </span>
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-6 px-5 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:py-14">
        <section className="rounded-[2rem] border border-slate-200 bg-slate-950 p-7 text-white shadow-sm sm:p-9">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-2xl bg-white text-slate-950"><Command className="size-5" /></span>
            <div>
              <p className="text-sm font-semibold">{company.name}</p>
              <p className="text-xs text-white/50">Company workspace</p>
            </div>
          </div>

          <p className="mt-12 text-sm font-semibold text-blue-300">Company login</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Only registered company members can enter.</h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-white/60">
            Google verifies the email address. Conventus then checks this company’s employee/member list on the server before creating a company-scoped session.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <UsersRound className="size-5 text-blue-300" />
              <p className="mt-3 text-sm font-semibold">Registered emails</p>
              <p className="mt-1 text-xs leading-5 text-white/50">{activeAccess.length} active company member{activeAccess.length === 1 ? "" : "s"}.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <ShieldCheck className="size-5 text-blue-300" />
              <p className="mt-3 text-sm font-semibold">Server authorization</p>
              <p className="mt-1 text-xs leading-5 text-white/50">Unregistered Google emails are rejected without a workspace session.</p>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
          <p className="text-sm font-semibold text-blue-600">Sign in to {company.name}</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Continue with Google</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Use the exact Google account whose email has been added by the company administrator.
          </p>

          {errorMessage && (
            <div role="alert" className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-800">
              {errorMessage}
            </div>
          )}

          <Link href={loginUrl} className="mt-7 flex w-full items-center justify-center gap-3 rounded-2xl bg-slate-950 px-4 py-3.5 text-sm font-semibold text-white hover:bg-slate-800">
            <span className="grid size-6 place-items-center rounded-full bg-white/10 text-xs font-bold">G</span>
            Sign in as employee
          </Link>

          <div className="mt-7 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Authorized company emails</p>
                <p className="mt-1 text-xs text-slate-500">These are the emails currently accepted for workspace access.</p>
              </div>
              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">{activeAccess.length + pendingEmails.length}</span>
            </div>

            <div className="mt-4 space-y-2">
              {activeAccess.map((item) => (
                <div key={item.email} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-900">{item.email}</p>
                    <p className="truncate text-[11px] text-slate-500">{item.name} · {item.role.replaceAll("_", " ")}</p>
                  </div>
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                </div>
              ))}

              {pendingEmails.map((email) => (
                <div key={email} className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-900">{email}</p>
                    <p className="text-[11px] text-slate-500">Employee invitation pending</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">Invited</span>
                </div>
              ))}

              {activeAccess.length === 0 && pendingEmails.length === 0 && (
                <p className="rounded-xl bg-white p-4 text-xs leading-5 text-slate-500">No employee emails have been added to this company yet.</p>
              )}
            </div>
          </div>

          <p className="mt-5 text-xs leading-5 text-slate-500">
            Not on the company list? <Link href={`/${company.slug}`} className="font-semibold text-blue-700">Use the public booking page</Link> to continue as a customer.
          </p>
        </section>
      </div>
    </main>
  );
}
