import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  BadgeCheck,
  CalendarCheck2,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  FolderLock,
  Layers3,
  Link2,
  ListTodo,
  LockKeyhole,
  MinusCircle,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Video,
  WalletCards,
  Workflow,
  XCircle
} from "lucide-react";
import CountrySelector from "@/components/country-selector";

export const metadata: Metadata = {
  title: {
    absolute: "Conventus vs Cal.com, Google Drive & Jira | The Unified Workspace"
  },
  description:
    "Compare Conventus with separate scheduling, cloud storage, and task-management tools. Explore workflow coverage, estimated per-seat costs, and the unified workspace approach."
};

type Support = "yes" | "partial" | "no";

type ComparisonCell = {
  support: Support;
  detail: string;
};

type ComparisonRow = {
  feature: string;
  conventus: ComparisonCell;
  cal: ComparisonCell;
  drive: ComparisonCell;
  jira: ComparisonCell;
};

type ComparisonGroup = {
  category: string;
  description: string;
  rows: ComparisonRow[];
};

const yes = (detail: string): ComparisonCell => ({ support: "yes", detail });
const partial = (detail: string): ComparisonCell => ({ support: "partial", detail });
const no = (detail = "Not included in this product's core purpose"): ComparisonCell => ({ support: "no", detail });

const comparisonGroups: ComparisonGroup[] = [
  {
    category: "01 · Client scheduling & meetings",
    description: "From the first request to a meeting a real employee has agreed to attend.",
    rows: [
      {
        feature: "Branded company booking portal",
        conventus: yes("Built-in public company URL"),
        cal: yes("Team booking pages"),
        drive: no(),
        jira: no()
      },
      {
        feature: "Guarded employee acceptance",
        conventus: yes("Explicit accept / decline before confirmation"),
        cal: partial("Routing and workflows depend on configuration"),
        drive: no(),
        jira: no()
      },
      {
        feature: "Virtual meeting room link",
        conventus: yes("Created after meeting acceptance"),
        cal: partial("Uses configured meeting-provider integrations"),
        drive: no(),
        jira: no()
      },
      {
        feature: "Verified client sign-in",
        conventus: yes("Required on published company booking pages"),
        cal: partial("Authentication depends on booking flow and plan"),
        drive: no("Drive sign-in is not a public booking verification flow"),
        jira: no()
      }
    ]
  },
  {
    category: "02 · File storage & client documents",
    description: "Keep client documents connected to the team and workflow they belong to.",
    rows: [
      {
        feature: "Private company cloud vault",
        conventus: yes("Built in · /dashboard/vault"),
        cal: no(),
        drive: yes("Standalone file storage"),
        jira: partial("Issue attachments")
      },
      {
        feature: "In-browser document & PDF preview",
        conventus: yes("Native Vault preview"),
        cal: no(),
        drive: yes("File preview available"),
        jira: partial("Attachment preview depends on file type")
      },
      {
        feature: "Shared company scope across bookings, tasks & files",
        conventus: yes("One company workspace boundary"),
        cal: partial("Scheduling workspace scope"),
        drive: partial("Separate storage and sharing controls"),
        jira: partial("Separate project and site permissions")
      }
    ]
  },
  {
    category: "03 · Task management & delegation",
    description: "Move from a confirmed client conversation to accountable follow-up.",
    rows: [
      {
        feature: "Availability-aware task routing",
        conventus: yes("Uses team status and availability rules"),
        cal: no(),
        drive: no(),
        jira: partial("Can be configured with workflows and automation")
      },
      {
        feature: "Kanban & priority task board",
        conventus: yes("Built in · /dashboard/tasks"),
        cal: no(),
        drive: no(),
        jira: yes("Boards and configurable workflows")
      },
      {
        feature: "Task follow-up connected to meetings",
        conventus: yes("Connected company workflow"),
        cal: partial("Usually needs an additional workflow or integration"),
        drive: partial("Manual follow-up or external automation"),
        jira: partial("Connected through project setup or integration")
      }
    ]
  },
  {
    category: "04 · Security, billing & operations",
    description: "Reduce day-to-day administration spread across tools and account boundaries.",
    rows: [
      {
        feature: "Company-level data scope",
        conventus: yes("Company-scoped workspace access"),
        cal: partial("Scheduling account and team permissions"),
        drive: partial("Separate drive and sharing permissions"),
        jira: partial("Separate site and project permissions")
      },
      {
        feature: "One-page corporate PDF invoices",
        conventus: yes("Built-in billing invoice workflow"),
        cal: partial("Depends on subscription and billing setup"),
        drive: no("Not a billing product"),
        jira: no("Not a billing product")
      },
      {
        feature: "Platform-wide & targeted company announcements",
        conventus: yes("Broadcast or target client workspaces"),
        cal: no(),
        drive: partial("Can share documents, not a platform announcement feed"),
        jira: partial("Can configure project notifications")
      },
      {
        feature: "Extensible company workflow",
        conventus: yes("One workspace for connected operational modules"),
        cal: partial("Scheduling-centered integrations"),
        drive: partial("Storage-centered integrations"),
        jira: partial("Task-centered apps and integrations")
      }
    ]
  }
];

