import Link from "next/link";
import { ArrowRight, CalendarCheck2, Check, CircleCheck, Clock3, Command, Layers3, ShieldCheck, UsersRound, Video } from "lucide-react";
import { PLANS } from "@/lib/plans";

const steps = [
  ["01", "Create your workspace", "Set your company profile, add employees, define availability, and connect Google."],
  ["02", "Share one public link", "Customers get a clean booking page branded for your company, separate from your internal dashboard."],
  ["03", "Let Conventus route it", "Eligible employees receive the request with a five-minute acceptance window and safe retry handling."],
  ["04", "Meet in your flow", "After acceptance, Conventus creates the Google Meet and Calendar event and opens the company meeting route."]
] as const;

export default function Home() {
  return (
    <main>
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-slate-950">
            <span className="grid size-8 place-items-center rounded-xl bg-slate-950 text-white shadow-sm"><Command className="size-4" /></span>
            Conventus
          </Link>
          <nav className="hidden items-center gap-7 text-sm font-medium text-slate-600 md:flex">
            <a href="#how-it-works" className="hover:text-slate-950">How it works</a>
            <a href="#features" className="hover:text-slate-950">Features</a>
            <a href="#pricing" className="hover:text-slate-950">Pricing</a>
            <a href="#reviews" className="hover:text-slate-950">Reviews</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-xl px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Sign in</Link>
            <Link href="/login" className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800">Get started</Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-slate-200 bg-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(37,99,235,0.10),_transparent_38%)]" />
        <div className="relative mx-auto max-w-7xl px-5 pb-20 pt-16 sm:px-6 sm:pt-24 lg:px-8 lg:pb-28">
          <div className="grid items-center gap-14 lg:grid-cols-[1.04fr_0.96fr]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
                <span className="size-1.5 rounded-full bg-blue-600" /> Real-time meeting routing for teams
              </div>
              <h1 className="mt-6 max-w-3xl text-5xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-6xl lg:text-7xl">
                Turn one public link into a live customer meeting.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
                Conventus lets companies publish a booking page, collect a requested time, route the request to an available employee, and create the Google Meet automatically after acceptance.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/login" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700">
                  Create your workspace <ArrowRight className="size-4" />
                </Link>
                <a href="#pricing" className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-6 py-3.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">See pricing</a>
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-slate-500">
                <span className="inline-flex items-center gap-2"><ShieldCheck className="size-4 text-blue-600" /> Google OAuth</span>
                <span className="inline-flex items-center gap-2"><CalendarCheck2 className="size-4 text-blue-600" /> Google Calendar</span>
                <span className="inline-flex items-center gap-2"><Video className="size-4 text-blue-600" /> Google Meet</span>
              </div>
            </div>

            <div className="relative">
              <div className="mx-auto max-w-xl rounded-[2rem] border border-slate-200 bg-slate-950 p-3 shadow-2xl shadow-slate-950/20">
                <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
                  <div className="flex items-center justify-between border-b border-white/10 pb-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Acme workspace</p>
                      <p className="mt-1 text-sm font-semibold text-white">Incoming meeting request</p>
                    </div>
                    <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">Live</span>
                  </div>
                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    {[
                      ["Customer", "Arjun Sharma"],
                      ["Date", "12 Oct · 3:00 PM"],
                      ["Duration", "20 minutes"],
                      ["Status", "Waiting for employee"]
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                        <p className="text-xs text-white/40">{label}</p>
                        <p className="mt-2 text-sm font-semibold text-white">{value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 rounded-2xl border border-blue-400/20 bg-blue-500/10 p-4">
                    <div className="flex items-center justify-between">
                      <div><p className="text-xs font-semibold text-blue-200">Acceptance window</p><p className="mt-1 text-2xl font-semibold tracking-tight text-white">04:36</p></div>
                      <Clock3 className="size-6 text-blue-300" />
                    </div>
                  </div>
                  <div className="mt-4 flex gap-3">
                    <button className="flex-1 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-950">Accept</button>
                    <button className="flex-1 rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold text-white/80">Decline</button>
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-6 -left-5 hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-xl sm:block">
                <div className="flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><CircleCheck className="size-5" /></div>
                  <div><p className="text-xs font-medium text-slate-500">After acceptance</p><p className="text-sm font-semibold text-slate-950">Meet + Calendar created</p></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="border-b border-slate-200 bg-[#f7f8fb]">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-blue-600">How it works</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">A short path from booking request to confirmed call.</h2>
            <p className="mt-4 text-base leading-7 text-slate-600">The customer sees a public page. Your team sees the internal workflow. Conventus connects the two.</p>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {steps.map(([number, title, text]) => (
              <article key={number} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <span className="text-xs font-semibold tracking-[0.18em] text-blue-600">{number}</span>
                <h3 className="mt-5 text-lg font-semibold text-slate-950">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="text-sm font-semibold text-blue-600">Built for real operations</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">The routing engine is the product.</h2>
              <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">MongoDB is authoritative, Redis handles low-latency coordination, and Google services are isolated integrations that can recover independently.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                [UsersRound, "Automatic employee routing", "Offer requests to eligible employees and prevent duplicate acceptance with server-side state transitions."],
                [CalendarCheck2, "Calendar-aware availability", "Use company rules plus Google free/busy data to surface realistic booking slots."],
                [Clock3, "Five-minute acceptance window", "The server owns the deadline. Browsers only render the countdown."],
                [Video, "Meet creation after acceptance", "Generate the Google Meet and matching Calendar event only after the request is reserved."],
                [Layers3, "Company-scoped meeting routes", "A meeting can live at /company-slug/meet/meeting-id so its ownership is explicit."],
                [ShieldCheck, "Production security model", "Tenant isolation, encrypted credentials, rate limiting, audit trails, and idempotency are first-class constraints."]
              ].map(([Icon, title, text]) => {
                const FeatureIcon = Icon as typeof ShieldCheck;
                return (
                  <article key={title as string} className="rounded-3xl border border-slate-200 p-6">
                    <div className="grid size-11 place-items-center rounded-2xl bg-blue-50 text-blue-700"><FeatureIcon className="size-5" /></div>
                    <h3 className="mt-5 text-base font-semibold text-slate-950">{title as string}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{text as string}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="border-b border-slate-200 bg-[#f7f8fb]">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold text-blue-600">Pricing</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Simple limits. Clear value.</h2>
            <p className="mt-4 text-base leading-7 text-slate-600">Start with the team size and meeting volume you actually need.</p>
          </div>
          <div className="mx-auto mt-12 grid max-w-7xl gap-5 md:grid-cols-2 xl:grid-cols-5">
            {Object.values(PLANS).map((plan) => (
              <article key={plan.id} className={`rounded-[2rem] border p-7 shadow-sm ${plan.id === "plus" ? "border-blue-200 bg-white shadow-blue-100/50" : "border-slate-200 bg-white"}`}>
                <div className="flex items-center justify-between">
                  <div><h3 className="text-xl font-semibold text-slate-950">{plan.name}</h3><p className="mt-1 text-sm text-slate-500">{plan.id === "free" ? "Try Conventus free" : plan.id === "plus" ? "Maximum capacity" : `${plan.name} capacity`}</p></div>
                  {plan.id === "plus" && <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">Highest capacity</span>}
                </div>
                <div className="mt-7 flex items-end gap-2"><span className="text-4xl font-semibold tracking-[-0.05em] text-slate-950">{plan.priceInr === 0 ? "Free" : `₹${plan.priceInr}`}</span><span className="pb-1.5 text-sm text-slate-500">{plan.priceInr > 0 ? "/ month + GST" : "30-day cycle"}</span></div>
                {plan.priceInr > 0 && <p className="mt-2 text-xs text-slate-500">18% GST added at checkout · total ₹{(plan.priceInr * 1.18).toFixed(2)}</p>}
                <div className="mt-7 grid gap-3 sm:grid-cols-2">
                  {[
                    `${plan.maxEmployees} employees`,
                    `${plan.monthlyMeetingLimit} meetings / month`,
                    `${plan.maxMeetingDurationMinutes} min max duration`,
                    `${plan.maxConcurrentMeetings} concurrent meetings`,
                    `${plan.maxWorkspaces} workspace`,
                    `${plan.maxCompanies} company`,
                    `${plan.validityDays}-day validity`,
                    ...(plan.freeFeatureDays ? [`${plan.freeFeatureDays} feature days`] : [])
                  ].map((item) => <div key={item} className="flex items-center gap-2 text-sm text-slate-700"><Check className="size-4 shrink-0 text-blue-600" />{item}</div>)}
                </div>
                <Link href="/login" className="mt-8 inline-flex w-full items-center justify-center rounded-2xl bg-slate-950 px-5 py-3.5 text-sm font-semibold text-white hover:bg-slate-800">Choose {plan.name}</Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="reviews" className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-6 lg:px-8">
          <div className="rounded-[2rem] border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center sm:px-10">
            <p className="text-sm font-semibold text-blue-600">Reviews & customer stories</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Real feedback will live here.</h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-slate-600">Conventus will publish verified customer testimonials after launch. This avoids invented reviews while the product is in its first build phase.</p>
          </div>
        </div>
      </section>

      <footer className="bg-slate-950 text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-12 sm:px-6 lg:px-8 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-2 font-semibold"><span className="grid size-8 place-items-center rounded-xl bg-white text-slate-950"><Command className="size-4" /></span>Conventus</div>
            <p className="mt-3 max-w-md text-sm leading-6 text-white/55">Connect. Schedule. Meet. A scheduling layer for teams that want customers to reach the next available person.</p>
          </div>
          <div className="flex flex-wrap gap-5 text-sm text-white/60"><a href="#features" className="hover:text-white">Features</a><a href="#pricing" className="hover:text-white">Pricing</a><a href="#reviews" className="hover:text-white">Reviews</a><Link href="/login" className="hover:text-white">Sign in</Link></div>
        </div>
      </footer>
    </main>
  );
}