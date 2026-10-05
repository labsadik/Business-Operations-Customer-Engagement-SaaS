import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck2,
  Check,
  CheckCircle2,
  Clock3,
  Route,
  ShieldCheck,
  UsersRound,
  Video
} from "lucide-react";
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

const previewMembers = [
  { name: "Avery Chen", detail: "Available · Google Calendar" },
  { name: "Jordan Lee", detail: "Available · Google Calendar" }
];

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
    <main className="min-h-[100svh] bg-slate-50 text-slate-950 lg:h-[100dvh] lg:min-h-0">
      <div className="mx-auto grid min-h-[100svh] max-w-[1440px] lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <section
          aria-labelledby="login-heading"
          className="relative flex min-h-[100svh] flex-col overflow-hidden border-r border-slate-200 bg-white lg:min-h-0"
        >
          <div className="pointer-events-none absolute -left-28 top-16 size-64 rounded-full bg-blue-50/80 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 right-0 size-72 rounded-full bg-yellow-100/40 blur-3xl" />

          <div className="relative mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-8 lg:px-10 xl:px-14">
            <header className="flex items-center justify-between gap-4">
              <Link
                href="/"
                className="inline-flex items-center gap-3 rounded-xl text-sm font-semibold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                <span className="grid size-9 place-items-center overflow-hidden rounded-xl bg-slate-950 shadow-sm">
                  <Image
                    src="/favicon.svg"
                    alt=""
                    width={36}
                    height={36}
                    className="size-full object-contain"
                  />
                </span>
                Conventus
              </Link>

              <Link
                href="/"
                className="inline-flex min-h-9 items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 transition hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <ArrowLeft className="size-3.5" aria-hidden="true" />
                Home
              </Link>
            </header>

            <div className="flex flex-1 items-center overflow-y-auto py-7 sm:py-8 lg:py-5">
              <div className="w-full">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue-600">
                  Welcome back
                </p>
                <h1
                  id="login-heading"
                  className="mt-2.5 max-w-xl text-[2.25rem] font-semibold leading-[1.04] tracking-[-0.04em] text-slate-950 sm:text-5xl lg:text-[2.75rem]"
                >
                  Sign in to your workspace.
                </h1>
                <p className="mt-4 max-w-xl text-[15px] leading-6 text-slate-600 sm:text-base">
                  Continue securely with your Google account to access your Conventus workspace and pick up where you left off.
                </p>

                {hasContinuation && (
                  <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/70 p-3.5 sm:p-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-white text-blue-700 shadow-sm">
                        <ArrowRight className="size-3.5" aria-hidden="true" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-700">
                          Continuing after sign-in
                        </p>
                        <p className="mt-1 text-[13px] leading-5 text-blue-950">
                          {plan
                            ? "After Google sign-in, Conventus will return you to the selected plan checkout."
                            : "After Google sign-in, Conventus will return you to the page or action you requested."}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {error && (
                  <div
                    role="alert"
                    className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-3.5 sm:p-4"
                  >
                    <p className="text-sm font-semibold text-rose-950">
                      Sign-in could not be completed
                    </p>
                    <p className="mt-1 text-[13px] leading-5 text-rose-800">
                      {errorLabel(error)}
                    </p>
                  </div>
                )}

                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/90 p-3.5 sm:p-4">
                  <div className="flex items-start gap-3">
                    <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-white text-blue-700 shadow-sm">
                      <CalendarCheck2 className="size-4" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold text-slate-900">
                        Calendar access stays separate
                      </p>
                      <p className="mt-1 text-[12px] leading-5 text-slate-600">
                        Signing in with Google does not automatically grant Calendar access. Conventus only asks for additional Calendar permissions when a scheduling member explicitly starts Google setup.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-5">
                  <GoogleSignInButton href={startUrl} />
                </div>

                <div className="mt-4 flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-4">
                  <ShieldCheck
                    className="mt-0.5 size-5 shrink-0 text-emerald-600"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-[13px] font-semibold text-slate-900">
                      Google is the current sign-in method
                    </p>
                    <p className="mt-1 text-[12px] leading-5 text-slate-600">
                      Conventus keeps authentication and service credentials on the server. Your Google account is used to identify the signed-in user.
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex items-start gap-2.5">
                  <CheckCircle2
                    className="mt-0.5 size-3.5 shrink-0 text-blue-600"
                    aria-hidden="true"
                  />
                  <p className="text-[11px] leading-4.5 text-slate-500">
                    No password form is exposed because the current application does not provide a separate password-based login or recovery route.
                  </p>
                </div>
              </div>
            </div>

            <footer className="border-t border-slate-200 pt-3.5 lg:pt-3">
              <nav
                aria-label="Legal links"
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-[11px] text-slate-500"
              >
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                  <Link
                    href="/terms"
                    className="rounded-md py-1 transition hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    Terms
                  </Link>
                  <Link
                    href="/privacy"
                    className="rounded-md py-1 transition hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    Privacy
                  </Link>
                  <CookieSettingsButton
                    className="py-1"
                    aria-label="Open cookie settings"
                  >
                    Cookie settings
                  </CookieSettingsButton>
                </div>
                <span className="text-slate-400">
                  Secure sign-in for Conventus workspaces
                </span>
              </nav>
            </footer>
          </div>
        </section>

        <aside
          aria-labelledby="preview-heading"
          className="relative hidden overflow-hidden bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.12),transparent_32%),linear-gradient(145deg,#f8fafc_0%,#eef4fb_52%,#f8f5e8_100%)] sm:block lg:min-h-0"
        >
          <div className="absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(148,163,184,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.1)_1px,transparent_1px)] [background-size:32px_32px]" />
          <div className="relative flex h-full min-h-[430px] items-center px-6 py-8 sm:px-8 lg:min-h-0 lg:px-9 xl:px-12">
            <div className="mx-auto w-full max-w-2xl">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue-700">
                    Illustrative product preview
                  </p>
                  <h2
                    id="preview-heading"
                    className="mt-1.5 text-xl font-semibold leading-tight tracking-[-0.03em] text-slate-950 sm:text-2xl"
                  >
                    A calmer path from request to meeting.
                  </h2>
                </div>
                <span className="shrink-0 rounded-full border border-slate-200 bg-white/90 px-2.5 py-1 text-[10px] font-semibold text-slate-500 shadow-sm">
                  Demo
                </span>
              </div>

              <div className="space-y-3">
                <div className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-[0_20px_50px_rgba(15,23,42,0.07)] backdrop-blur-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                        Customer request
                      </p>
                      <p className="mt-1.5 text-sm font-semibold text-slate-950">
                        Intro call with Northstar Studio
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Example request · 30 minutes · Illustrative only
                      </p>
                    </div>
                    <div className="grid size-8 place-items-center rounded-xl bg-yellow-50 text-yellow-700">
                      <Clock3 className="size-4" aria-hidden="true" />
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2.5 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">
                        Requested
                      </p>
                      <p className="mt-0.5 text-[13px] font-semibold text-slate-900">
                        10:30 AM
                      </p>
                    </div>
                    <Route
                      className="mx-auto hidden size-4 text-blue-500 sm:block"
                      aria-hidden="true"
                    />
                    <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-2.5">
                      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-blue-600">
                        Routing
                      </p>
                      <p className="mt-0.5 text-[13px] font-semibold text-blue-950">
                        Match available team member
                      </p>
                    </div>
                  </div>
                </div>

                <div className="ml-0 flex flex-col gap-3 lg:ml-8">
                  <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-[0_16px_38px_rgba(15,23,42,0.05)]">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                          Available team members
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          Example availability · not live account data
                        </p>
                      </div>
                      <UsersRound className="size-4.5 text-blue-600" aria-hidden="true" />
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {previewMembers.map((member) => (
                        <div
                          key={member.name}
                          className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-2.5"
                        >
                          <span className="grid size-8 place-items-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-800">
                            {member.name
                              .split(" ")
                              .map((part) => part[0])
                              .join("")}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-slate-900">
                              {member.name}
                            </p>
                            <p className="mt-0.5 truncate text-[10px] text-slate-500">
                              {member.detail}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 shadow-[0_16px_38px_rgba(16,185,129,0.07)]">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-700">
                          Confirmed meeting
                        </p>
                        <p className="mt-1 text-sm font-semibold text-emerald-950">
                          Example meeting · 11:00 AM
                        </p>
                        <p className="mt-1 text-[11px] leading-5 text-emerald-900/75">
                          Google Meet + Calendar follow acceptance.
                        </p>
                      </div>
                      <div className="grid size-8 place-items-center rounded-xl bg-white text-emerald-700 shadow-sm">
                        <Video className="size-4" aria-hidden="true" />
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-semibold text-emerald-800">
                      <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1.5">
                        <Check className="size-3" aria-hidden="true" />
                        Accepted
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1.5">
                        Calendar + Meet
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <p className="mt-3 max-w-xl text-[10px] leading-4 text-slate-500">
                All names, times, companies, requests, and statuses in this preview are illustrative examples of the existing scheduling workflow.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
