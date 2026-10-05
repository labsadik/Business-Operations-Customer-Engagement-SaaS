import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CalendarPlus,
  CheckCircle2,
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

const workflowSteps = [
  {
    label: "Customer request",
    description: "Customer requests a meeting.",
    icon: CalendarPlus,
    tone: "blue"
  },
  {
    label: "Route to team",
    description: "Conventus routes to an eligible team member.",
    icon: Route,
    tone: "yellow"
  },
  {
    label: "Team acceptance",
    description: "A team member accepts the request.",
    icon: UserCheck,
    tone: "slate"
  },
  {
    label: "Meeting confirmed",
    description: "The configured calendar and meeting flow proceeds.",
    icon: Video,
    tone: "green"
  }
] as const;

const toneClasses = {
  blue: "border-blue-200 bg-blue-50/75 text-blue-700",
  yellow: "border-yellow-200 bg-yellow-50/80 text-yellow-700",
  slate: "border-slate-200 bg-white text-slate-700",
  green: "border-emerald-200 bg-emerald-50/75 text-emerald-700"
} as const;

function WorkflowIllustration() {
  return (
    <section
      aria-labelledby="workflow-heading"
      className="relative"
    >
      <div className="mb-5 md:mb-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue-700">
          How scheduling works
        </p>
        <h2
          id="workflow-heading"
          className="mt-1.5 text-xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-2xl"
        >
          From request to confirmed meeting.
        </h2>
        <p className="mt-1.5 max-w-xl text-xs leading-5 text-slate-500">
          An illustrative explanation of the Conventus scheduling flow.
        </p>
      </div>

      <div className="relative">
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          <defs>
            <linearGradient id="login-workflow-route" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#2563eb" stopOpacity="0.3" />
              <stop offset="48%" stopColor="#94a3b8" stopOpacity="0.34" />
              <stop offset="100%" stopColor="#facc15" stopOpacity="0.36" />
            </linearGradient>
          </defs>

          <g className="hidden md:block">
            <path
              d="M 42 24 H 58 C 66 24 66 76 58 76 H 42"
              fill="none"
              stroke="rgb(148 163 184 / 0.32)"
              strokeWidth="0.8"
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M 42 24 H 58 C 66 24 66 76 58 76 H 42"
              fill="none"
              stroke="url(#login-workflow-route)"
              strokeWidth="1.4"
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="1 4"
            />
            {[
              { delay: "0s", tone: "#facc15" },
              { delay: "1.6s", tone: "#60a5fa" },
              { delay: "3.2s", tone: "#facc15" }
            ].map((pulse) => (
              <circle
                key={pulse.delay}
                className="login-workflow-pulse"
                r="0.9"
                fill={pulse.tone}
              >
                <animateMotion
                  dur="4.8s"
                  begin={pulse.delay}
                  repeatCount="indefinite"
                  rotate="auto"
                  calcMode="spline"
                  keyTimes="0;0.12;0.5;0.88;1"
                  keySplines="0.18 0.7 0.25 1;0.42 0 0.58 1;0.42 0 0.58 1;0.65 0 0.82 0.25"
                  path="M 42 24 H 58 C 66 24 66 76 58 76 H 42"
                />
                <animate
                  attributeName="opacity"
                  values="0;0.92;0.78;0.7;0"
                  keyTimes="0;0.08;0.25;0.78;1"
                  dur="4.8s"
                  begin={pulse.delay}
                  repeatCount="indefinite"
                />
              </circle>
            ))}
          </g>

          <g className="md:hidden">
            <path
              d="M 50 6 V 94"
              fill="none"
              stroke="rgb(148 163 184 / 0.34)"
              strokeWidth="0.8"
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
            />
            <path
              d="M 50 6 V 94"
              fill="none"
              stroke="url(#login-workflow-route)"
              strokeWidth="1.4"
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
              strokeDasharray="1 4"
            />
            {[
              { delay: "0s", tone: "#facc15" },
              { delay: "2s", tone: "#60a5fa" }
            ].map((pulse) => (
              <circle
                key={pulse.delay}
                className="login-workflow-pulse"
                r="0.9"
                fill={pulse.tone}
              >
                <animateMotion
                  dur="5.2s"
                  begin={pulse.delay}
                  repeatCount="indefinite"
                  calcMode="spline"
                  keyTimes="0;0.15;0.5;0.85;1"
                  keySplines="0.18 0.7 0.25 1;0.42 0 0.58 1;0.42 0 0.58 1;0.65 0 0.82 0.25"
                  path="M 50 6 V 94"
                />
                <animate
                  attributeName="opacity"
                  values="0;0.88;0.75;0.68;0"
                  keyTimes="0;0.08;0.25;0.78;1"
                  dur="5.2s"
                  begin={pulse.delay}
                  repeatCount="indefinite"
                />
              </circle>
            ))}
          </g>
        </svg>

        <ol className="relative grid gap-3.5 md:grid-cols-2 md:gap-x-16 md:gap-y-9">
          {workflowSteps.map((step, index) => {
            const Icon = step.icon;

            return (
              <li
                key={step.label}
                className={`relative z-10 min-w-0 ${index === 1 ? "md:row-start-1 md:col-start-2" : ""} ${index === 2 ? "md:row-start-2 md:col-start-2" : ""} ${index === 3 ? "md:row-start-2 md:col-start-1" : ""}`}
              >
                <div className="min-h-[88px] rounded-2xl border border-slate-200 bg-white/95 p-3.5 shadow-[0_12px_30px_rgba(15,23,42,0.05)] backdrop-blur-sm">
                  <div className="flex items-start gap-3">
                    <span
                      className={`grid size-9 shrink-0 place-items-center rounded-xl border ${toneClasses[step.tone]}`}
                      aria-hidden="true"
                    >
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-bold tabular-nums text-slate-400">
                          0{index + 1}
                        </span>
                        <p className="text-xs font-semibold text-slate-950">
                          {step.label}
                        </p>
                      </div>
                      <p className="mt-1 text-[11px] leading-4.5 text-slate-500">
                        {step.description}
                      </p>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <style>{`
        @media (prefers-reduced-motion: reduce) {
          .login-workflow-pulse {
            display: none;
          }
        }
      `}</style>
    </section>
  );
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
    <main className="min-h-[100svh] bg-slate-50 text-slate-950 lg:h-[100dvh] lg:min-h-0">
      <div className="mx-auto grid min-h-[100svh] max-w-[1440px] lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <section
          aria-labelledby="login-heading"
          className="relative flex min-h-[100svh] flex-col border-r border-slate-200 bg-white md:min-h-[100svh] lg:min-h-0"
        >
          <div className="pointer-events-none absolute -left-28 top-14 size-64 rounded-full bg-blue-50/70 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 right-0 size-72 rounded-full bg-yellow-100/35 blur-3xl" />

          <div className="relative mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-7 md:px-8 lg:px-9 xl:px-12">
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

            <div className="flex flex-1 items-center py-7 sm:py-8 md:py-6 lg:py-4">
              <div className="w-full">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue-600">
                  Welcome back
                </p>
                <h1
                  id="login-heading"
                  className="mt-2.5 max-w-xl text-[2.2rem] font-semibold leading-[1.05] tracking-[-0.04em] text-slate-950 sm:text-5xl md:text-[2.5rem] lg:text-[2.65rem]"
                >
                  Sign in to your workspace.
                </h1>
                <p className="mt-3.5 max-w-xl text-[15px] leading-6 text-slate-600 sm:text-base">
                  Continue securely with your Google account to access your Conventus workspace and pick up where you left off.
                </p>

                {hasContinuation && (
                  <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/70 p-3.5">
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
                    className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-3.5"
                  >
                    <p className="text-sm font-semibold text-rose-950">
                      Sign-in could not be completed
                    </p>
                    <p className="mt-1 text-[13px] leading-5 text-rose-800">
                      {errorLabel(error)}
                    </p>
                  </div>
                )}

                <div className="mt-6">
                  <GoogleSignInButton href={startUrl} showGoogleLogo />
                </div>

                <div className="mt-4 flex items-start gap-3 border-t border-slate-200 pt-4">
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
                <span className="hidden text-slate-400 xl:inline">
                  Secure sign-in for Conventus workspaces
                </span>
              </nav>
            </footer>
          </div>
        </section>

        <aside
          aria-labelledby="workflow-heading"
          className="relative bg-[linear-gradient(145deg,#f8fafc_0%,#f1f5f9_58%,#f8f5e8_100%)] md:flex md:min-h-[100svh] lg:min-h-0"
        >
          <div className="absolute inset-0 opacity-60 [background-image:linear-gradient(rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] [background-size:36px_36px]" />
          <div className="relative flex min-h-[280px] w-full items-center px-5 py-9 sm:px-7 md:min-h-[100svh] md:px-8 md:py-10 lg:min-h-0 lg:px-9 xl:px-12">
            <div className="mx-auto w-full max-w-3xl">
              <WorkflowIllustration />
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
