"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight, BookOpen, CalendarCheck2, Check, ChevronDown, ClipboardCopy, Code2,
  ExternalLink, FolderLock, ListTodo, LockKeyhole, Menu, MessageCircle,
  Search, ShieldCheck, Sparkles, X
} from "lucide-react";

type NavItem = { id: string; label: string; description: string; keywords: string };
type NavGroup = { label: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    label: "Getting Started",
    items: [
      { id: "overview", label: "Platform overview", description: "How the workspace fits together", keywords: "introduction conventus platform" },
      { id: "workspace-setup", label: "Workspace setup", description: "Prepare your team", keywords: "setup onboarding company admin" }
    ]
  },
  {
    label: "Core Features",
    items: [
      { id: "scheduling", label: "Client scheduling", description: "Booking and employee acceptance", keywords: "calendar meetings availability clients booking" },
      { id: "tasks", label: "Task management", description: "Delegate and track team work", keywords: "kanban tasks project assignment priorities" },
      { id: "vault", label: "Company Vault", description: "Store and preview company documents", keywords: "cloud files documents contracts pdf folders" },
      { id: "live-chat", label: "Live Chat", description: "Website messaging and support", keywords: "widget visitors customers embed conversations" }
    ]
  },
  {
    label: "Security & Multi-Tenancy",
    items: [
      { id: "data-isolation", label: "Data isolation", description: "Keep company data in its tenant", keywords: "security tenant isolation privacy access" },
      { id: "quotas-permissions", label: "Quotas & permissions", description: "Plans, limits, and roles", keywords: "plans quotas permissions limits roles" }
    ]
  }
];

const onThisPage = [
  { id: "overview", label: "Platform overview" },
  { id: "workspace-setup", label: "Workspace setup" },
  { id: "scheduling", label: "Scheduling" },
  { id: "scheduling-admin", label: "Scheduling setup" },
  { id: "scheduling-employees", label: "Employee workflow" },
  { id: "scheduling-clients", label: "Client experience" },
  { id: "tasks", label: "Task management" },
  { id: "tasks-admin", label: "Admin workflow" },
  { id: "tasks-employees", label: "Employee workflow" },
  { id: "vault", label: "Company Vault" },
  { id: "vault-admin", label: "Vault administration" },
  { id: "vault-employees", label: "Working with files" },
  { id: "live-chat", label: "Live Chat" },
  { id: "chat-admin", label: "Widget setup" },
  { id: "chat-agents", label: "Agent workflow" },
  { id: "chat-visitors", label: "Visitor experience" },
  { id: "data-isolation", label: "Data isolation" },
  { id: "quotas-permissions", label: "Quotas & permissions" },
  { id: "faq", label: "FAQ" }
];

function DocHeading({ id, level = "h2", children }: { id: string; level?: "h2" | "h3"; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const Tag = level;
  const copyLink = async () => {
    const url = new URL(window.location.href);
    url.hash = id;
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      window.location.hash = id;
    }
  };
  return (
    <Tag id={id} className={`group scroll-mt-28 flex items-start gap-2 font-semibold tracking-tight text-slate-950 ${level === "h2" ? "mt-12 text-2xl sm:text-3xl" : "mt-7 text-lg sm:text-xl"}`}>
      <span>{children}</span>
      <button type="button" onClick={() => void copyLink()} aria-label={`Copy link to ${String(children)}`} title={copied ? "Copied link" : "Copy section link"} className="mt-1 inline-flex rounded-md p-1 text-slate-400 opacity-0 transition hover:bg-blue-50 hover:text-blue-700 focus:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 group-hover:opacity-100">
        {copied ? <Check className="size-4" /> : <ExternalLink className="size-4" />}
      </button>
    </Tag>
  );
}

function Callout({ kind, title, children }: { kind: "tip" | "note" | "security"; title: string; children: React.ReactNode }) {
  const styles = {
    tip: "border-emerald-200 bg-emerald-50 text-emerald-950",
    note: "border-blue-200 bg-blue-50 text-blue-950",
    security: "border-amber-200 bg-amber-50 text-amber-950"
  };
  const labels = { tip: "Best practice", note: "Note", security: "Important · Security" };
  return (
    <aside className={`my-6 rounded-2xl border p-4 sm:p-5 ${styles[kind]}`} aria-label={labels[kind]}>
      <p className="text-xs font-bold uppercase tracking-[0.12em] opacity-80">{labels[kind]}</p>
      <p className="mt-1 text-sm font-semibold">{title}</p>
      <div className="mt-1 text-sm leading-6 opacity-90">{children}</div>
    </aside>
  );
}

