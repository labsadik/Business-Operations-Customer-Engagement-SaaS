export function Pulse({ className }: { className: string }) {
  return (
    <div
      className={"rounded-xl bg-slate-200/70 motion-safe:animate-pulse " + className}
      aria-hidden="true"
    />
  );
}

/**
 * Shared, lightweight loading boundary. Keep this component deliberately small:
 * route transitions should not mount dozens of placeholder DOM nodes.
 */
export function RouteSpinner({ label = "Loading" }: { label?: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#faf9f1] px-5">
      <div
        role="status"
        aria-live="polite"
        aria-label={label}
        className="flex flex-col items-center gap-3"
      >
        <span
          aria-hidden="true"
          className="size-8 rounded-full border-[3px] border-slate-200 border-t-slate-800 motion-safe:animate-spin motion-reduce:animate-none"
        />
        <span className="text-xs font-medium tracking-wide text-slate-500">
          {label}…
        </span>
      </div>
    </main>
  );
}

export function WorkspaceLoadError({
  onRetry
}: {
  onRetry: () => void;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#faf9f1] px-5 py-10 text-slate-950">
      <section className="w-full max-w-lg rounded-3xl border border-amber-200 bg-white p-7 shadow-sm sm:p-9">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-600">
          Workspace unavailable
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          We couldn’t load your workspace
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          We could not load the workspace data. Retry the read, and sign in
          again if the problem continues.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-3 text-xs font-semibold text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          Retry loading
        </button>
      </section>
    </main>
  );
}

export function LandingLoading() {
  return <RouteSpinner label="Loading Canvas" />;
}

export function LoginLoading() {
  return <RouteSpinner label="Loading sign in" />;
}

export function CompanyLoginLoading() {
  return <RouteSpinner label="Loading company portal" />;
}

export function BookingLoading() {
  return <RouteSpinner label="Loading booking options" />;
}

export function WorkspaceLoading() {
  return <RouteSpinner label="Loading workspace" />;
}

export function CompanyProfileLoading() {
  return <RouteSpinner label="Loading company profile" />;
}

export function WorkspaceSectionLoading({
  section
}: {
  section: "tasks" | "task-canvas" | "vault" | "live-chat";
}) {
  const label =
    section === "tasks"
      ? "Loading tasks"
      : section === "task-canvas"
        ? "Loading Task Canvas"
        : section === "vault"
          ? "Loading company vault"
          : "Loading live chat";

  return <RouteSpinner label={label} />;
}

export function AdminOverviewLoading() {
  return <RouteSpinner label="Loading admin overview" />;
}

export function AdminCompaniesLoading() {
  return <RouteSpinner label="Loading companies" />;
}

export function AdminCompanyDetailsLoading() {
  return <RouteSpinner label="Loading company details" />;
}

export function AdminUsersLoading() {
  return <RouteSpinner label="Loading users" />;
}

export function AdminAccessLoading() {
  return <RouteSpinner label="Loading access settings" />;
}

export function AdminFeedbackLoading() {
  return <RouteSpinner label="Loading feedback" />;
}

export function AdminSupportTicketsLoading() {
  return <RouteSpinner label="Loading support tickets" />;
}

export function AdminPlansLoading() {
  return <RouteSpinner label="Loading plans" />;
}

export function AdminAnnouncementsLoading() {
  return <RouteSpinner label="Loading announcements" />;
}

export function AdminPlatformSettingsLoading() {
  return <RouteSpinner label="Loading platform settings" />;
}

export function BillingLoading() {
  return <RouteSpinner label="Loading billing" />;
}

export function BillingCheckoutLoading() {
  return <RouteSpinner label="Loading checkout" />;
}

export function BillingResultLoading() {
  return <RouteSpinner label="Loading payment result" />;
}

export function InvoiceLoading() {
  return <RouteSpinner label="Loading invoice" />;
}

export function InviteLoading() {
  return <RouteSpinner label="Loading invitation" />;
}

export function AdminVaultUsageLoading() {
  return <RouteSpinner label="Loading vault usage" />;
}

export function AdminLiveChatLoading() {
  return <RouteSpinner label="Loading Live Chat usage" />;
}