function ComparisonStatus({ cell, emphasized = false }: { cell: ComparisonCell; emphasized?: boolean }) {
  const Icon = cell.support === "yes" ? CheckCircle2 : cell.support === "partial" ? MinusCircle : XCircle;
  const iconTone =
    cell.support === "yes"
      ? "text-emerald-700"
      : cell.support === "partial"
        ? "text-amber-700"
        : "text-rose-600";
  const labelTone =
    cell.support === "yes"
      ? "text-emerald-800"
      : cell.support === "partial"
        ? "text-amber-800"
        : "text-rose-700";

  return (
    <div className="flex min-w-[128px] items-start gap-2.5">
      <Icon className={"mt-0.5 size-4 shrink-0 " + iconTone} aria-hidden="true" />
      <span className={"text-xs leading-5 " + (emphasized ? "font-semibold text-slate-800" : "text-slate-600")}>
        <span className={"mr-1 font-semibold " + labelTone}>
          {cell.support === "yes" ? "Supported" : cell.support === "partial" ? "Partial" : "No"}
        </span>
        <span>{cell.detail}</span>
      </span>
    </div>
  );
}

const competitorNotes = [
  {
    eyebrow: "Scheduling",
    title: "Conventus vs Cal.com",
    description:
      "A booking link is only the start. Conventus connects the request to employee acceptance, the confirmed meeting, follow-up tasks, and company files without making separate tools the center of the workflow.",
    points: ["Acceptance before confirmation", "Follow-up stays in the workspace", "No separate workflow glue just to store meeting files"],
    icon: CalendarCheck2,
    accent: "blue"
  },
  {
    eyebrow: "Documents",
    title: "Conventus vs Google Drive & Dropbox",
    description:
      "A separate drive is useful for storage, but it creates another place to manage access and share links. The Conventus Vault keeps documents with the company workspace and supports in-browser PDF and file preview.",
    points: ["Structured private company folders", "Preview documents in the Vault", "Keep files alongside client operations"],
    icon: FolderLock,
    accent: "emerald"
  },
  {
    eyebrow: "Task management",
    title: "Conventus vs Jira & Asana",
    description:
      "Dedicated task tools offer deep project configuration. Conventus focuses on the operational handoff: assign priorities, account for employee availability, and keep next steps close to the client workflow.",
    points: ["Kanban and list-style task work", "Priority labels for team follow-up", "Team-status-aware assignments"],
    icon: ListTodo,
    accent: "violet"
  }
] as const;

