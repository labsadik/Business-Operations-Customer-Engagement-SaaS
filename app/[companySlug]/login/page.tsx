import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, ShieldCheck, UsersRound } from "lucide-react";
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
    company_employee_access_required: "This account is not registered as a member of this company.",
    company_not_found: "This company access page is no longer available.",
    google_email_not_verified: "The account email could not be verified.",
    google_auth_failed: "Sign-in could not be completed. Please try again."
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
  return { title: company ? `${company.name} · Employee access` : "Company access" };
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
  if (
    session?.companyId === String(company._id) &&
    ["COMPANY_OWNER", "COMPANY_ADMIN", "EMPLOYEE"].includes(session.role)
  ) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f7f8fb] px-5">
        <section className="w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="size-6" />
          </div>
          <p className="mt-5 text-sm font-semibold text-blue-600">Already signed in</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{company.name}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">Your company-scoped session is already active.</p>
          <Link href="/dashboard" className="mt-6 inline-flex rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
            Open dashboard
          </Link>
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
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-6">
          <Link href={`/${company.slug}`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-950">
            <ArrowLeft className="size-4" />
            Back to {company.name}
          </Link>
          <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
            <UsersRound className="size-3.5" />
            Team access
          </span>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-5 py-8 sm:px-6 lg:grid-cols-[1fr_0.9fr] lg:py-14">
        <section className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-2xl bg-slate-950 text-white">
              <img src="/favicon.svg" alt="" className="size-8 rounded-lg" />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-950">{company.name}</p>
              <p className="text-xs text-slate-400">Company workspace</p>
            </div>
          </div>

          <p className="mt-12 text-sm font-semibold text-blue-600">Company access</p>
          <h1 className="mt-3 max-w-xl text-4xl font-semibold tracking-[-0.04em] text-slate-950">
            A private workspace for registered team members.
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-slate-600">
            Access is matched to the company member list before a session is created. Unregistered accounts are not granted workspace access.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <UsersRound className="size-5 text-blue-600" />
              <p className="mt-3 text-sm font-semibold text-slate-900">Registered members</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">{activeAccess.length} active member{activeAccess.length === 1 ? "" : "s"}.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <ShieldCheck className="size-5 text-blue-600" />
              <p className="mt-3 text-sm font-semibold text-slate-900">Protected access</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">Authorization is checked on the server.</p>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
          <p className="text-sm font-semibold text-blue-600">Sign in</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Continue securely</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Use the same account email that your company administrator added.
          </p>

          {errorMessage && (
            <div role="alert" className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-800">
              {errorMessage}
            </div>
          )}

          <a
            href={loginUrl}
            className="mt-7 flex w-full items-center justify-center gap-3 rounded-2xl bg-slate-950 px-4 py-3.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <span className="grid size-6 place-items-center rounded-full bg-white/10 text-xs font-bold">→</span>
            Continue securely
          </a>

          <div className="mt-7 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Authorized emails</p>
                <p className="mt-1 text-xs text-slate-500">Current accounts with workspace access.</p>
              </div>
              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                {activeAccess.length + pendingEmails.length}
              </span>
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

              {pendingEmails.map((item) => (
                <div key={item} className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-900">{item}</p>
                    <p className="text-[11px] text-slate-500">Invitation pending</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">Invited</span>
                </div>
              ))}

              {activeAccess.length === 0 && pendingEmails.length === 0 && (
                <p className="rounded-xl bg-white p-4 text-xs leading-5 text-slate-500">
                  No team accounts have been added yet.
                </p>
              )}
            </div>
          </div>

          <p className="mt-5 text-xs leading-5 text-slate-500">
            Not on the team?{" "}
            <Link href={`/${company.slug}`} className="font-semibold text-blue-700">
              Use the public scheduling page
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
