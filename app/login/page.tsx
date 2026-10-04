import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CalendarCheck2, Check, ShieldCheck, UsersRound, Video } from "lucide-react";
import GoogleSignInButton from "@/components/google-sign-in-button";
import CookieSettingsButton from "@/components/cookie-settings-button";

export const metadata = {
  title: "Sign in · Conventus",
  description: "Sign in to your Conventus workspace with Google."
};

function safeReturnTo(value?: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

const errorMessages: Record<string, string> = {
  access_denied: "Google sign-in was cancelled.",
  google_not_configured: "Google sign-in is not configured right now.",
  missing_company_context: "This sign-in link is missing its company context.",
  missing_employee_invitation: "This employee sign-in link is missing its invitation.",
  signin_required: "Please sign in to continue.",
  invalid_oauth_state: "The sign-in session expired or was not recognized. Please try again.",
  expired_oauth_state: "The sign-in session expired. Please start again.",
  missing_oauth_response: "Google did not return the required sign-in response.",
  GOOGLE_EMAIL_NOT_VERIFIED: "The Google account email could not be verified.",
  COMPANY_EMPLOYEE_ACCESS_REQUIRED: "This company sign-in is limited to invited company members.",
  INVITATION_INVALID: "This employee invitation is invalid or expired.",
  GOOGLE_OAUTH_NOT_CONFIGURED: "Google sign-in is not configured right now."
};

function errorLabel(error?: string) {
  if (!error) return "";
  return errorMessages[error] ?? "We could not complete sign-in. Please try again.";
}

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; returnTo?: string; plan?: string }>;
}) {
  const { error, returnTo: requestedReturnTo, plan } = await searchParams;
  const returnTo = safeReturnTo(requestedReturnTo);
  const startUrl =
    "/api/auth/google/start?returnTo=" + encodeURIComponent(returnTo);
  const hasContinuation =
    returnTo !== "/dashboard" || Boolean(plan);

  return (
    <main className="min-h-screen bg-[#faf9f1] text-slate-950">
      <div className="mx-auto grid min-h-screen max-w-7xl gap-8 px-5 py-6 sm:px-6 lg:grid-cols-[1.05fr_.75fr] lg:items-center lg:gap-16 lg:px-8 lg:py-10">
        <section className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-9 lg:min-h-[680px] lg:p-12">
          <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-blue-50 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-20 size-64 rounded-full bg-yellow-100/50 blur-3xl" />

          <div className="relative">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl text-sm font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              <span className="grid size-9 place-items-center overflow-hidden rounded-xl bg-slate-950">
                <Image src="/favicon.svg" alt="" width={36} height={36} className="size-full object-contain" />
              </span>
              Conventus
            </Link>

            <div className="mt-20 max-w-2xl sm:mt-24">
              <p className="text-xs font-bold uppercase tracking-[0.17em] text-blue-600">
                Welcome back
              </p>
              <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl lg:text-6xl lg:leading-[1.05]">
                Your team, your booking page, one connected workflow.
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
                Sign in to manage your company workspace, availability, customer requests, billing, and confirmed meetings from one place.
              </p>

              <div className="mt-9 grid gap-3 sm:grid-cols-3">
                {[
                  [UsersRound, "Manage your team", "Members and availability"],
                  [CalendarCheck2, "Route requests", "Customer booking workflow"],
                  [Video, "Run confirmed calls", "Google Meet + Calendar"]
                ].map(([Icon, title, text]) => {
                  const FeatureIcon = Icon as typeof UsersRound;
                  return (
                    <div key={title as string} className="rounded-2xl border border-slate-200 bg-[#faf9f1] p-4">
                      <div className="grid size-9 place-items-center rounded-xl bg-blue-50 text-blue-700">
                        <FeatureIcon className="size-4.5" />
                      </div>
                      <p className="mt-4 text-xs font-semibold text-slate-950">{title as string}</p>
                      <p className="mt-1 text-[11px] leading-5 text-slate-500">{text as string}</p>
                    </div>
                  );
                })}
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500">
                {["Google sign-in", "Company-scoped workspace", "Existing return links preserved"].map((item) => (
                  <span key={item} className="inline-flex items-center gap-2">
                    <Check className="size-3.5 text-blue-600" />
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-xl rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-9">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <ArrowLeft className="size-4" />
            Back to home
          </Link>

          <div className="mt-10">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">
              Sign in
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
              Continue to Conventus
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Use your Google account to access the existing Conventus workspace and continue the action that brought you here.
            </p>

            {hasContinuation && (
              <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-700">
                  Continuing after sign-in
                </p>
                <p className="mt-1 text-xs leading-5 text-blue-950">
                  {plan
                    ? "After Google sign-in, Conventus will return you to the selected plan checkout."
                    : "After Google sign-in, Conventus will return you to the page or action you requested."}
                </p>
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4"
              >
                <p className="text-xs font-semibold text-rose-900">Sign-in could not be completed</p>
                <p className="mt-1 text-xs leading-5 text-rose-800">{errorLabel(error)}</p>
              </div>
            )}

            <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-900">Signing in with Google does not automatically grant Calendar access</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                Conventus only asks for additional Calendar permissions when a scheduling member explicitly starts Google setup.
              </p>
            </div>

            <div className="mt-7">
              <GoogleSignInButton href={startUrl} />
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-blue-600" />
                <div>
                  <p className="text-xs font-semibold text-slate-900">Google is the current sign-in method</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    Conventus keeps authentication and service credentials on the server. Your Google account is used to identify the signed-in user.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between gap-4 border-t border-slate-200 pt-5">
              <span className="text-[11px] leading-5 text-slate-400">
                No password form is exposed because the current application does not provide a separate password-based login or recovery route.
              </span>
              <ArrowRight className="hidden size-4 shrink-0 text-slate-300 sm:block" />
            </div>

            <nav aria-label="Legal links" className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
              <Link href="/terms" className="rounded-md py-1 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Terms</Link>
              <Link href="/privacy" className="rounded-md py-1 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Privacy</Link>
              <CookieSettingsButton className="py-1" aria-label="Open cookie settings">Cookie settings</CookieSettingsButton>
            </nav>
          </div>
        </section>
      </div>
    </main>
  );
}
