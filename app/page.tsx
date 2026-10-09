import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  HelpCircle,
  Link2,
  UsersRound,
  Video
} from "lucide-react";
import { listPublicPlans } from "@/lib/plan-catalog";
import LandingPricingCarousel from "@/components/landing-pricing-carousel";
import CookieSettingsButton from "@/components/cookie-settings-button";
import { getMongo } from "@/lib/mongodb";
import { PlatformAnnouncement } from "@/models/platform-announcement";
import { landingPlatformAnnouncementFilter } from "@/lib/platform-announcement-query";
import PlatformAnnouncementBanner from "@/components/platform-announcement-banner";
import CountrySelector from "@/components/country-selector";

const howItWorks = [
  {
    number: "01",
    title: "Set up your team",
    text: "Create your company workspace, add employees, define availability, and connect Google for scheduling.",
    icon: UsersRound
  },
  {
    number: "02",
    title: "Share your booking page",
    text: "Publish one company link where customers can choose a meeting type, duration, date, and available time.",
    icon: Link2
  },
  {
    number: "03",
    title: "Receive the request",
    text: "Conventus routes the request to an eligible employee. The employee accepts or declines within the existing response window.",
    icon: Clock3
  },
  {
    number: "04",
    title: "Meet after acceptance",
    text: "Once accepted, Conventus creates the Google Meet and Calendar event and exposes the meeting route.",
    icon: Video
  }
] as const;

const features = [
  {
    title: "A public booking page",
    text: "Give customers one clear place to request time with your company instead of coordinating availability over messages.",
    icon: CalendarCheck2
  },
  {
    title: "Team-aware availability",
    text: "Show times that respect meeting duration, employee eligibility, workspace rules, and connected Google calendar availability.",
    icon: UsersRound
  },
  {
    title: "Employee acceptance",
    text: "A request is not treated as a confirmed meeting until an eligible employee accepts it.",
    icon: CheckCircle2
  },
  {
    title: "Google Meet after confirmation",
    text: "The meeting link is created as part of the confirmed meeting workflow rather than presented before acceptance.",
    icon: Video
  },
  {
    title: "Company-scoped workspace",
    text: "Company members, billing records, public pages, and meeting operations stay tied to the intended company scope.",
    icon: Link2
  },
  {
    title: "Clear plan limits",
    text: "Every plan exposes its actual employee, meeting, duration, concurrency, workspace, company, and validity limits.",
    icon: Clock3
  }
] as const;

const faqs = [
  {
    question: "What is Conventus?",
    answer: "Conventus is a company scheduling layer that connects a customer booking page to the right employee, then turns an accepted request into a Google Meet and Calendar event."
  },
  {
    question: "Who is it for?",
    answer: "It is designed for companies where customers need to reach a team member at a suitable time and the business wants one repeatable scheduling workflow."
  },
  {
    question: "Do customers need to sign in?",
    answer: "Yes. On published company booking pages, Google sign-in is required before Conventus reveals live availability or accepts a booking request."
  },
  {
    question: "When is a meeting confirmed?",
    answer: "The request becomes confirmed only after the eligible employee accepts it. The meeting link is available as part of that confirmed workflow."
  },
  {
    question: "Can I start without paying?",
    answer: "Yes. The current product configuration includes a Free plan with its own limits. Paid plans are available for larger teams and higher meeting capacity."
  }
] as const;

