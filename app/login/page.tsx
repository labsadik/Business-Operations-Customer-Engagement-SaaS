import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarPlus,
  Route,
  UserCheck,
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

import LoginWorkflowPreview from "@/components/login-workflow-preview";

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
      <div className="mx-auto grid min-h-[100svh] max-w-[1440px] lg:h-full lg:min-h-0 md:grid-cols-2">
        <aside
          aria-labelledby="workflow-heading"
          className="order-last flex min-h-0 items-center justify-center border-t border-slate-200 bg-slate-50 px-5 py-5 md:order-first md:border-r md:border-t-0 md:px-7 md:py-7 lg:px-10"
        >
          <LoginWorkflowPreview />
        </aside>

        <section
          aria-labelledby="login-heading"
          className="order-first flex min-h-[100svh] flex-col bg-white md:order-last md:min-h-0 lg:min-h-0"
        >
          <div className="flex min-h-0 flex-1 flex-col px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-8 md:px-7 lg:px-10 xl:px-12">
            <header className="flex items-center justify-between gap-4">
              <Link
                href="/"
                className="inline-flex items-center gap-2.5 rounded-xl text-sm font-semibold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
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
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-1.5 py-1 text-xs font-semibold text-slate-500 transition hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <ArrowLeft className="size-3.5" aria-hidden="true" />
                Home
              </Link>
            </header>

            <div className="flex min-h-0 flex-1 items-center py-5 sm:py-6 md:py-5">
              <div className="w-full">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-600">
                  Welcome back
                </p>
                <h1
                  id="login-heading"
                  className="mt-2 max-w-xl text-[2rem] font-semibold leading-[1.04] tracking-[-0.04em] text-slate-950 sm:text-[2.35rem]"
                >
                  Sign in to your workspace.
                </h1>
                <p className="mt-3 max-w-xl text-[14px] leading-5.5 text-slate-600 sm:text-[15px] sm:leading-6">
                  Continue with your Google account to access your Conventus workspace.
                </p>

                {hasContinuation && (
                  <p className="mt-4 rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-2.5 text-[12px] leading-4.5 text-blue-950">
                    {plan
                      ? "After Google sign-in, Conventus will return you to the selected plan checkout."
                      : "After Google sign-in, Conventus will return you to the page or action you requested."}
                  </p>
                )}

                {error && (
                  <div
                    role="alert"
                    className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3"
                  >
                    <p className="text-sm font-semibold text-rose-950">
                      Sign-in could not be completed
                    </p>
                    <p className="mt-1 text-[12px] leading-4.5 text-rose-800">
                      {errorLabel(error)}
                    </p>
                  </div>
                )}

                <div className="mt-5">
                  <GoogleSignInButton href={startUrl} showGoogleLogo />
                </div>
              </div>
            </div>

            <footer className="border-t border-slate-200 pt-3">
              <nav
                aria-label="Legal links"
                className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-500"
              >
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
              </nav>
            </footer>
          </div>
        </section>
      </div>
    </main>
  );
}