function StepList({ steps }: { steps: { title: string; text: string }[] }) {
  return (
    <ol className="my-5 space-y-4">
      {steps.map((step, index) => (
        <li key={step.title} className="flex gap-3.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-full border-2 border-blue-200 bg-blue-50 text-xs font-bold text-blue-800">{index + 1}</span>
          <div className="min-w-0 pt-0.5"><p className="text-sm font-semibold text-slate-900">{step.title}</p><p className="mt-1 text-sm leading-6 text-slate-600">{step.text}</p></div>
        </li>
      ))}
    </ol>
  );
}

function FeatureCard({ icon: Icon, eyebrow, title, description, id }: { icon: typeof CalendarCheck2; eyebrow: string; title: string; description: string; id: string }) {
  return (
    <a href={`#${id}`} className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:p-5">
      <span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><Icon className="size-5" /></span>
      <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.13em] text-blue-700">{eyebrow}</p>
      <h3 className="mt-1 text-base font-semibold text-slate-950">{title}</h3>
      <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">{description}</p>
      <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700">Read guide <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" /></span>
    </a>
  );
}

export default function PublicDocs() {
  const [query, setQuery] = useState("");
  const [activeSection, setActiveSection] = useState("overview");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [copiedEmbed, setCopiedEmbed] = useState(false);
  const normalizedQuery = query.trim().toLowerCase();

  const filteredGroups = useMemo(() => navGroups.map((group) => ({
    ...group,
    items: group.items.filter((item) =>
      !normalizedQuery ||
      `${item.label} ${item.description} ${item.keywords}`.toLowerCase().includes(normalizedQuery)
    )
  })).filter((group) => group.items.length > 0), [normalizedQuery]);

  const activeLabel = onThisPage.find((item) => item.id === activeSection)?.label ?? "On this page";

  useEffect(() => {
    const nodes = onThisPage.map((item) => document.getElementById(item.id)).filter((node): node is HTMLElement => Boolean(node));
    if (!("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]?.target.id) setActiveSection(visible[0].target.id);
    }, { rootMargin: "-16% 0px -70% 0px", threshold: 0 });
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  const copyEmbed = async () => {
    const text = '<script src="https://YOUR-CONVENTUS-HOST/live-chat.js" data-company="your-company-slug" data-position="right" async></script>';
    try {
      await navigator.clipboard.writeText(text);
      setCopiedEmbed(true);
      window.setTimeout(() => setCopiedEmbed(false), 1500);
    } catch {
      setCopiedEmbed(false);
    }
  };

  const renderNavigation = (mobile = false) => (
    <div className="space-y-5">
      {filteredGroups.length === 0 && <p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">No topics match “{query}”. Try “calendar”, “tasks”, “vault”, or “chat”.</p>}
      {filteredGroups.map((group) => (
        <div key={group.label}>
          <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.13em] text-slate-400">{group.label}</p>
          <nav aria-label={group.label} className="space-y-1">
            {group.items.map((item) => (
              <a key={item.id} href={`#${item.id}`} onClick={() => { setActiveSection(item.id); if (mobile) setMobileNavOpen(false); }} className={`block rounded-xl border-l-2 px-3 py-2.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${activeSection === item.id ? "border-blue-600 bg-blue-50 text-blue-800" : "border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-950"}`}>
                <span className="block text-sm font-semibold">{item.label}</span>
                <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{item.description}</span>
              </a>
            ))}
          </nav>
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-950">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[64px] max-w-[1600px] items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex shrink-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            <span className="grid size-9 place-items-center rounded-xl bg-blue-600 text-white"><BookOpen className="size-4.5" /></span>
            <span className="text-sm font-bold tracking-tight text-slate-950">Conventus <span className="font-medium text-slate-400">Docs</span></span>
          </Link>
          <div className="ml-auto hidden w-full max-w-md lg:block">
            <label className="relative block">
              <span className="sr-only">Search documentation topics</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search documentation…" className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100" />
            </label>
          </div>
          <Link href="/" className="hidden rounded-xl px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 sm:inline-flex">Back to home</Link>
          <Link href="/login" className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><span className="hidden sm:inline">Open workspace</span><span className="sm:hidden">Sign in</span><ArrowRight className="size-3.5" /></Link>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 border-b border-slate-200 py-3 lg:hidden">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search documentation topics</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search topics…" className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
          </label>
          <button type="button" onClick={() => setMobileNavOpen((value) => !value)} aria-expanded={mobileNavOpen} aria-controls="mobile-docs-nav" className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            {mobileNavOpen ? <X className="size-4" /> : <Menu className="size-4" />} On this page <ChevronDown className={`size-3.5 transition ${mobileNavOpen ? "rotate-180" : ""}`} />
          </button>
        </div>
        {mobileNavOpen && <div id="mobile-docs-nav" className="border-b border-slate-200 py-4 lg:hidden">{renderNavigation(true)}</div>}

        <div className="grid items-start gap-8 xl:grid-cols-[230px_minmax(0,1fr)] xl:gap-12 2xl:grid-cols-[250px_minmax(0,1fr)_190px] 2xl:gap-12">
          <aside className="sticky top-[88px] hidden max-h-[calc(100vh-110px)] overflow-y-auto py-8 pr-2 xl:block" aria-label="Documentation sidebar">
            <label className="relative mb-7 block">
              <span className="sr-only">Search documentation topics</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter topics…" className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-800 outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </label>
            {renderNavigation()}
            <div className="mt-8 rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
              <p className="text-xs font-semibold text-blue-950">Need a workspace?</p>
              <p className="mt-1 text-xs leading-5 text-blue-900/80">Sign in to configure your team and enabled features.</p>
              <Link href="/login" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-blue-800">Get started <ArrowRight className="size-3.5" /></Link>
            </div>
          </aside>

          <main className="min-w-0 max-w-4xl py-7 sm:py-10 xl:py-12">
            <div className="mb-7 flex items-center gap-2 text-xs font-medium text-slate-500"><Link href="/" className="hover:text-blue-700">Home</Link><span>/</span><span className="text-slate-800">Documentation</span></div>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-bold text-blue-800"><Sparkles className="size-3.5" /> Workspace guides</div>
            <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-[-0.04em] text-slate-950 sm:text-5xl">Conventus Documentation</h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">Everything your team needs to coordinate client meetings, delegate work, protect company files, and support website visitors—from setup through daily operation.</p>
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              <FeatureCard id="scheduling" icon={CalendarCheck2} eyebrow="Client experience" title="Scheduling & acceptance" description="Share a booking page, route requests to eligible teammates, and confirm meetings only after acceptance." />
              <FeatureCard id="tasks" icon={ListTodo} eyebrow="Team operations" title="Tasks & delegation" description="Assign work, set priorities and due dates, and track progress with a shared workflow." />
              <FeatureCard id="vault" icon={FolderLock} eyebrow="Private documents" title="Company Vault" description="Organize company files and preview supported documents inside the protected workspace." />
              <FeatureCard id="live-chat" icon={MessageCircle} eyebrow="Customer support" title="Public Live Chat" description="Embed a branded website widget and respond to customer conversations from the agent inbox." />
            </div>

            <section className="mt-12 border-b border-slate-200 pb-10" aria-labelledby="overview-heading">
              <DocHeading id="overview">Platform overview</DocHeading>
              <p className="mt-4 text-sm leading-7 text-slate-700 sm:text-base">Conventus is a company workspace that connects the customer-facing booking experience with internal delivery. Scheduling, task management, document storage and website chat share company and workspace access rules, so teams can keep work connected without treating every feature as a separate tool.</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-center gap-2"><CalendarCheck2 className="size-4 text-blue-700" /><p className="text-sm font-semibold">Bring meetings into the workflow</p></div><p className="mt-2 text-xs leading-5 text-slate-600">Review requests and acceptance, then keep follow-up work and files alongside team activity.</p></div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-center gap-2"><ShieldCheck className="size-4 text-emerald-700" /><p className="text-sm font-semibold">Keep access scoped</p></div><p className="mt-2 text-xs leading-5 text-slate-600">Feature access depends on company membership, role permissions and the active plan.</p></div>
              </div>
            </section>

            <section className="border-b border-slate-200 py-4 pb-10" aria-labelledby="workspace-setup-heading">
              <DocHeading id="workspace-setup">Workspace setup</DocHeading>
              <p className="mt-4 text-sm leading-7 text-slate-700">A company administrator should prepare the workspace before inviting the rest of the team to use its tools.</p>
              <StepList steps={[
                { title: "Complete company settings", text: "Set the company identity and website, then confirm the appropriate workspace is active." },
                { title: "Invite the team and check roles", text: "Add employees to the correct workspace and give admin permissions only to people who need to manage settings." },
                { title: "Review plan entitlements", text: "Check which features are enabled and review quotas before rolling them out to the team." },
                { title: "Configure each feature", text: "Set booking hours, task ownership practices, vault folders, and allowed Live Chat website domains as applicable." }
              ]} />
              <Callout kind="note" title="Feature access is plan-aware.">If a feature is missing from the workspace, first check the assigned plan and the member's company/workspace access rather than assuming the page is broken.</Callout>
            </section>

            <section className="border-b border-slate-200 py-4 pb-10" aria-labelledby="scheduling-heading">
              <DocHeading id="scheduling">1. Client Scheduling & Meeting Acceptance</DocHeading>
              <p className="mt-4 text-sm leading-7 text-slate-700">Conventus pairs a public company booking page at <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.85em] text-slate-800">/{'{companySlug}'}</code> with employee availability and an explicit acceptance step. A request is not the same thing as a confirmed meeting: eligible employees review incoming requests before the time is finalized.</p>
              <DocHeading id="scheduling-why" level="h3">Why use it?</DocHeading>
              <p className="mt-2 text-sm leading-7 text-slate-700">The acceptance-gated flow helps reduce unwanted meetings and calendar conflicts. Customers can request a suitable slot while the team retains control over which requests become commitments.</p>
              <DocHeading id="scheduling-admin" level="h3">For companies and admins</DocHeading>
              <StepList steps={[
                { title: "Define hours and timezone", text: "Configure working availability for your team and confirm the workspace timezone so slot times are understandable to both sides." },
                { title: "Set meeting durations and buffers", text: "Enable the durations that match your process (commonly 15, 30, 45 or 60 minutes) and allow enough buffer for preparation or handover." },
                { title: "Check eligibility", text: "Keep employee membership and availability up to date so requests can be routed to the appropriate active teammates." }
              ]} />
              <DocHeading id="scheduling-employees" level="h3">For employees</DocHeading>
              <p className="mt-2 text-sm leading-7 text-slate-700">Connect calendar availability where supported, review new requests and customer details, then accept or decline within the response window. Once accepted, Conventus completes the configured confirmation workflow, including meeting details and calendar updates where enabled.</p>
              <DocHeading id="scheduling-clients" level="h3">For customers</DocHeading>
              <p className="mt-2 text-sm leading-7 text-slate-700">Open the company booking link, complete the required verification, choose a duration and an available time, and submit the request. Watch for the confirmation email before treating the meeting as booked.</p>
              <Callout kind="tip" title="Avoid phantom meetings.">Tell customers that a submitted request is pending until the responsible employee accepts it. This makes the confirmation boundary clear for everyone.</Callout>
            </section>

            <section className="border-b border-slate-200 py-4 pb-10" aria-labelledby="tasks-heading">
              <DocHeading id="tasks">2. Team Task Management & Delegation</DocHeading>
              <p className="mt-4 text-sm leading-7 text-slate-700">Task Management at <Link href="/dashboard/tasks" className="font-semibold text-blue-700 underline decoration-blue-200 underline-offset-4">/dashboard/tasks</Link> helps teams turn commitments into owned work. Use Kanban or list views to track task status, priority and due dates in one company workspace.</p>
              <DocHeading id="tasks-why" level="h3">Why use it?</DocHeading>
              <p className="mt-2 text-sm leading-7 text-slate-700">A shared task queue makes ownership visible and gives teams a place to track follow-ups instead of relying on scattered notes or detached task lists. Workspace availability information can help managers consider employee status when delegating.</p>
              <DocHeading id="tasks-admin" level="h3">For companies and admins</DocHeading>
              <StepList steps={[
                { title: "Create a clearly scoped task", text: "Write a specific title and description, then choose the responsible team member." },
                { title: "Set urgency and a due date", text: "Use Low, Medium, High or Urgent priority consistently and set realistic deadlines." },
                { title: "Review workload and plan limits", text: "Use team status to support assignments and check the current plan's task quota when managing capacity." }
              ]} />
              <DocHeading id="tasks-employees" level="h3">For employees</DocHeading>
              <p className="mt-2 text-sm leading-7 text-slate-700">Start from your assigned queue, keep task states up to date as work progresses from To Do to In Progress to Done, and create follow-up actions after customer meetings when that workflow is available.</p>
              <DocHeading id="tasks-customers" level="h3">For customers and collaborators</DocHeading>
              <p className="mt-2 text-sm leading-7 text-slate-700">Tasks are internal workspace work items rather than a public customer task board. Share customer commitments through the appropriate company communication channel, then track internal ownership in the task dashboard.</p>
              <Callout kind="note" title="Keep task status meaningful.">Agree on what “Done” means for your team, and break large deliverables into discrete actions with a named owner.</Callout>
            </section>

            <section className="border-b border-slate-200 py-4 pb-10" aria-labelledby="vault-heading">
              <DocHeading id="vault">3. Private Company Cloud Vault</DocHeading>
              <p className="mt-4 text-sm leading-7 text-slate-700">The Company Vault at <Link href="/dashboard/vault" className="font-semibold text-blue-700 underline decoration-blue-200 underline-offset-4">/dashboard/vault</Link> keeps company documents in a workspace-scoped library. Teams can organize supported files in folders, upload files and use in-browser previews for supported document types such as PDFs.</p>
              <DocHeading id="vault-why" level="h3">Why use it?</DocHeading>
              <p className="mt-2 text-sm leading-7 text-slate-700">A shared company vault helps reduce confusion about the current version of a proposal or contract and keeps working documents within the intended company access boundary.</p>
              <DocHeading id="vault-admin" level="h3">For companies and admins</DocHeading>
              <StepList steps={[
                { title: "Set folder conventions", text: "Choose a consistent naming pattern for clients, projects, contracts and final deliverables." },
                { title: "Review storage and permissions", text: "Monitor storage usage and confirm that company/workspace roles match the sensitivity of files stored." },
                { title: "Manage file lifecycle", text: "Use the available retention and deletion controls carefully; permanent deletion may not be reversible." }
              ]} />
              <DocHeading id="vault-employees" level="h3">For employees</DocHeading>
              <p className="mt-2 text-sm leading-7 text-slate-700">Upload files using the available upload flow, put each item in the agreed folder, preview supported documents in the browser and use the vault as the shared location for client deliverables.</p>
              <DocHeading id="vault-customers" level="h3">For customers and collaborators</DocHeading>
              <p className="mt-2 text-sm leading-7 text-slate-700">The vault is an internal workspace feature, not a public file-sharing link by default. Share a document with customers only through a company-approved channel and confirm that the intended recipients are authorized.</p>
              <Callout kind="security" title="Treat access as part of document handling.">Before uploading sensitive files, confirm who can access the workspace and follow your organization's retention and privacy requirements.</Callout>
            </section>

            <section className="border-b border-slate-200 py-4 pb-10" aria-labelledby="live-chat-heading">
              <DocHeading id="live-chat">4. Public Live Chat & Customer Support</DocHeading>
              <p className="mt-4 text-sm leading-7 text-slate-700">Live Chat combines an embeddable website widget with the agent inbox at <Link href="/dashboard/live-chat" className="font-semibold text-blue-700 underline decoration-blue-200 underline-offset-4">/dashboard/live-chat</Link>. Visitors can start a conversation without creating a Conventus account; agents respond from the company workspace.</p>
              <DocHeading id="chat-why" level="h3">Why use it?</DocHeading>
              <p className="mt-2 text-sm leading-7 text-slate-700">A branded launcher gives visitors a direct support path while keeping incoming chats alongside the team's other work. The widget uses visibility-aware polling, so it can pause unnecessary checks when a browser tab is hidden. Messages are near-real-time rather than guaranteed instant push delivery.</p>
              <DocHeading id="chat-admin" level="h3">For companies and admins: install and customize</DocHeading>
              <StepList steps={[
                { title: "Enable Live Chat for your plan", text: "A platform administrator controls plan entitlements. Confirm Live Chat is enabled for the company's assigned plan." },
                { title: "Allow the website domain", text: "In Workspace → Live Chat → Settings, enable the public widget and add the exact website hostname that will embed it." },
                { title: "Customize and save", text: "Set the title, welcome message, theme, brand color, position, appearance and any required pre-chat fields, then save." },
                { title: "Paste the embed snippet", text: "Copy the generated script into the website HTML before the closing body tag and load it from your configured Conventus host." }
              ]} />
              <div className="my-5 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
                <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-4 py-3"><div className="flex items-center gap-2 text-xs font-semibold text-slate-200"><Code2 className="size-4 text-blue-300" /> HTML embed</div><button type="button" onClick={() => void copyEmbed()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">{copiedEmbed ? <Check className="size-3.5" /> : <ClipboardCopy className="size-3.5" />}{copiedEmbed ? "Copied" : "Copy snippet"}</button></div>
                <pre className="overflow-x-auto p-4 text-xs leading-6 text-blue-100"><code>{'<script src="https://YOUR-CONVENTUS-HOST/live-chat.js" data-company="your-company-slug" data-position="right" async></script>'}</code></pre>
              </div>
              <p className="text-xs leading-5 text-slate-500">Replace the host and slug with the exact snippet generated in your Live Chat settings. The example is illustrative.</p>
              <DocHeading id="chat-agents" level="h3">For employees and support agents</DocHeading>
              <p className="mt-2 text-sm leading-7 text-slate-700">Open the Live Chat inbox, select a conversation, review available visitor and contact details, reply to the customer, and close conversations when they are resolved. Which details are available depends on the visitor's browser, hosting provider headers and configured contact collection.</p>
              <DocHeading id="chat-visitors" level="h3">For website visitors</DocHeading>
              <p className="mt-2 text-sm leading-7 text-slate-700">The visitor sees a floating launcher that opens a responsive chat panel. Depending on company settings, the visitor may be asked for a name, email address or phone number; anonymous chat is possible when those fields are not required.</p>
              <Callout kind="security" title="Domain allowlisting matters.">Only embed the widget on a hostname configured in the company settings. Include a privacy notice that explains chat processing and any visitor metadata collection that your deployment enables.</Callout>
            </section>

            <section className="border-b border-slate-200 py-4 pb-10" aria-labelledby="data-isolation-heading">
              <DocHeading id="data-isolation">Security & multi-tenancy: data isolation</DocHeading>
              <p className="mt-4 text-sm leading-7 text-slate-700">Conventus features are designed around a company and workspace boundary. Authenticated API routes validate the member session, workspace membership and applicable permissions; Live Chat's public APIs additionally validate the configured website origin and signed widget access tokens.</p>
              <div className="my-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4"><LockKeyhole className="size-5 text-blue-700" /><p className="mt-3 text-sm font-semibold">Scoped reads and writes</p><p className="mt-1 text-xs leading-5 text-slate-600">Queries should be constrained to the authorized company/workspace and resource, not a client-supplied identifier alone.</p></div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4"><ShieldCheck className="size-5 text-emerald-700" /><p className="mt-3 text-sm font-semibold">Public surface protections</p><p className="mt-1 text-xs leading-5 text-slate-600">Embed allowlists, token checks, request validation and server-enforced quotas help protect the public widget.</p></div>
              </div>
              <Callout kind="security" title="Do not put secrets in public snippets.">The embed script is public by design. Never add database credentials, authentication secrets or private API tokens to your website HTML.</Callout>
            </section>

            <section className="border-b border-slate-200 py-4 pb-10" aria-labelledby="quotas-heading">
              <DocHeading id="quotas-permissions">Quotas, plans & role permissions</DocHeading>
              <p className="mt-4 text-sm leading-7 text-slate-700">A platform administrator configures plan-level feature access and limits. A company administrator manages company-specific settings where permitted. Employees use the features enabled for their workspace, with access and available actions constrained by their role.</p>
              <div className="my-5 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                <table className="w-full min-w-[560px] border-collapse text-left text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-600"><tr><th className="px-4 py-3 font-semibold">Role</th><th className="px-4 py-3 font-semibold">Typical responsibility</th><th className="px-4 py-3 font-semibold">Access model</th></tr></thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    <tr><td className="px-4 py-3 font-semibold text-slate-900">Platform admin</td><td className="px-4 py-3">Manage platform plans and global controls</td><td className="px-4 py-3">Platform-level administration routes</td></tr>
                    <tr><td className="px-4 py-3 font-semibold text-slate-900">Company admin</td><td className="px-4 py-3">Manage company settings and team operations</td><td className="px-4 py-3">Authorized company/workspace scope</td></tr>
                    <tr><td className="px-4 py-3 font-semibold text-slate-900">Employee</td><td className="px-4 py-3">Handle assigned work and eligible conversations</td><td className="px-4 py-3">Membership, role and feature entitlements</td></tr>
                    <tr><td className="px-4 py-3 font-semibold text-slate-900">Public visitor</td><td className="px-4 py-3">Request meetings or start permitted website chat</td><td className="px-4 py-3">Public route, verification and origin/token checks</td></tr>
                  </tbody>
                </table>
              </div>
              <p className="text-sm leading-7 text-slate-700">Quota names and limits depend on the assigned plan and can change when plan settings are updated. Review the relevant dashboard meter or ask a platform administrator before large rollouts.</p>
            </section>

            <section className="py-4 pb-10" aria-labelledby="faq-heading">
              <DocHeading id="faq">Frequently asked questions</DocHeading>
              <div className="mt-5 space-y-3">
                {[
                  { q: "When is a meeting confirmed?", a: "After an eligible employee accepts the request. A submitted request should be treated as pending until confirmation arrives." },
                  { q: "Can an employee manage plan limits?", a: "Plan-level entitlements are managed by platform administrators. Company-level settings and daily actions are further limited by role." },
                  { q: "Can customers browse the Company Vault?", a: "The vault is an internal workspace feature by default. Public access should not be assumed; share documents only through an approved company workflow." },
                  { q: "Does Live Chat use WebSockets?", a: "The standard widget uses visibility-aware polling for near-real-time updates. It pauses network checks while the page is hidden instead of keeping a persistent socket open." },
                  { q: "Why does the public chat widget not appear?", a: "Confirm the plan enables Live Chat, the public widget is enabled in settings, the embed snippet points to the correct Conventus host, and the testing website's exact host is allowlisted." },
                  { q: "How do I get help?", a: "Ask your company administrator about workspace access or plan entitlements. For platform-level questions, use the support route provided by your organization." }
                ].map((item) => <details key={item.q} className="group rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-semibold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><span>{item.q}</span><ChevronDown className="size-4 shrink-0 text-slate-400 transition group-open:rotate-180" /></summary><p className="mt-3 text-sm leading-6 text-slate-600">{item.a}</p></details>)}
              </div>
            </section>

            <div className="mb-8 rounded-3xl border border-blue-200 bg-blue-50 p-5 sm:p-7">
              <p className="text-xs font-bold uppercase tracking-[0.13em] text-blue-800">Next step</p>
              <h2 className="mt-2 text-xl font-semibold text-slate-950">Put the workflow into practice.</h2>
              <p className="mt-2 text-sm leading-6 text-slate-700">Open your workspace to configure the features included in your plan and give the team a consistent place to coordinate work.</p>
              <div className="mt-4 flex flex-wrap gap-2.5"><Link href="/login" className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">Open workspace <ArrowRight className="size-4" /></Link><Link href="/compare" className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-2.5 text-sm font-semibold text-blue-800 hover:bg-blue-100">Compare capabilities</Link></div>
            </div>
          </main>

          <aside className="sticky top-[88px] hidden max-h-[calc(100vh-110px)] overflow-y-auto py-8 2xl:block" aria-label="On this page">
            <p className="px-2 text-xs font-bold text-slate-900">On this page</p>
            <p className="px-2 pb-3 pt-1 text-[10px] text-slate-400">Reading · {activeLabel}</p>
            <nav className="space-y-0.5 border-l border-slate-200" aria-label="Page contents">
              {onThisPage.map((item) => <a key={item.id} href={`#${item.id}`} onClick={() => setActiveSection(item.id)} className={`block border-l-2 py-1.5 pl-3 pr-1 text-[11px] leading-4 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${activeSection === item.id ? "-ml-px border-blue-600 font-semibold text-blue-800" : "border-transparent text-slate-500 hover:text-slate-950"}`}>{item.label}</a>)}
            </nav>
          </aside>
        </div>
      </div>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-4 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8"><p>© {new Date().getFullYear()} Conventus. Product documentation.</p><div className="flex flex-wrap gap-4"><Link href="/privacy" className="hover:text-blue-700">Privacy</Link><Link href="/terms" className="hover:text-blue-700">Terms</Link><Link href="/compare" className="hover:text-blue-700">Compare</Link><Link href="/" className="hover:text-blue-700">Home</Link></div></div>
      </footer>
    </div>
  );
}
