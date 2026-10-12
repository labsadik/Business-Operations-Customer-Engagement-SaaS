import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  FolderLock,
  HelpCircle,
  Link2,
  ListTodo,
  Layers3,
  Megaphone,
  ShieldCheck,
  UsersRound,
  Video,
  WalletCards
} from "lucide-react";
import { listPublicPlans } from "@/lib/plan-catalog";
import LandingPricingCarousel from "@/components/landing-pricing-carousel";
import CookieSettingsButton from "@/components/cookie-settings-button";
import { getMongo } from "@/lib/mongodb";
import { PlatformAnnouncement } from "@/models/platform-announcement";
import { landingPlatformAnnouncementFilter } from "@/lib/platform-announcement-query";
import PlatformAnnouncementBanner from "@/components/platform-announcement-banner";
import CountrySelector from "@/components/country-selector";
import LandingWorkflowMockup from "@/components/landing-workflow-mockup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const howItWorks = [
  {
    number: "01",
    title: "Set Up Workspace",
    text: "Add team members, define working hours, and connect your Calendar. Keep company rules and availability in one place.",
    icon: UsersRound,
    chips: ["Team members", "Working hours"]
  },
  {
    number: "02",
    title: "Share Public Link",
    text: "Publish your company booking URL and share it with clients in emails, proposals, or on your website.",
    icon: Link2,
    chips: ["Branded booking page", "Verified clients"]
  },
  {
    number: "03",
    title: "Review & Accept",
    text: "Eligible team members receive the request and choose to accept or decline. A time is not locked before acceptance.",
    icon: CheckCircle2,
    chips: ["Instant alerts", "Explicit acceptance"]
  },
  {
    number: "04",
    title: "Meet & Collaborate",
    text: "The meeting room link is issued, the time is blocked on calendars, and follow-up tasks and files stay with the workspace.",
    icon: Video,
    chips: ["Meeting room", "Vault & tasks"]
  }
] as const;

const features = [
  {
    id: "portal",
    eyebrow: "Client experience",
    title: "Company Booking Portal",
    route: "/{companySlug}",
    text: "Give every workspace a branded public link. Verified client sign-in helps prevent spam, while 15, 30, 45, and 60 minute options reflect eligible employee availability.",
    icon: CalendarCheck2,
    href: "/dashboard",
    action: "Configure booking portal",
    accent: "blue"
  },
  {
    id: "routing",
    eyebrow: "Conflict-aware scheduling",
    title: "Smart Employee Routing",
    route: "Acceptance-gated requests",
    text: "Requests go to active, eligible employees. A meeting becomes confirmed only after explicit acceptance, preventing phantom bookings and reducing double-booking risk.",
    icon: UsersRound,
    href: "/dashboard",
    action: "Explore team workflow",
    accent: "emerald"
  },
  {
    id: "tasks",
    eyebrow: "Operations",
    title: "Integrated Team Task Management",
    route: "/dashboard/tasks",
    text: "Coordinate work in Kanban or list views, set Low, Medium, High, and Urgent priorities, and account for Active, On Leave, or Inactive team availability.",
    icon: ListTodo,
    href: "/dashboard/tasks",
    action: "Open team tasks",
    accent: "violet"
  },
  {
    id: "vault",
    eyebrow: "Private company files",
    title: "Private Cloud Document Vault",
    route: "/dashboard/vault",
    text: "Store files in structured folders, upload large assets in chunks, and preview contracts, proposals, PDFs, and client documents in the browser.",
    icon: FolderLock,
    href: "/dashboard/vault",
    action: "Open company vault",
    accent: "blue"
  },
  {
    id: "billing",
    eyebrow: "Finance & plan controls",
    title: "Automated Billing & Invoices",
    route: "/dashboard?panel=billing",
    text: "See plan quotas and usage progress at a glance. Download one-page enterprise PDF invoices designed to make corporate accounting and recordkeeping easier.",
    icon: WalletCards,
    href: "/dashboard?panel=billing",
    action: "Open billing & invoices",
    accent: "amber"
  },
  {
    id: "announcements",
    eyebrow: "Company communications",
    title: "Platform & Company Announcements",
    route: "Targeted workspace notices",
    text: "Publish operational updates across all companies or target a specific client workspace, so people see relevant notices in context.",
    icon: Megaphone,
    href: "/dashboard",
    action: "Explore announcements",
    accent: "emerald"
  }
] as const;