export default function ComparePage() {
  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200/90 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[72px] max-w-7xl items-center justify-between gap-4 px-5 sm:px-6 lg:px-8">
          <Link href="/" className="flex shrink-0 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
            <span className="grid size-10 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <Image src="/favicon.svg" alt="" width={40} height={40} className="size-full object-contain" priority />
            </span>
            <span className="text-sm font-bold tracking-tight text-slate-950">Conventus</span>
          </Link>

          <nav aria-label="Main navigation" className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
            <Link href="/" className="rounded-lg px-1.5 py-2 transition hover:text-blue-700">Home</Link>
            <Link href="/#features" className="rounded-lg px-1.5 py-2 transition hover:text-blue-700">Features</Link>
            <Link href="/#pricing" className="rounded-lg px-1.5 py-2 transition hover:text-blue-700">Pricing</Link>
            <Link href="/compare" aria-current="page" className="rounded-lg px-1.5 py-2 font-semibold text-blue-700">Compare</Link>
          </nav>

          <div className="flex items-center gap-2">
            <CountrySelector className="[&_button]:h-9 [&_button]:px-2.5 [&_button]:text-xs" />
            <Link href="/login" className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Sign in</Link>
          </div>
        </div>
      </header>

      <section className="relative isolate overflow-hidden border-b border-slate-200/90 bg-[#faf9f1]">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_12%_0%,rgba(37,99,235,0.12),transparent_35%),radial-gradient(ellipse_at_88%_18%,rgba(245,158,11,0.13),transparent_30%)]" />
        <div className="mx-auto max-w-7xl px-5 pb-14 pt-14 sm:px-6 sm:pb-20 sm:pt-20 lg:px-8 lg:pb-24 lg:pt-24">
          <div className="mx-auto max-w-4xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-200/80 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-900">
              <Layers3 className="size-4 text-amber-700" />
              Tool Consolidation &amp; Cost Comparison
            </span>
            <h1 className="mt-6 text-4xl font-semibold leading-[1.07] tracking-[-0.045em] text-slate-950 sm:text-5xl lg:text-6xl">
              Stop paying for 3 separate platforms. Run your entire client workflow in Conventus.
            </h1>
            <p className="mx-auto mt-6 max-w-3xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
              Instead of juggling scheduling tools, separate document drives, and disconnected task boards, Conventus unifies customer booking, team task delegation, and private file storage into one seamless workspace.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/login" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/15 transition hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
                Start free trial <ArrowRight className="size-4" />
              </Link>
              <a href="#comparison-table" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3.5 text-sm font-semibold text-slate-800 transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
                View full comparison table <ArrowDownRight className="size-4" />
              </a>
            </div>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-2 text-xs font-medium text-slate-600">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/90 px-3 py-1.5"><ShieldCheck className="size-3.5 text-emerald-700" /> One company workspace</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/90 px-3 py-1.5"><CalendarCheck2 className="size-3.5 text-blue-700" /> Booking to follow-up</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/90 px-3 py-1.5"><FolderLock className="size-3.5 text-violet-700" /> Private company Vault</span>
            </div>
          </div>
        </div>
      </section>

      <section aria-label="Estimated tool costs" className="border-b border-slate-200/90 bg-white">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <div className="mb-7 text-center">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">The hidden cost of tool sprawl</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Three subscriptions. Three places to do the work.</h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-600">Illustrative US list-price comparison for common paid team tiers. Your actual price depends on seat count, plan, billing term, region, and taxes.</p>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-stretch">
              <article className="rounded-3xl border border-rose-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-rose-700">
                      <CircleDollarSign className="size-3.5" /> Fragmented stack
                    </span>
                    <h3 className="mt-4 text-xl font-semibold tracking-tight text-slate-950">Three paid tools</h3>
                  </div>
                  <span className="grid size-11 place-items-center rounded-2xl bg-rose-50 text-rose-700"><WalletCards className="size-5" /></span>
                </div>
                <div className="mt-5 divide-y divide-slate-100">
                  <div className="flex items-center justify-between gap-3 py-3">
                    <div><p className="text-sm font-semibold text-slate-800">Cal.com Teams</p><p className="mt-0.5 text-xs text-slate-500">Scheduling per seat</p></div>
                    <p className="whitespace-nowrap text-sm font-semibold text-slate-900">$12–$16</p>
                  </div>
                  <div className="flex items-center justify-between gap-3 py-3">
                    <div><p className="text-sm font-semibold text-slate-800">Google Workspace Starter</p><p className="mt-0.5 text-xs text-slate-500">Drive-enabled business storage</p></div>
                    <p className="whitespace-nowrap text-sm font-semibold text-slate-900">$7–$8.40</p>
                  </div>
                  <div className="flex items-center justify-between gap-3 py-3">
                    <div><p className="text-sm font-semibold text-slate-800">Jira Standard</p><p className="mt-0.5 text-xs text-slate-500">Task and project management</p></div>
                    <p className="whitespace-nowrap text-sm font-semibold text-slate-900">~$7.91</p>
                  </div>
                </div>
                <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
                  <p className="text-xs font-semibold text-rose-800">Estimated combined range</p>
                  <p className="mt-1 text-3xl font-semibold tracking-tight text-rose-700">$26–$41+</p>
                  <p className="mt-1 text-xs leading-5 text-rose-800">Per user / month for a common three-tool stack. Higher tiers, add-ons, or alternative task tools can increase the total.</p>
                </div>
                <div className="mt-4 grid gap-2 text-xs text-slate-600">
                  <p className="flex items-center gap-2"><XCircle className="size-4 shrink-0 text-rose-600" /> Separate logins and invoices</p>
                  <p className="flex items-center gap-2"><XCircle className="size-4 shrink-0 text-rose-600" /> Repeated access and sharing controls</p>
                  <p className="flex items-center gap-2"><XCircle className="size-4 shrink-0 text-rose-600" /> Manual handoffs between tools</p>
                </div>
              </article>

              <div className="flex items-center justify-center py-1 lg:px-1">
                <span className="grid size-12 place-items-center rounded-full border border-blue-200 bg-blue-50 text-blue-700"><ArrowRight className="size-5 rotate-90 lg:rotate-0" /></span>
              </div>

              <article className="relative rounded-3xl border-2 border-blue-300 bg-blue-50/60 p-5 shadow-[0_18px_52px_rgba(37,99,235,0.10)] sm:p-6">
                <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-blue-600 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-white"><Sparkles className="size-3.5" /> Unified choice</span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-white px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-blue-700">
                  <Layers3 className="size-3.5" /> The Conventus approach
                </span>
                <h3 className="mt-4 text-xl font-semibold tracking-tight text-slate-950">One connected workspace</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">Start with a Free tier, then choose a plan based on your company's actual team size and usage needs.</p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  {[
                    { title: "One workspace", text: "Booking, accepted meetings, tasks, and Vault files", icon: Workflow },
                    { title: "One billing path", text: "Plan usage and invoice records in context", icon: FileText },
                    { title: "One company scope", text: "Keep daily operations aligned to the workspace", icon: LockKeyhole },
                    { title: "Fewer handoffs", text: "Reduce copy-paste and integration glue", icon: Link2 }
                  ].map((item) => {
                    const ItemIcon = item.icon;
                    return (
                      <div key={item.title} className="flex items-start gap-2.5 rounded-2xl border border-blue-100 bg-white p-3">
                        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><ItemIcon className="size-4" /></span>
                        <div><p className="text-xs font-semibold text-slate-900">{item.title}</p><p className="mt-1 text-[11px] leading-4 text-slate-600">{item.text}</p></div>
                      </div>
                    );
                  })}
                </div>
                <Link href="/#pricing" className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
                  Explore Conventus plans <ArrowRight className="size-4" />
                </Link>
              </article>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] leading-5 text-slate-600">
                Pricing references (USD, before taxes): <a href="https://next.cal.com/pricing" target="_blank" rel="noreferrer" className="font-semibold text-blue-700 underline decoration-blue-200 underline-offset-2">Cal.com Teams</a> lists $12 per user/month on annual billing; <a href="https://workspace.google.com/pricing?hl=en_in" target="_blank" rel="noreferrer" className="font-semibold text-blue-700 underline decoration-blue-200 underline-offset-2">Google Workspace</a> lists Starter from $7 per user/month on annual billing and $8.40 on flexible billing in the US; <a href="https://www.atlassian.com/software/jira/jira/pricing" target="_blank" rel="noreferrer" className="font-semibold text-blue-700 underline decoration-blue-200 underline-offset-2">Jira Standard</a> lists pricing from about $7.91 per user/month. <a href="https://asana.com/pricing" target="_blank" rel="noreferrer" className="font-semibold text-blue-700 underline decoration-blue-200 underline-offset-2">Asana Starter</a> is another task-tool alternative, listed at $10.99 per user/month on annual billing. These are snapshots of public list pricing, not a quote or a claim that all plans have identical features. Vendor prices change; verify current terms before purchasing.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="comparison-table" className="scroll-mt-24 border-b border-slate-200/90 bg-[#faf9f1]">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-6 sm:py-20 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Feature-by-feature</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Compare the whole workflow, not just one feature.</h2>
            <p className="mt-4 text-sm leading-6 text-slate-600">Scroll horizontally on smaller screens. Status describes common product capabilities and configurations, not every edition, add-on, or integration available from each vendor.</p>
          </div>

          <div className="mt-8 flex flex-wrap gap-2 text-[11px] font-medium">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-emerald-800"><CheckCircle2 className="size-3.5" /> Built in / supported</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-amber-800"><MinusCircle className="size-3.5" /> Partial / configuration needed</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-rose-700"><XCircle className="size-3.5" /> Not a core feature</span>
          </div>

          <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200/90 bg-white shadow-sm" tabIndex={0} role="region" aria-label="Scrollable feature comparison table">
            <table className="w-full min-w-[1040px] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200">
                  <th scope="col" className="sticky left-0 z-20 w-[245px] bg-slate-50 p-4 text-xs font-bold uppercase tracking-[0.12em] text-slate-600">Feature</th>
                  <th scope="col" className="w-[245px] border-x border-blue-200 bg-blue-600 p-4 text-white">
                    <span className="flex items-center gap-2 text-sm font-bold"><BadgeCheck className="size-4" /> Conventus</span>
                    <span className="mt-1 block text-[10px] font-medium text-blue-100">Unified workspace</span>
                  </th>
                  <th scope="col" className="w-[190px] bg-white p-4 text-sm font-semibold text-slate-800">Cal.com<span className="mt-1 block text-[10px] font-normal text-slate-500">Scheduling</span></th>
                  <th scope="col" className="w-[205px] bg-white p-4 text-sm font-semibold text-slate-800">Google Drive<span className="mt-1 block text-[10px] font-normal text-slate-500">Dropbox alternative</span></th>
                  <th scope="col" className="w-[205px] bg-white p-4 text-sm font-semibold text-slate-800">Jira<span className="mt-1 block text-[10px] font-normal text-slate-500">Asana alternative</span></th>
                </tr>
              </thead>
              {comparisonGroups.map((group) => (
                <tbody key={group.category}>
                  <tr className="border-y border-slate-200 bg-[#faf9f1]">
                    <th scope="colgroup" colSpan={5} className="px-4 py-3 text-left">
                      <span className="block text-xs font-bold uppercase tracking-[0.12em] text-slate-800">{group.category}</span>
                      <span className="mt-1 block text-xs font-normal normal-case tracking-normal text-slate-500">{group.description}</span>
                    </th>
                  </tr>
                  {group.rows.map((row) => (
                    <tr key={row.feature} className="border-b border-slate-100 last:border-b-0">
                      <th scope="row" className="sticky left-0 z-10 bg-white p-4 align-top text-xs font-semibold leading-5 text-slate-900">{row.feature}</th>
                      <td className="border-x border-blue-100 bg-blue-50/60 p-4 align-top"><ComparisonStatus cell={row.conventus} emphasized /></td>
                      <td className="p-4 align-top"><ComparisonStatus cell={row.cal} /></td>
                      <td className="p-4 align-top"><ComparisonStatus cell={row.drive} /></td>
                      <td className="p-4 align-top"><ComparisonStatus cell={row.jira} /></td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
          <p className="mt-3 text-[11px] leading-5 text-slate-500">Feature notes reflect common paid-team configurations as reviewed in October 2026. Specific capabilities can vary by plan, account configuration, and connected services.</p>
        </div>
      </section>

      <section className="border-b border-slate-200/90 bg-white">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Why consolidate?</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Spend less time connecting your tools together.</h2>
            <p className="mt-4 text-sm leading-6 text-slate-600">Specialist apps can be useful. The friction appears when every client journey depends on keeping several accounts, permissions, records, and handoffs in sync.</p>
          </div>

          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {competitorNotes.map((item) => {
              const NoteIcon = item.icon;
              const iconClass = item.accent === "emerald" ? "bg-emerald-50 text-emerald-700" : item.accent === "violet" ? "bg-violet-50 text-violet-700" : "bg-blue-50 text-blue-700";
              return (
                <article key={item.title} className="rounded-2xl border border-slate-200/90 bg-white p-6 transition-all hover:-translate-y-0.5 hover:shadow-md">
                  <span className={"grid size-12 place-items-center rounded-2xl " + iconClass}><NoteIcon className="size-5" /></span>
                  <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">{item.eyebrow}</p>
                  <h3 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">{item.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{item.description}</p>
                  <div className="mt-5 grid gap-2.5">
                    {item.points.map((point) => <p key={point} className="flex items-start gap-2 text-xs leading-5 text-slate-700"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-700" />{point}</p>)}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-[#f8fafc]">
        <div className="mx-auto max-w-7xl px-5 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-blue-600 p-7 shadow-[0_24px_70px_rgba(37,99,235,0.24)] sm:p-10 lg:p-12">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_90%_0%,rgba(250,204,21,0.26),transparent_30%),radial-gradient(circle_at_0%_100%,rgba(255,255,255,0.12),transparent_42%)]" />
            <div className="relative flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-2xl">
                <span className="inline-flex items-center gap-2 rounded-full border border-amber-200/50 bg-amber-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-amber-900">
                  <Sparkles className="size-3.5" /> One workspace, fewer handoffs
                </span>
                <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-[-0.035em] text-white sm:text-4xl">Ready to simplify your workspace and explore how much you could save?</h2>
                <p className="mt-3 text-sm leading-6 text-blue-100">Start on the Free tier. Compare the plan limits with your actual workflow before replacing any paid tools.</p>
              </div>
              <div className="flex shrink-0 flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
                <Link href="/login" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-blue-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-blue-600">
                  Get started with Conventus <ArrowRight className="size-4" />
                </Link>
                <Link href="/#pricing" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/30 bg-blue-700/30 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-blue-600">
                  Explore all plans
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200/90 bg-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-10 text-sm text-slate-500 sm:px-6 md:grid-cols-[1.1fr_2fr] lg:px-8">
          <div>
            <Link href="/" className="inline-flex items-center gap-3 font-semibold text-slate-950">
              <span className="grid size-9 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-white"><Image src="/favicon.svg" alt="" width={36} height={36} className="size-full object-contain" /></span>
              <span>Conventus</span>
            </Link>
            <p className="mt-4 max-w-sm text-xs leading-5 text-slate-500">Client booking, team routing, task delegation, private files, and company operations in one cohesive workspace.</p>
          </div>
          <div className="grid gap-8 sm:grid-cols-3">
            <div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Product</p><div className="mt-3 grid gap-2.5"><Link href="/" className="rounded-lg py-1 hover:text-blue-700">Home</Link><Link href="/#features" className="rounded-lg py-1 hover:text-blue-700">Features</Link><Link href="/#pricing" className="rounded-lg py-1 hover:text-blue-700">Pricing</Link><Link href="/compare" className="rounded-lg py-1 font-semibold text-blue-700 hover:text-blue-800">Conventus vs Cal.com &amp; Jira</Link></div></div>
            <div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Workspace</p><div className="mt-3 grid gap-2.5"><Link href="/dashboard" className="rounded-lg py-1 hover:text-blue-700">Open dashboard</Link><Link href="/dashboard/tasks" className="rounded-lg py-1 hover:text-blue-700">Team tasks</Link><Link href="/dashboard/vault" className="rounded-lg py-1 hover:text-blue-700">Company Vault</Link></div></div>
            <div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Account</p><div className="mt-3 grid gap-2.5"><Link href="/login" className="rounded-lg py-1 hover:text-blue-700">Sign in</Link><Link href="/" className="rounded-lg py-1 hover:text-blue-700">Return home</Link></div></div>
          </div>
        </div>
      </footer>
    </main>
  );
}