export default async function Home() {
  const plans = await listPublicPlans();
  let platformAnnouncements: Array<{
    _id: unknown;
    title: string;
    message: string;
    audience: string;
    publishedAt?: Date | null;
    createdAt: Date;
  }> = [];

  try {
    await getMongo();
    platformAnnouncements = await PlatformAnnouncement.find(landingPlatformAnnouncementFilter())
      .sort({ publishedAt: -1, createdAt: -1, _id: -1 })
      .limit(5)
      .select("_id title message audience publishedAt createdAt")
      .lean();
  } catch (error) {
    platformAnnouncements = [];
    console.error("[platform-announcement] landing read failed", {
      errorType: error instanceof Error ? error.name : "UNKNOWN"
    });
  }

  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-950">
      {/* Platform Announcement Banner placed above the platform header */}
      <PlatformAnnouncementBanner
        initialAnnouncements={platformAnnouncements.map((item) => ({
          id: String(item._id),
          title: item.title,
          message: item.message,
          audience: item.audience,
          publishedAt: item.publishedAt?.toISOString() ?? null,
          createdAt: item.createdAt.toISOString()
        }))}
        endpoint=""
        scope="landing"
        surface="landing"
      />

      <header className="sticky top-0 z-50 border-b border-amber-200/80 bg-gradient-to-r from-amber-50/90 via-white to-amber-50/90 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[72px] max-w-7xl items-center justify-between gap-5 px-5 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
          >
            <span className="grid size-10 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-950 shadow-sm">
              <Image src="/favicon.svg" alt="" width={40} height={40} className="size-full object-contain" />
            </span>
            <span className="text-sm font-semibold tracking-tight text-slate-950">Conventus</span>
          </Link>

          <nav aria-label="Main navigation" className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex">
            <a href="#how-it-works" className="rounded-lg px-1.5 py-2 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">How it works</a>
            <a href="#features" className="rounded-lg px-1.5 py-2 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">Features</a>
            <a href="#pricing" className="rounded-lg px-1.5 py-2 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">Pricing</a>
            <a href="#faq" className="rounded-lg px-1.5 py-2 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">FAQ</a>
          </nav>

          <div className="flex items-center gap-2">
            <Link href="/login" className="hidden rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-amber-100/50 sm:inline-flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2">
              Sign in
            </Link>
            
            {/* Country Selector shown for both desktop and mobile header (small size) */}
            <CountrySelector className="[&_button]:h-9 [&_button]:px-2.5 [&_button]:text-xs" />

            {/* Animated Interactive Hamburger Menu (not a button element) */}
            <details className="group relative md:hidden">
              <summary className="grid size-9 cursor-pointer list-none place-items-center rounded-xl border border-amber-200 bg-white text-slate-700 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2">
                <span className="sr-only">Open menu</span>
                <span className="relative flex size-4 flex-col items-center justify-center gap-1" aria-hidden="true">
                  <span className="h-0.5 w-3.5 rounded-full bg-slate-700 transition-all duration-300 ease-in-out group-open:translate-y-1.5 group-open:rotate-45" />
                  <span className="h-0.5 w-3.5 rounded-full bg-slate-700 transition-all duration-300 ease-in-out group-open:opacity-0" />
                  <span className="h-0.5 w-3.5 rounded-full bg-slate-700 transition-all duration-300 ease-in-out group-open:-translate-y-1.5 group-open:-rotate-45" />
                </span>
              </summary>
              <div className="absolute right-0 top-11 z-50 w-56 rounded-2xl border border-amber-200 bg-white p-2 shadow-xl animate-in fade-in zoom-in-95 duration-150">
                <div className="grid gap-1">
                  <a href="#how-it-works" className="rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-amber-50">How it works</a>
                  <a href="#features" className="rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-amber-50">Features</a>
                  <a href="#pricing" className="rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-amber-50">Pricing</a>
                  <a href="#faq" className="rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-amber-50">FAQ</a>
                  <div className="my-1 border-t border-slate-200" />
                  <Link href="/login" className="rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-amber-50">Sign in</Link>
                </div>
              </div>
            </details>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-slate-200 bg-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,_rgba(254,240,138,0.28),_transparent_30%),radial-gradient(circle_at_86%_12%,_rgba(37,99,235,0.11),_transparent_34%)]" />
        <div className="relative mx-auto max-w-7xl px-5 pb-20 pt-14 sm:px-6 sm:pb-24 sm:pt-20 lg:px-8 lg:pb-28 lg:pt-24">
          <div className="grid items-center gap-12 lg:grid-cols-[1.03fr_.97fr] lg:gap-16">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
                <span className="size-1.5 rounded-full bg-blue-600" />
                Customer booking → team routing → confirmed meeting
              </div>

              <h1 className="mt-6 max-w-3xl text-5xl font-semibold tracking-[-0.05em] text-slate-950 sm:text-6xl lg:text-[68px] lg:leading-[1.02]">
                Let customers book time with the right person on your team.
              </h1>

              <p className="mt-6 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
                Conventus gives your company one scheduling workflow: customers request a suitable time, Conventus routes the request to an eligible employee, and a Google Meet is created after the request is accepted.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/15 transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                >
                  Get started
                  <ArrowRight className="size-4" />
                </Link>
                <a
                  href="#pricing"
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-6 py-3.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                >
                  View plans
                </a>
              </div>

              <div className="mt-8 grid max-w-2xl gap-3 text-sm text-slate-600 sm:grid-cols-3">
                {[
                  ["For customers", "Choose a time from a public company page."],
                  ["For teams", "Route requests to eligible employees."],
                  ["For meetings", "Create Meet + Calendar after acceptance."]
                ].map(([label, text]) => (
                  <div key={label} className="rounded-2xl border border-slate-200 bg-[#faf9f1] px-4 py-3.5">
                    <p className="text-xs font-semibold text-slate-950">{label}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{text}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-xl">
              <div className="rounded-[2rem] border border-slate-200 bg-slate-100 p-2.5 shadow-[0_30px_70px_rgba(15,23,42,0.10)]">
                <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white p-4 sm:p-5">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Illustrative product preview</p>
                      <p className="mt-1 text-sm font-semibold text-slate-950">Example team request</p>
                    </div>
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-700">Demo</span>
                  </div>

                  <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-700">Public booking page</p>
                    <p className="mt-2 text-base font-semibold text-slate-950">Customer chooses a time</p>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {["10:30", "11:00", "11:30"].map((time, index) => (
                        <div
                          key={time}
                          className={
                            "rounded-xl border px-3 py-2.5 text-center text-xs font-semibold " +
                            (index === 1
                              ? "border-blue-300 bg-blue-500 text-white"
                              : "border-white/10 bg-white/[0.03] text-white/60")
                          }
                        >
                          {time}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mx-auto my-3 grid size-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-400">
                    <ArrowRight className="size-4 rotate-90" />
                  </div>

                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-700">Team request</p>
                        <p className="mt-2 text-base font-semibold text-white">Eligible employee receives it</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">Acceptance happens before confirmation.</p>
                      </div>
                      <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <span className="grid size-9 place-items-center rounded-xl bg-blue-50 text-blue-700">
                      <Video className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-950">Confirmed meeting</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">Google Meet + Calendar created</p>
                    </div>
                  </div>
                </div>
              </div>

              <p className="mt-3 text-center text-[11px] leading-5 text-slate-400">
                Demonstration only — the names, times, and request shown above are not live customer data.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section aria-label="Product capabilities" className="border-b border-slate-200 bg-[#faf9f1]">
        <div className="mx-auto max-w-7xl px-5 py-7 sm:px-6 lg:px-8">
          <div className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white sm:grid-cols-2 lg:grid-cols-4">
            {[
              [CalendarCheck2, "Customer booking", "One public company page for meeting requests."],
              [UsersRound, "Team routing", "Requests route to eligible employees."],
              [CheckCircle2, "Employee acceptance", "Confirmation follows an explicit acceptance step."],
              [Video, "Google meeting", "Meet + Calendar are created after acceptance."]
            ].map(([Icon, title, text]) => {
              const TrustIcon = Icon as typeof Video;
              return (
                <div key={title as string} className="flex items-start gap-3 border-b border-slate-200 px-5 py-4 last:border-b-0 sm:border-r sm:last:border-r-0 lg:border-b-0 lg:border-r lg:last:border-r-0">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700">
                    <TrustIcon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-950">{title as string}</p>
                    <p className="mt-1 text-[11px] leading-5 text-slate-500">{text as string}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-24 border-b border-slate-200 bg-[#faf9f1]">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">How it works</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              A simple path from customer request to confirmed call.
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-600">
              Conventus keeps the customer-facing booking experience and the internal team workflow connected.
            </p>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {howItWorks.map(({ number, title, text, icon: Icon }) => (
              <article key={number} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.05)]">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-bold tracking-[0.18em] text-blue-600">{number}</span>
                  <span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-700">
                    <Icon className="size-5" />
                  </span>
                </div>
                <h3 className="mt-6 text-lg font-semibold text-slate-950">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="scroll-mt-24 border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">Key features</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                Everything the workflow needs, without making the visitor learn your system.
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-6 text-slate-500">
              The public page stays focused on booking. The workspace handles routing, availability, billing, and meeting operations.
            </p>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {features.map(({ title, text, icon: Icon }) => (
              <article key={title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_6px_22px_rgba(15,23,42,0.04)] transition hover:border-blue-200 hover:shadow-[0_12px_30px_rgba(15,23,42,0.07)]">
                <div className="grid size-11 place-items-center rounded-2xl bg-blue-50 text-blue-700">
                  <Icon className="size-5" />
                </div>
                <h3 className="mt-5 text-base font-semibold text-slate-950">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="google" className="scroll-mt-24 border-b border-slate-200 bg-[#f8fafc]">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[.75fr_1.25fr] lg:items-start">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">Google integration</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                Know what Google is doing before you connect it.
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-slate-600">
                Conventus uses Google differently for identity and scheduling. A normal sign-in identifies the user; a scheduling member can separately authorize Calendar access when the workflow needs it.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                [CalendarCheck2, "Google sign-in", "Used for account identity. Customer booking sign-in does not request Calendar access."],
                [CalendarDays, "Calendar availability", "Scheduling members authorize Calendar free/busy access so Conventus can check the primary calendar before offering a time."],
                [Video, "Meet after acceptance", "The existing meeting flow creates the Calendar event with a Google Meet conference after an eligible employee accepts the request."]
              ].map(([Icon, title, text]) => {
                const IntegrationIcon = Icon as typeof Video;
                return (
                  <article key={title as string} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_6px_24px_rgba(15,23,42,0.04)]">
                    <div className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-700">
                      <IntegrationIcon className="size-4.5" />
                    </div>
                    <h3 className="mt-4 text-sm font-semibold text-slate-950">{title as string}</h3>
                    <p className="mt-2 text-xs leading-5 text-slate-600">{text as string}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="scroll-mt-24 border-b border-slate-200 bg-[#faf9f1]">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">Pricing</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Choose capacity, not complexity.
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-600">
              These cards use the real plan configuration already used by Conventus. Prices are shown in INR and each plan card uses the validity period defined in the current plan configuration.
            </p>
          </div>

          <LandingPricingCarousel plans={plans} />

          <p className="mt-5 text-center text-xs leading-5 text-slate-400">
            Paid checkout continues through the existing Conventus billing flow and uses the server-calculated price and tax configuration.
          </p>
        </div>
      </section>

      <section id="faq" className="scroll-mt-24 border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-[.72fr_1.28fr]">
            <div>
              <div className="grid size-11 place-items-center rounded-2xl bg-blue-50 text-blue-700">
                <HelpCircle className="size-5" />
              </div>
              <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-blue-600">FAQ</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                The essentials, before you sign in.
              </h2>
              <p className="mt-4 max-w-md text-sm leading-6 text-slate-600">
                No invented testimonials or statistics here. Just the product behavior that new visitors actually need to understand.
              </p>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {faqs.map(({ question, answer }) => (
                <details key={question} className="group border-b border-slate-200 px-5 py-5 last:border-b-0 sm:px-6">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                    <span>{question}</span>
                    <span className="text-lg text-slate-400 transition group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-slate-950">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_85%_10%,_rgba(37,99,235,0.22),_transparent_34%)] p-7 shadow-2xl sm:p-10 lg:p-12">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-300">Start with Conventus</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-white sm:text-4xl">
                  Give customers a clear way to reach your team.
                </h2>
                <p className="mt-4 text-sm leading-6 text-white/60">
                  Sign in with Google to create or access your Conventus workspace. Your existing authentication and company routing rules stay in control.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Link href="/login" className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950">
                  Get started
                  <ArrowRight className="size-4" />
                </Link>
                <a href="#pricing" className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white/90 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
                  View plans
                </a>
              </div>
            </div>
          </div>
        </div>

        <footer className="border-t border-white/10">
          <div className="mx-auto grid max-w-7xl gap-10 px-5 py-10 text-sm text-white/55 sm:px-6 md:grid-cols-[1.1fr_2fr] lg:px-8">
            <div>
              <div className="flex items-center gap-3 font-semibold text-white">
                <span className="grid size-9 place-items-center overflow-hidden rounded-xl bg-white">
                  <Image src="/favicon.svg" alt="" width={36} height={36} className="size-full object-contain" />
                </span>
                <span>Conventus</span>
              </div>
              <p className="mt-4 max-w-sm text-xs leading-5 text-white/45">
                Customer booking, team routing, and confirmed meetings in one company scheduling workflow.
              </p>
            </div>

            <div className="grid gap-8 sm:grid-cols-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">Product</p>
                <div className="mt-3 grid gap-2.5">
                  <a href="#how-it-works" className="rounded-lg py-1 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">How it works</a>
                  <a href="#features" className="rounded-lg py-1 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">Features</a>
                  <a href="#pricing" className="rounded-lg py-1 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">Pricing</a>
                  <a href="#faq" className="rounded-lg py-1 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">FAQ</a>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">Account</p>
                <div className="mt-3 grid gap-2.5">
                  <Link href="/login" className="rounded-lg py-1 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">Sign in</Link>
                  <Link href="/login" className="rounded-lg py-1 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">Get started</Link>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">Legal</p>
                <div className="mt-3 grid gap-2.5">
                  <Link href="/terms" className="rounded-lg py-1 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">Terms</Link>
                  <Link href="/privacy" className="rounded-lg py-1 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">Privacy</Link>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">Preferences</p>
                <div className="mt-3">
                  <CookieSettingsButton className="py-1 text-white/55 hover:text-white" aria-label="Open cookie settings">Cookie settings</CookieSettingsButton>
                </div>
              </div>
            </div>
          </div>
        </footer>
      </section>
    </main>
  );
}