const faqs = [
  {
    question: "What is Canvas?",
    answer: "Canvas by AlgoQuit brings public client booking, employee routing and acceptance, meeting coordination, team tasks, private company files, billing, and announcements into one company workspace."
  },
  {
    question: "Do clients need to sign in?",
    answer: "Yes. Published company booking pages require verified client sign-in before live availability is revealed or a booking request is accepted."
  },
  {
    question: "When is a meeting confirmed?",
    answer: "The request becomes confirmed only after an eligible employee explicitly accepts it. Calendar blocking and meeting-room details follow that confirmation workflow."
  },
  {
    question: "What can teams manage in the workspace?",
    answer: "Depending on their access and plan, teams can coordinate bookings, tasks, company files, usage limits and invoices, and platform or workspace announcements."
  },
  {
    question: "Can I start without paying?",
    answer: "Yes. The current plan configuration includes a Free plan with defined limits. The pricing cards below use the live public plan configuration."
  }
] as const;

type FeatureKind = (typeof features)[number]["id"];

function FeaturePreview({ kind }: { kind: FeatureKind }) {
  if (kind === "portal") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg bg-blue-600 text-white"><CalendarDays className="size-3.5" /></span>
            <div><p className="text-[10px] font-bold text-slate-900">Meridian Health</p><p className="text-[9px] text-slate-500">meridian.canvas.test</p></div>
          </div>
          <span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-semibold text-emerald-700">Verified</span>
        </div>
        <p className="mt-3 text-[11px] font-semibold text-slate-800">Choose a meeting length</p>
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {["15 min", "30 min", "45 min", "60 min"].map((duration) => (
            <span key={duration} className={"rounded-lg border px-1 py-2 text-center text-[9px] font-semibold " + (duration === "30 min" ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600")}>{duration}</span>
          ))}
        </div>
        <p className="mt-2 text-[9px] text-slate-500">Times reflect eligible team availability.</p>
      </div>
    );
  }

  if (kind === "routing") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold text-slate-700">New client request</span>
          <span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-semibold text-emerald-700">Confirmed</span>
        </div>
        <div className="mt-3 flex items-center gap-2.5 rounded-xl bg-slate-50 p-2.5">
          <span className="grid size-8 place-items-center rounded-full bg-violet-100 text-[10px] font-bold text-violet-800">SJ</span>
          <div className="min-w-0 flex-1"><p className="text-[10px] font-semibold text-slate-900">Sarah Jenkins</p><p className="text-[9px] text-slate-500">Solutions Architect · Active</p></div>
          <CheckCircle2 className="size-4 text-emerald-600" />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="rounded-md bg-blue-50 px-2 py-1 text-[9px] font-medium text-blue-700">Eligibility checked</span>
          <span className="rounded-md bg-emerald-50 px-2 py-1 text-[9px] font-medium text-emerald-700">Accepted by employee</span>
        </div>
      </div>
    );
  }

  if (kind === "tasks") {
    return (
      <div className="grid grid-cols-3 gap-2">
        {[
          { title: "To do", task: "Prepare proposal", priority: "High", cls: "bg-amber-50 text-amber-800" },
          { title: "In progress", task: "Client handoff", priority: "Urgent", cls: "bg-rose-50 text-rose-700" },
          { title: "Done", task: "Review notes", priority: "Low", cls: "bg-emerald-50 text-emerald-700" }
        ].map((column) => (
          <div key={column.title} className="min-w-0 rounded-xl border border-slate-200 bg-white p-2">
            <p className="text-[9px] font-semibold text-slate-700">{column.title}</p>
            <div className="mt-2 min-h-[65px] rounded-lg border border-slate-100 bg-slate-50 p-2">
              <p className="text-[9px] font-semibold leading-4 text-slate-800">{column.task}</p>
              <span className={"mt-2 inline-flex rounded-md px-1.5 py-1 text-[8px] font-semibold " + column.cls}>{column.priority}</span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (kind === "vault") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-2"><FolderLock className="size-4 text-blue-700" /><p className="text-[10px] font-semibold text-slate-800">Company Vault</p></div>
          <span className="text-[9px] text-slate-500">Private workspace</span>
        </div>
        {[
          { name: "Client contract.pdf", meta: "PDF · 2.4 MB", icon: FileText },
          { name: "Project proposal.pdf", meta: "PDF · 1.8 MB", icon: FileText },
          { name: "Client assets", meta: "Folder · 12 files", icon: FolderLock }
        ].map((file) => {
          const FileIcon = file.icon;
          return <div key={file.name} className="flex items-center gap-2.5 border-b border-slate-100 py-2.5 last:border-b-0"><span className="grid size-7 place-items-center rounded-lg bg-blue-50 text-blue-700"><FileIcon className="size-3.5" /></span><div className="min-w-0 flex-1"><p className="truncate text-[10px] font-semibold text-slate-800">{file.name}</p><p className="text-[9px] text-slate-500">{file.meta}</p></div><ShieldCheck className="size-3.5 text-emerald-600" /></div>;
        })}
      </div>
    );
  }

  if (kind === "billing") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
        <div className="flex items-center justify-between gap-2"><p className="text-[10px] font-semibold text-slate-800">Monthly plan usage</p><span className="text-[10px] font-bold text-blue-700">72%</span></div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-[72%] rounded-full bg-blue-600" /></div>
        <div className="mt-2 flex justify-between text-[9px] text-slate-500"><span>72 of 100 meetings</span><span>Resets monthly</span></div>
        <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-amber-100 text-amber-800"><FileText className="size-4" /></span>
          <div className="min-w-0 flex-1"><p className="text-[10px] font-semibold text-slate-900">Enterprise invoice</p><p className="text-[9px] text-slate-500">PDF · One-page summary</p></div>
          <span className="text-[9px] font-semibold text-blue-700">Download</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
      <div className="flex items-start gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><BellRing className="size-4" /></span>
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-[10px] font-semibold text-slate-900">Service update</p><span className="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-semibold text-blue-700">Published</span></div><p className="mt-1 text-[10px] leading-4 text-slate-600">A new operational notice is available for your workspace.</p></div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5"><span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[9px] text-slate-600">All companies</span><span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[9px] text-emerald-700">Selected workspaces</span></div>
    </div>
  );
}

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

      <header className="sticky top-0 z-50 border-b border-slate-200/90 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[72px] max-w-7xl items-center justify-between gap-4 px-5 sm:px-6 lg:px-8">
          <Link href="/" className="flex shrink-0 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
            <span className="grid size-10 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <Image src="/favicon.svg" alt="" width={40} height={40} className="size-full object-contain" />
            </span>
            <span className="text-sm font-bold tracking-tight text-slate-950">Canvas by AlgoQuit</span>
          </Link>

          <nav aria-label="Main navigation" className="hidden items-center gap-6 text-sm font-medium text-slate-600 lg:flex">
            <a href="#how-it-works" className="rounded-lg px-1.5 py-2 transition hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">How it works</a>
            <a href="#features" className="rounded-lg px-1.5 py-2 transition hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Features</a>
            <a href="#pricing" className="rounded-lg px-1.5 py-2 transition hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Pricing</a>
            <a href="#faq" className="rounded-lg px-1.5 py-2 transition hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">FAQ</a>
            <Link href="/compare" className="rounded-lg px-1.5 py-2 transition hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Compare</Link>
            <Link href="/docs" className="rounded-lg px-1.5 py-2 transition hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Docs</Link>
          </nav>

          <div className="flex items-center gap-2">
            <CountrySelector className="[&_button]:h-9 [&_button]:px-2.5 [&_button]:text-xs" />
            <Link href="/login" className="hidden rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 sm:inline-flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Sign in</Link>
            <Link href="/dashboard" className="hidden items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 sm:inline-flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
              Workspace <ArrowRight className="size-4" />
            </Link>
            <details className="group relative lg:hidden">
              <summary className="grid size-10 cursor-pointer list-none place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                <span className="sr-only">Open menu</span>
                <span className="relative flex size-4 flex-col items-center justify-center gap-1" aria-hidden="true">
                  <span className="h-0.5 w-4 rounded-full bg-slate-700 transition-all group-open:translate-y-1.5 group-open:rotate-45" />
                  <span className="h-0.5 w-4 rounded-full bg-slate-700 transition-all group-open:opacity-0" />
                  <span className="h-0.5 w-4 rounded-full bg-slate-700 transition-all group-open:-translate-y-1.5 group-open:-rotate-45" />
                </span>
              </summary>
              <div className="absolute right-0 top-12 z-50 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                <div className="grid gap-1">
                  <a href="#how-it-works" className="rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">How it works</a>
                  <a href="#features" className="rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Features</a>
                  <a href="#pricing" className="rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Pricing</a>
                  <a href="#faq" className="rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">FAQ</a>
                  <Link href="/compare" className="rounded-xl px-3 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-50">Compare Canvas</Link>
                  <Link href="/docs" className="rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Documentation</Link>
                  <div className="my-1 border-t border-slate-200" />
                  <Link href="/login" className="rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Sign in</Link>
                  <Link href="/dashboard" className="rounded-xl px-3 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-50">Open workspace</Link>
                </div>
              </div>
            </details>
          </div>
        </div>
      </header>

      <section className="relative isolate overflow-hidden border-b border-slate-200/90 bg-[#f8fafc]">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_14%_5%,rgba(37,99,235,0.10),transparent_38%),radial-gradient(ellipse_at_90%_24%,rgba(5,150,105,0.08),transparent_34%)]" />
        <div className="mx-auto max-w-7xl px-5 pb-14 pt-12 sm:px-6 sm:pb-20 sm:pt-16 lg:px-8 lg:pb-24 lg:pt-20">
          <div className="grid items-center gap-12 lg:grid-cols-[.95fr_1.05fr] lg:gap-14">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-semibold text-blue-800">
                <span className="size-1.5 rounded-full bg-blue-600" />
                Enterprise Scheduling &amp; Operations Platform
              </div>

              <h1 className="mt-6 max-w-2xl text-[2.65rem] font-semibold leading-[1.07] tracking-[-0.045em] text-slate-950 sm:text-5xl lg:text-[58px]">
                Turn client booking requests into confirmed virtual meetings and calendar events with your team.
              </h1>

              <p className="mt-6 max-w-xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
                Canvas unites customer booking pages, intelligent employee routing, team task delegation, and private cloud file storage into one cohesive company workspace.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/login" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/15 transition hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
                  Get started for free <ArrowRight className="size-4" />
                </Link>
                <a href="#features" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3.5 text-sm font-semibold text-slate-800 transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50/60 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
                  Explore capabilities <ArrowRight className="size-4" />
                </a>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-slate-600">
                <span className="inline-flex items-center gap-2"><ShieldCheck className="size-4 text-emerald-700" /> Workspace-scoped access</span>
                <span className="inline-flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-700" /> Acceptance before confirmation</span>
              </div>
            </div>

            <LandingWorkflowMockup />
          </div>
        </div>
      </section>

      <section aria-label="Platform trust metrics" className="border-b border-slate-200/90 bg-white">
        <div className="mx-auto max-w-7xl px-5 py-5 sm:px-6 lg:px-8">
          <div className="grid gap-3 md:grid-cols-3">
            {[
              { icon: CalendarCheck2, title: "Zero scheduling conflicts", text: "Calendar & meeting sync", tone: "blue" },
              { icon: CheckCircle2, title: "Real employee acceptance", text: "No phantom bookings", tone: "emerald" },
              { icon: FolderLock, title: "Private company vault", text: "Task delegation included", tone: "violet" }
            ].map((metric) => {
              const MetricIcon = metric.icon;
              const iconClass = metric.tone === "emerald" ? "bg-emerald-50 text-emerald-700" : metric.tone === "violet" ? "bg-violet-50 text-violet-700" : "bg-blue-50 text-blue-700";
              return (
                <div key={metric.title} className="flex items-center gap-3 rounded-xl border border-slate-200/90 bg-white px-4 py-3.5">
                  <span className={"grid size-10 shrink-0 place-items-center rounded-xl " + iconClass}><MetricIcon className="size-5" /></span>
                  <div><p className="text-sm font-semibold text-slate-900">{metric.title}</p><p className="mt-0.5 text-xs text-slate-500">{metric.text}</p></div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section aria-label="Compare Canvas" className="border-b border-slate-200/90 bg-white">
        <div className="mx-auto max-w-7xl px-5 py-3 sm:px-6 lg:px-8">
          <Link href="/compare" className="group flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/70 px-4 py-3 transition-all hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md sm:px-5">
            <span className="flex items-center gap-2 text-sm font-semibold text-slate-800"><span className="grid size-8 shrink-0 place-items-center rounded-xl bg-white text-blue-700"><Layers3 className="size-4" /></span>Consolidate 3 tools in 1 <span className="hidden font-normal text-slate-600 sm:inline">— See how we compare</span></span>
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700">See how we compare <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" /></span>
          </Link>
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-24 border-b border-slate-200/90 bg-[#faf9f1]">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">How it works</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">One clear workflow from first request to follow-up.</h2>
            </div>
            <p className="max-w-lg text-sm leading-6 text-slate-600">A customer-friendly entry point connected to the internal tools your team needs to deliver.</p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {howItWorks.map(({ number, title, text, icon: Icon, chips }) => (
              <article key={number} className="group rounded-2xl border border-slate-200/90 bg-white p-5 transition-all hover:-translate-y-0.5 hover:shadow-md sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-bold tracking-[0.18em] text-blue-700">STEP {number}</span>
                  <span className="grid size-11 place-items-center rounded-2xl bg-blue-50 text-blue-700"><Icon className="size-5" /></span>
                </div>
                <h3 className="mt-5 text-lg font-semibold tracking-tight text-slate-950">{title}</h3>
                <p className="mt-2.5 text-sm leading-6 text-slate-600">{text}</p>
                <div className="mt-5 flex flex-wrap gap-1.5">
                  {chips.map((chip) => <span key={chip} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-medium text-slate-600">{chip}</span>)}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="scroll-mt-24 border-b border-slate-200/90 bg-white">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Built for enterprise operations</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">One workspace. Six connected capabilities.</h2>
            </div>
            <p className="max-w-xl text-sm leading-6 text-slate-600">Explore realistic previews of the booking, routing, collaboration, file, finance, and announcement workflows built into Canvas.</p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {features.map((feature) => {
              const FeatureIcon = feature.icon;
              const iconClass = feature.accent === "emerald" ? "bg-emerald-50 text-emerald-700" : feature.accent === "violet" ? "bg-violet-50 text-violet-700" : feature.accent === "amber" ? "bg-amber-50 text-amber-800" : "bg-blue-50 text-blue-700";
              return (
                <article key={feature.id} className="flex h-full flex-col rounded-2xl border border-slate-200/90 bg-white p-4 transition-all hover:-translate-y-0.5 hover:shadow-md sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <span className={"grid size-11 shrink-0 place-items-center rounded-2xl " + iconClass}><FeatureIcon className="size-5" /></span>
                    <span className="max-w-[58%] rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-right text-[9px] font-medium leading-3 text-slate-600">{feature.route}</span>
                  </div>
                  <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500">{feature.eyebrow}</p>
                  <h3 className="mt-1.5 text-lg font-semibold tracking-tight text-slate-950">{feature.title}</h3>
                  <p className="mt-2 min-h-[5.5rem] text-sm leading-6 text-slate-600">{feature.text}</p>
                  <div className="mt-4"><FeaturePreview kind={feature.id} /></div>
                  <div className="mt-auto pt-4">
                    <Link href={feature.href} className="inline-flex items-center gap-2 rounded-lg py-1 text-xs font-semibold text-blue-700 transition hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
                      {feature.action} <ArrowRight className="size-3.5" />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-b border-slate-200/90 bg-[#f8fafc]">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-6 lg:px-8">
          <div className="grid gap-4 md:grid-cols-3">
            <article className="flex items-start gap-3 rounded-2xl border border-slate-200/90 bg-white p-5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><ShieldCheck className="size-5" /></span>
              <div><h3 className="text-sm font-semibold text-slate-900">Access stays scoped</h3><p className="mt-1.5 text-xs leading-5 text-slate-600">Keep client-facing booking, team operations, billing, and files aligned with the intended company workspace.</p></div>
            </article>
            <article className="flex items-start gap-3 rounded-2xl border border-slate-200/90 bg-white p-5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><CheckCircle2 className="size-5" /></span>
              <div><h3 className="text-sm font-semibold text-slate-900">A human confirms the meeting</h3><p className="mt-1.5 text-xs leading-5 text-slate-600">Employee acceptance is a real workflow step, not a decorative booking status.</p></div>
            </article>
            <article className="flex items-start gap-3 rounded-2xl border border-slate-200/90 bg-white p-5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-800"><Clock3 className="size-5" /></span>
              <div><h3 className="text-sm font-semibold text-slate-900">Plan rules remain visible</h3><p className="mt-1.5 text-xs leading-5 text-slate-600">Live plan configuration determines workspace limits, meeting capacity, and the price shown in billing.</p></div>
            </article>
          </div>
        </div>
      </section>

      <section id="pricing" className="scroll-mt-24 border-b border-slate-200/90 bg-[#faf9f1]">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Pricing</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Choose capacity, not complexity.</h2>
            <p className="mt-4 text-base leading-7 text-slate-600">Compare plans using the current Canvas configuration. Prices are shown in INR, with validity and usage limits taken from the live public plan catalog.</p>
          </div>

          <LandingPricingCarousel plans={plans} />

          <p className="mt-5 text-center text-xs leading-5 text-slate-500">Paid checkout follows the existing billing flow and uses the server-calculated price and tax configuration.</p>
        </div>
      </section>

      <section id="faq" className="scroll-mt-24 border-b border-slate-200/90 bg-white">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <div className="grid gap-10 lg:grid-cols-[.75fr_1.25fr] lg:gap-14">
            <div>
              <span className="grid size-11 place-items-center rounded-2xl bg-blue-50 text-blue-700"><HelpCircle className="size-5" /></span>
              <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-blue-700">FAQ</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Clear answers for your team.</h2>
              <p className="mt-4 max-w-md text-sm leading-6 text-slate-600">Learn how booking, acceptance, team collaboration, and plan access fit together before you create a workspace.</p>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white">
              {faqs.map(({ question, answer }) => (
                <details key={question} className="group border-b border-slate-200/90 px-5 py-5 last:border-b-0 sm:px-6">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                    <span>{question}</span><span className="text-lg text-slate-400 transition group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-slate-200/90 bg-[#f8fafc]">
        <div className="mx-auto max-w-7xl px-5 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="overflow-hidden rounded-3xl border border-blue-200/80 bg-white p-6 shadow-[0_20px_60px_rgba(37,99,235,0.08)] sm:p-9 lg:p-12">
            <div className="flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-2xl">
                <p className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-blue-700"><CalendarCheck2 className="size-3.5" /> Start with Canvas</p>
                <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Give every client request a clear next step.</h2>
                <p className="mt-3 text-sm leading-6 text-slate-600">Bring bookings, accepted meetings, team tasks, private files, and operational updates into one cohesive company workspace.</p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Link href="/login" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">Get started for free <ArrowRight className="size-4" /></Link>
                <a href="#pricing" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">Compare plans</a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="bg-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-10 text-sm text-slate-500 sm:px-6 md:grid-cols-[1.1fr_2fr] lg:px-8">
          <div>
            <div className="flex items-center gap-3 font-semibold text-slate-950">
              <span className="grid size-9 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-white"><Image src="/favicon.svg" alt="" width={36} height={36} className="size-full object-contain" /></span>
              <span>Canvas by AlgoQuit</span>
            </div>
            <p className="mt-4 max-w-sm text-xs leading-5 text-slate-500">Client booking, team routing, task delegation, private files, and enterprise operations in one company workspace.</p>
          </div>

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
            <div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Product</p><div className="mt-3 grid gap-2.5"><a href="#how-it-works" className="rounded-lg py-1 hover:text-blue-700">How it works</a><a href="#features" className="rounded-lg py-1 hover:text-blue-700">Features</a><a href="#pricing" className="rounded-lg py-1 hover:text-blue-700">Pricing</a><a href="#faq" className="rounded-lg py-1 hover:text-blue-700">FAQ</a><Link href="/compare" className="rounded-lg py-1 hover:text-blue-700">Canvas vs Cal.com &amp; Jira</Link></div></div>
            <div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Workspace</p><div className="mt-3 grid gap-2.5"><Link href="/dashboard" className="rounded-lg py-1 hover:text-blue-700">Open dashboard</Link><Link href="/dashboard/tasks" className="rounded-lg py-1 hover:text-blue-700">Team tasks</Link><Link href="/dashboard/vault" className="rounded-lg py-1 hover:text-blue-700">Company vault</Link></div></div>
            <div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Account & legal</p><div className="mt-3 grid gap-2.5"><Link href="/login" className="rounded-lg py-1 hover:text-blue-700">Sign in</Link><Link href="/terms" className="rounded-lg py-1 hover:text-blue-700">Terms</Link><Link href="/privacy" className="rounded-lg py-1 hover:text-blue-700">Privacy</Link></div></div>
            <div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Resources</p><div className="mt-3 grid gap-2.5"><Link href="/docs" className="rounded-lg py-1 hover:text-blue-700">Documentation</Link><Link href="/docs#scheduling" className="rounded-lg py-1 hover:text-blue-700">Client scheduling</Link><Link href="/docs#tasks" className="rounded-lg py-1 hover:text-blue-700">Task management</Link><Link href="/docs#vault" className="rounded-lg py-1 hover:text-blue-700">Company Vault</Link><Link href="/docs#live-chat" className="rounded-lg py-1 hover:text-blue-700">Live Chat</Link></div></div>
            <div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Preferences</p><div className="mt-3"><CookieSettingsButton className="rounded-lg py-1 text-slate-500 hover:text-blue-700" aria-label="Open cookie settings">Cookie settings</CookieSettingsButton></div></div>
          </div>
        </div>
      </footer>
    </main>
  );
}
