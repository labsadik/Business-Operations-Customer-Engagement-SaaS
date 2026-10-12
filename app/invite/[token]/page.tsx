import Link from "next/link";
import GoogleSignInButton from "@/components/google-sign-in-button";
import { Command, ShieldCheck, UsersRound } from "lucide-react";
import { getMongo } from "@/lib/mongodb";
import { Invitation } from "@/models/invitation";
import { Company } from "@/models/company";

export const dynamic = "force-dynamic";

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await getMongo();

  const { sha256 } = await import("@/lib/security");
  const invite = await Invitation.findOne({ tokenHash: sha256(token), expiresAt: { $gt: new Date() }, acceptedAt: null }).lean();
  const company = invite ? await Company.findById(invite.companyId).lean() : null;

  if (!invite || !company) {
    return <main className="grid min-h-screen place-items-center bg-[#faf9f1] px-5"><div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm"><p className="text-sm font-semibold text-rose-600">Invitation unavailable</p><h1 className="mt-2 text-2xl font-semibold text-slate-950">This invite has expired or was already used.</h1><Link href="/" className="mt-6 inline-flex rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white">Go to Canvas</Link></div></main>;
  }

  const loginUrl = `/api/auth/google/start?intent=employee&companySlug=${encodeURIComponent(company.slug)}&invitationToken=${encodeURIComponent(token)}&returnTo=/dashboard`;

  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f8fb] px-5 py-10">
      <div className="w-full max-w-lg rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
        <div className="grid size-11 place-items-center rounded-2xl bg-slate-950 text-white"><Command className="size-5" /></div>
        <p className="mt-8 text-sm font-semibold text-blue-600">Employee invitation</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Join {company.name}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">This secure invite is for <strong className="font-semibold text-slate-900">{invite.invitedEmail}</strong>. Continue with that Google account to join the workspace.</p>

        <div className="mt-7">
          <GoogleSignInButton href={loginUrl} label="Continue with Google" />
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 p-4"><UsersRound className="size-5 text-blue-600" /><p className="mt-3 text-sm font-semibold text-slate-900">Employee access</p><p className="mt-1 text-xs leading-5 text-slate-500">Requests, availability, and meeting actions.</p></div>
          <div className="rounded-2xl border border-slate-200 p-4"><ShieldCheck className="size-5 text-blue-600" /><p className="mt-3 text-sm font-semibold text-slate-900">Scoped access</p><p className="mt-1 text-xs leading-5 text-slate-500">Only this company workspace is accessible.</p></div>
        </div>
      </div>
    </main>
  );
}