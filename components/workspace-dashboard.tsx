"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { clientApi } from "@/lib/client-api";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Copy,
  CreditCard,
  Globe2,
  LogOut,
  Mail,
  Megaphone,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  Trash2,
  UsersRound,
  Video,
  X,
  XCircle
} from "lucide-react";
import ConfirmDialog from "@/components/confirm-dialog";
import UserAvatar from "@/components/user-avatar";
import MeetingResponseCountdown from "@/components/meeting-response-countdown";
import RazorpayPlanButton from "@/components/razorpay-plan-button";
import { playMeetingSound, unlockMeetingSound } from "@/lib/client-meeting-sound";
import WorkspaceSidebar from "@/components/workspace-sidebar";
import WorkspaceUserProfile from "@/components/workspace-user-profile";
import { WorkspaceLoadError, WorkspaceLoading } from "@/components/route-loading";
import { useNavigationLabels } from "@/components/navigation-labels-provider";
import PublicPageShare from "@/components/public-page-share";
import GoogleIntegrationNotice from "@/components/google-integration-notice";
import PlatformAnnouncementBanner from "@/components/platform-announcement-banner";
import WorkspaceFeedback from "@/components/workspace-feedback";
import WorkspaceSupportTickets from "@/components/workspace-support-tickets";
import { playFeedbackSoundIfEnabled } from "@/lib/client-feedback-sound";

type Address = {
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

type DashboardPlan = {
  id: string;
  name: string;
  description: string;
  status: "PUBLIC" | "COMING_SOON" | "PRIVATE";
  popular: boolean;
  recommended: boolean;
  priceInr: number;
  discountType: "NONE" | "PERCENTAGE" | "FIXED_AMOUNT";
  discountValue: number;
  discountAmountInr: number;
  finalPriceInr: number;
  maxWorkspaces: number;
  maxCompanies: number;
  maxEmployees: number;
  monthlyMeetingLimit: number;
  maxMeetingDurationMinutes: number;
  maxConcurrentMeetings: number;
  taskManagementEnabled?: boolean;
  validityDays: number;
  freeFeatureDays: number | null;
  requiresPayment: boolean;
};

type CompanyData = {
  company: {
    id: string;
    name: string;
    slug: string;
    email: string;
    phone: string;
    logoUrl: string;
    websiteUrl: string;
    description?: string;
    taxId: string;
    address: Address;
    publicBookingEnabled: boolean;
    profileComplete: boolean;
    owner: { name: string; email: string; image: string } | null;
  };
  currentPlan: DashboardPlan;
  availablePlans: DashboardPlan[];
  workspace: {
    id: string;
    name: string;
    timezone: string;
    planId: string;
  } | null;
  subscription: {
    planId: string;
    status: string;
    source: "FREE" | "PAID" | "ADMIN_GRANTED";
    monthlyMeetingsUsed: number;
    freeUsageDates?: string[];
    periodStart: string;
    periodEnd: string;
  } | null;
  memberCount: number;
  connectedMemberCount: number;
  canPublish: boolean;
  gstRatePercent: number;
  gstEnabled: boolean;
  gstInclusive: boolean;
  featureLocked: boolean;
  freeFeatureEndsAt: string | null;
  currentRole: string;
};

type Employee = {
  id: string;
  name: string;
  email: string;
  image: string;
  role: string;
  jobTitle?: string;
  department?: string;
  employmentStatus?: "ACTIVE" | "INACTIVE" | "ON_LEAVE" | string;
  googleConnected: boolean;
};

type RequestItem = {
  id: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  status: string;
  assignedEmployeeId: string | null;
  expiresAt: string;
  customer: { name: string; email: string; image?: string | null } | null;
  meeting: { status: string; meetingUri: string | null } | null;
};

type MeetingHistoryItem = {
  id: string;
  bookingRequestId: string;
  startAt: string;
  endAt: string;
  endedAt: string;
  durationMinutes: number;
  status: string;
  calendarSyncStatus?: string;
  employee: { name: string; email: string; image: string | null } | null;
  customer: { name: string; email: string; image: string | null } | null;
  scheduledBy: { name: string; email: string; image: string | null } | null;
};

type RequestHistoryItem = {
  id: string;
  bookingId: string;
  eventType: string;
  fromStatus: string;
  toStatus: string;
  outcome: string;
  occurredAt: string;
  reasonCode: string | null;
  actor: { name: string; email: string; image: string | null; role: string } | null;
  employee: { name: string; email: string; image: string | null } | null;
  customer: { name: string; email: string; image: string | null } | null;
  startAt: string | null;
  endAt: string | null;
  durationMinutes: number | null;
};

type MeetingModalView = "requests" | "meeting-history" | "request-history";

type AnnouncementItem = {
  id: string;
  title: string;
  message: string;
  active: boolean;
  createdAt: string;
};

type InvitationItem = {
  id: string;
  email: string;
  role: string;
  status: "PENDING" | "EXPIRED";
  expiresAt: string;
  createdAt: string;
};

type InvoiceItem = {
  id: string;
  invoiceNumber: string;
  source: "PAID" | "FREE" | "ADMIN_GRANTED";
  planId: string;
  providerOrderId: string;
  providerPaymentId: string;
  amount: number;
  currency: string;
  issuedAt: string;
  billingPeriodStart: string | null;
  billingPeriodEnd: string | null;
  serviceDescription: string;
  isCurrentPlan: boolean;
  planSnapshot: {
    name: string;
    priceInr: number;
    maxEmployees: number;
    monthlyMeetingLimit: number;
    maxMeetingDurationMinutes: number;
    maxConcurrentMeetings: number;
    validityDays?: number;
    freeFeatureDays?: number | null;
  };
  taxSnapshot: {
    enabled: boolean;
    ratePercent: number;
    inclusive: boolean;
    taxableAmount: number;
    gstAmount: number;
  } | null;
  merchantSnapshot: {
    name: string;
    websiteUrl: string;
    email: string;
    taxId: string;
    gstin: string;
  } | null;
  companySnapshot: {
    name: string;
    email: string;
    phone: string;
    address: Address;
    taxId: string;
  };
};

type ModalName = "meetings" | "team" | "settings" | "billing" | "feedback" | "support-tickets" | null;
type MeetingView = "new" | "old";
type TeamTab = "members" | "invitations";

type Confirmation =
  | { kind: "remove-employee"; id: string; name: string; permanent: boolean }
  | { kind: "delete-announcement"; id: string; title: string }
  | { kind: "end-meeting"; id: string }
  | { kind: "respond-request"; id: string; customerName: string; action: "accept" | "decline" }
  | { kind: "publish-page"; published: boolean }
  | null;

async function api<T>(url: string, init?: RequestInit) {
  return clientApi<T>(url, init);
}

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] ?? "")
      .join("")
      .toUpperCase() || "?"
  );
}

function roleName(role: string) {
  return role === "PLATFORM_ADMIN"
    ? "Platform Admin"
    : role === "COMPANY_OWNER"
      ? "Company Owner"
      : role === "COMPANY_ADMIN"
        ? "Company Admin"
        : role === "EMPLOYEE"
          ? "Employee"
          : role.replaceAll("_", " ");
}

function employeeStatusName(status?: string) {
  if (status === "ON_LEAVE") return "On leave";
  if (status === "INACTIVE") return "Inactive";
  return "Active";
}

function employeeStatusClass(status?: string) {
  if (status === "ON_LEAVE") return "bg-amber-50 text-amber-800 ring-amber-200";
  if (status === "INACTIVE") return "bg-rose-50 text-rose-700 ring-rose-200";
  return "bg-emerald-50 text-emerald-700 ring-emerald-200";
}

function formatDate(value: string, timeZone?: string) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    dateStyle: "medium"
  }).format(new Date(value));
}

function formatTime(value: string, timeZone?: string) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function AppModal({
  open,
  title,
  subtitle,
  size = "lg",
  asPage = false,
  onClose,
  children
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  size?: "md" | "lg" | "xl";
  asPage?: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;

  const maxWidth =
    size === "md" ? "max-w-xl" : size === "xl" ? "max-w-6xl" : "max-w-4xl";

  if (asPage) {
    return (
      <section className="mx-auto max-w-[1400px] px-5 py-6 sm:px-6 lg:px-10 lg:py-8">
        <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:px-7">
            <div className="min-w-0">
              <h2 className="text-xl font-semibold tracking-tight text-slate-950">{title}</h2>
              {subtitle && <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              aria-label={`Back to overview from ${title}`}
            >
              <ChevronRight className="size-3.5 rotate-180" aria-hidden="true" />
              <span>Overview</span>
            </button>
          </div>
          <div className="min-w-0">{children}</div>
        </div>
      </section>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`flex max-h-[88vh] w-full ${maxWidth} min-h-0 flex-col overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-2xl`}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-950">{title}</h2>
            {subtitle && <p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-400 hover:bg-slate-50 hover:text-slate-700"
            aria-label={`Close ${title}`}
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export default function WorkspaceDashboard({
  user
}: {
  user: { name: string; email: string; image?: string };
}) {
  const [data, setData] = useState<CompanyData | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [meetingHistory, setMeetingHistory] = useState<MeetingHistoryItem[]>([]);
  const [modalRequests, setModalRequests] = useState<RequestItem[]>([]);
  const [modalMeetingHistory, setModalMeetingHistory] = useState<MeetingHistoryItem[]>([]);
  const [modalRequestHistory, setModalRequestHistory] = useState<RequestHistoryItem[]>([]);
  const [requestHistoryCursor, setRequestHistoryCursor] = useState<string | null>(null);
  const [requestHistoryLoadingMore, setRequestHistoryLoadingMore] = useState(false);
  const [meetingsLoading, setMeetingsLoading] = useState(false);
  const [meetingView, setMeetingView] = useState<MeetingView>("new");
  const [meetingModalView, setMeetingModalView] = useState<MeetingModalView>("requests");
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [invitations, setInvitations] = useState<InvitationItem[]>([]);
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [teamTab, setTeamTab] = useState<TeamTab>("members");
  const [activeModal, setActiveModal] = useState<ModalName>(null);
  const [settingsSection, setSettingsSection] = useState<"public" | "announcements">("public");
  const [teamActionFor, setTeamActionFor] = useState<string | null>(null);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [announcementEditorOpen, setAnnouncementEditorOpen] = useState(false);
  const [announcementEditingId, setAnnouncementEditingId] = useState<string | null>(null);
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementMessage, setAnnouncementMessage] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [loading, setLoading] = useState(true);
  const [initialLoadFailed, setInitialLoadFailed] = useState(false);
  const [meetingsError, setMeetingsError] = useState("");
  const [invitationsError, setInvitationsError] = useState("");
  const [billingError, setBillingError] = useState("");
  const [announcementManagementError, setAnnouncementManagementError] = useState("");
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [actingRequestId, setActingRequestId] = useState("");
  const [endingRequestId, setEndingRequestId] = useState("");
  const [deletingEmployeeId, setDeletingEmployeeId] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const refreshingRef = useRef(false);
  const dataLoadedRef = useRef(false);
  const initializedRequestsRef = useRef(false);
  const seenRequestIdsRef = useRef(new Set<string>());
  const router = useRouter();
  const { labels } = useNavigationLabels();
  const closeFeedbackModal = useCallback(() => {
    setActiveModal(null);
    router.push("/dashboard");
  }, [router]);

  const canManage = Boolean(
    data && ["COMPANY_OWNER", "COMPANY_ADMIN", "PLATFORM_ADMIN"].includes(data.currentRole)
  );
  const canRespondToMeetings = Boolean(data?.currentRole && [
    "EMPLOYEE",
    "COMPANY_OWNER",
    "COMPANY_ADMIN",
    "PLATFORM_ADMIN"
  ].includes(data.currentRole));
  const adminManaged = Boolean(data?.currentRole === "PLATFORM_ADMIN" && data.company?.id);

  const planId = data?.currentPlan?.id ?? data?.subscription?.planId ?? "free";
  const plan = data?.currentPlan;
  const billingPlans = data
    ? [
        ...(data.currentPlan && !data.availablePlans.some((item) => item.id === data.currentPlan.id)
          ? [data.currentPlan]
          : []),
        ...data.availablePlans
      ]
    : [];
  const subscriptionSource = data?.subscription?.source ?? "FREE";
  const subscriptionPeriodEndMs = data?.subscription?.periodEnd
    ? Date.parse(data.subscription.periodEnd)
    : Number.NaN;
  const subscriptionPeriodActive = Boolean(
    nowMs !== null &&
    Number.isFinite(subscriptionPeriodEndMs) &&
    subscriptionPeriodEndMs > nowMs
  );
  const paidAccessActive = Boolean(
    data?.subscription &&
    ["PAID", "ADMIN_GRANTED"].includes(data.subscription.source) &&
    data.subscription.status === "ACTIVE" &&
    subscriptionPeriodActive
  );
  const usagePercent = plan
    ? Math.min(
        100,
        Math.round(((data?.subscription?.monthlyMeetingsUsed ?? 0) / plan.monthlyMeetingLimit) * 100)
      )
    : 0;
  const readyCount = requests.filter(
    (item) => item.meeting?.status === "READY" && item.meeting.meetingUri
  ).length;

  const hasVisibleMainMeetings = meetingView === "new"
    ? requests.length > 0
    : meetingHistory.length > 0;
  const hasMoreMeetings =
    meetingView === "new" ? requests.length > 5 : meetingHistory.length > 5;

  const refreshAll = useCallback(async function refreshAll() {
    if (refreshingRef.current) return;
    refreshingRef.current = true;

    const settle = <T,>(request: Promise<T>) => request
      .then((value) => ({ ok: true as const, value }))
      .catch(() => ({ ok: false as const, value: undefined as T | undefined }));

    try {
      // Start independent reads together: one optional endpoint must not blank the whole workspace.
      const [companyResult, staffResult, pendingResult, historyResult, announcementResult] = await Promise.all([
        settle(api<CompanyData | null>("/api/company")),
        settle(api<Employee[]>("/api/company/employees")),
        settle(api<RequestItem[]>("/api/employee/requests?limit=6")),
        settle(api<MeetingHistoryItem[]>("/api/employee/meetings?limit=6")),
        settle(api<AnnouncementItem[]>("/api/company/announcement"))
      ]);
      if (!companyResult.ok) throw new Error("COMPANY_DATA_LOAD_FAILED");
      const company = companyResult.value;

      if (!company) {
        dataLoadedRef.current = false;
        setData(null);
        setEmployees([]);
        setRequests([]);
        setMeetingHistory([]);
        setAnnouncements([]);
        setInitialLoadFailed(false);
        setError("");
        return;
      }

      const alreadyLoaded = dataLoadedRef.current;
      dataLoadedRef.current = true;
      setData(company);
      if (staffResult.ok) setEmployees(staffResult.value);
      else if (!alreadyLoaded) setEmployees([]);
      if (pendingResult.ok) setRequests(pendingResult.value);
      else if (!alreadyLoaded) setRequests([]);
      if (historyResult.ok) setMeetingHistory(historyResult.value);
      else if (!alreadyLoaded) setMeetingHistory([]);

      const announcementManager = ["COMPANY_OWNER", "COMPANY_ADMIN"].includes(company.currentRole);
      if (announcementResult.ok) {
        setAnnouncements(announcementManager ? announcementResult.value : []);
        setAnnouncementManagementError("");
      } else if (announcementManager) {
        setAnnouncementManagementError("ANNOUNCEMENT_MANAGEMENT_READ_FAILED");
      }

      setInitialLoadFailed(false);
      setError(!staffResult.ok || !pendingResult.ok || !historyResult.ok
        ? "DASHBOARD_REFRESH_FAILED"
        : "");
    } catch {
      if (dataLoadedRef.current) setError("DASHBOARD_REFRESH_FAILED");
      else setInitialLoadFailed(true);
    } finally {
      setLoading(false);
      refreshingRef.current = false;
    }
  }, []);

  const refreshLive = useCallback(async function refreshLive() {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      const [pending, history] = await Promise.all([
        api<RequestItem[]>("/api/employee/requests?limit=6"),
        api<MeetingHistoryItem[]>("/api/employee/meetings?limit=6")
      ]);
      setRequests(pending);
      setMeetingHistory(history);
    } catch {
      // Keep the last good dashboard state during transient polling failures.
    } finally {
      refreshingRef.current = false;
    }
  }, []);

  async function loadAllMeetings() {
    setMeetingsLoading(true);
    setMeetingsError("");
    try {
      const [allRequests, allHistory, historyPage] = await Promise.all([
        api<RequestItem[]>("/api/employee/requests?limit=100"),
        api<{ items: MeetingHistoryItem[]; nextCursor: string | null }>("/api/employee/meetings?paginated=true&limit=50"),
        api<{ items: RequestHistoryItem[]; nextCursor: string | null }>(
          "/api/employee/requests?history=true&limit=25"
        )
      ]);
      setModalRequests(allRequests);
      setModalMeetingHistory(allHistory.items);
      setModalRequestHistory(historyPage.items);
      setRequestHistoryCursor(historyPage.nextCursor);
    } catch {
      setMeetingsError("MEETING_LIST_FAILED");
    } finally {
      setMeetingsLoading(false);
    }
  }

  async function loadOlderRequestHistory() {
    if (!requestHistoryCursor || requestHistoryLoadingMore) return;
    setRequestHistoryLoadingMore(true);
    try {
      const page = await api<{ items: RequestHistoryItem[]; nextCursor: string | null }>(
        `/api/employee/requests?history=true&limit=25&cursor=${encodeURIComponent(requestHistoryCursor)}`
      );
      setModalRequestHistory((current) => [...current, ...page.items]);
      setRequestHistoryCursor(page.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "REQUEST_HISTORY_FAILED");
    } finally {
      setRequestHistoryLoadingMore(false);
    }
  }

  function actionStateMessage(status: string, meetingStatus?: string | null) {
    if (status === "CREATING_MEETING" || meetingStatus === "CREATING") {
      return "Setting up the meeting. Duplicate actions are disabled while Google Calendar and Meet are being prepared.";
    }
    if (status === "CONFIRMED" || meetingStatus === "READY") {
      return "This meeting is confirmed and ready.";
    }
    if (status === "RETRYING") {
      return "This request needs another attempt and remains available according to the team routing rules.";
    }
    if (status === "EXPIRED") return "This meeting request has expired.";
    if (status === "COMPLETED") return "This meeting has already been completed.";
    if (status === "CANCELLED") return "This meeting request was cancelled.";
    if (status === "ASSIGNED") return "This request is already being processed.";
    return "The request was updated. The dashboard now shows the latest server state.";
  }

  const loadInvitations = useCallback(async function loadInvitations() {
    if (!canManage) return;
    setInvitesLoading(true);
    setInvitationsError("");
    try {
      setInvitations(await api<InvitationItem[]>("/api/company/invitations"));
    } catch {
      setInvitationsError("INVITATION_LIST_FAILED");
    } finally {
      setInvitesLoading(false);
    }
  }, [canManage]);

  const loadInvoices = useCallback(async function loadInvoices() {
    if (!canManage) return;
    setBillingLoading(true);
    setBillingError("");
    try {
      setInvoices(await api<InvoiceItem[]>("/api/billing/invoices"));
    } catch {
      setBillingError("INVOICE_LIST_FAILED");
    } finally {
      setBillingLoading(false);
    }
  }, [canManage]);

  useEffect(() => {
    const syncNow = () => setNowMs(Date.now());
    syncNow();

    const clock = window.setInterval(syncNow, 30_000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") syncNow();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(clock);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    // Schedule initial work outside the effect body; shared GET deduplication and
    // refreshAll's guard prevent duplicate backend reads during Strict Mode mounts.
    const initialLoad = window.setTimeout(() => void refreshAll(), 0);
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshLive();
    }, 10_000);

    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshLive();
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshAll, refreshLive]);

  useEffect(() => {
    const syncPanelFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      const panel = params.get("panel");
      if (
        panel === "meetings" ||
        panel === "team" ||
        panel === "settings" ||
        panel === "billing" ||
        panel === "feedback" ||
        panel === "support-tickets"
      ) {
        setActiveModal(panel);
        setSettingsSection(
          panel === "settings" && params.get("section") === "announcements"
            ? "announcements"
            : "public"
        );
      } else {
        setActiveModal(null);
      }
    };

    const timer = window.setTimeout(syncPanelFromUrl, 0);
    window.addEventListener("popstate", syncPanelFromUrl);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("popstate", syncPanelFromUrl);
    };
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (activeModal === "team") void loadInvitations();
      if (activeModal === "billing") void loadInvoices();
      if (!activeModal) setTeamActionFor(null);
    }, 0);
    return () => window.clearTimeout(handle);
  }, [activeModal, loadInvitations, loadInvoices]);

  useEffect(() => {
    if (activeModal !== "settings" || settingsSection !== "announcements") return;
    const timer = window.setTimeout(() => {
      document.getElementById("workspace-announcements")?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 50);
    return () => window.clearTimeout(timer);
  }, [activeModal, settingsSection]);

  useEffect(() => {
    const ids = requests.map((item) => item.id);
    if (
      initializedRequestsRef.current &&
      ids.some((id) => !seenRequestIdsRef.current.has(id))
    ) {
      void playMeetingSound("incoming");
    }
    for (const id of ids) seenRequestIdsRef.current.add(id);
    initializedRequestsRef.current = true;
  }, [requests]);

  useEffect(() => {
    const unlock = () => {
      void unlockMeetingSound();
      setSoundEnabled(true);
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);


  async function createCompany(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/company", {
        method: "POST",
        body: JSON.stringify({
          name: String(form.get("name") ?? ""),
          email: String(form.get("email") ?? ""),
          phone: String(form.get("phone") ?? ""),
          slug: String(form.get("slug") ?? "")
        })
      });
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "COMPANY_CREATE_FAILED");
    } finally {
      setBusy(false);
    }
  }

  async function updatePublishing() {
    if (!data) return;
    if (!data.company.publicBookingEnabled && !data.canPublish) {
      setError("PUBLISH_REQUIRES_READY_MEMBER");
      return;
    }
    setBusy(true);
    try {
      await api("/api/company", {
        method: "PATCH",
        body: JSON.stringify({
          publicBookingEnabled: !data.company.publicBookingEnabled
        })
      });
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "PUBLISH_FAILED");
    } finally {
      setBusy(false);
    }
  }

  function beginNewAnnouncement() {
    setAnnouncementEditingId(null);
    setAnnouncementTitle("");
    setAnnouncementMessage("");
    setAnnouncementEditorOpen(true);
  }

  function beginEditAnnouncement(item: AnnouncementItem) {
    setAnnouncementEditingId(item.id);
    setAnnouncementTitle(item.title);
    setAnnouncementMessage(item.message);
    setAnnouncementEditorOpen(true);
  }

  async function saveAnnouncement(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!announcementMessage.trim()) return;
    setBusy(true);
    setError("");

    try {
      await api<AnnouncementItem>("/api/company/announcement", {
        method: announcementEditingId ? "PATCH" : "POST",
        body: JSON.stringify(
          announcementEditingId
            ? {
                id: announcementEditingId,
                title: announcementTitle.trim() || "Announcement",
                message: announcementMessage.trim()
              }
            : {
                title: announcementTitle.trim() || "Announcement",
                message: announcementMessage.trim()
              }
        )
      });
      setAnnouncementEditorOpen(false);
      setAnnouncementEditingId(null);
      setAnnouncementTitle("");
      setAnnouncementMessage("");
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ANNOUNCEMENT_UPDATE_FAILED");
    } finally {
      setBusy(false);
    }
  }

  async function toggleAnnouncement(item: AnnouncementItem) {
    setBusy(true);
    try {
      await api("/api/company/announcement", {
        method: "PATCH",
        body: JSON.stringify({ id: item.id, active: !item.active })
      });
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ANNOUNCEMENT_UPDATE_FAILED");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAnnouncement(id: string) {
    setBusy(true);
    try {
      await api(`/api/company/announcement?id=${encodeURIComponent(id)}`, {
        method: "DELETE"
      });
      if (announcementEditingId === id) setAnnouncementEditorOpen(false);
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ANNOUNCEMENT_DELETE_FAILED");
    } finally {
      setBusy(false);
    }
  }

  async function inviteEmployee(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!inviteEmail.trim()) return;
    setBusy(true);
    setError("");
    setInviteLink("");
    try {
      const result = await api<{ inviteUrl: string }>("/api/company/employees", {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail.trim() })
      });
      setInviteEmail("");
      setInviteLink(result.inviteUrl);
      await Promise.all([refreshAll(), loadInvitations()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "INVITE_FAILED");
    } finally {
      setBusy(false);
    }
  }

  async function removeEmployee(id: string, permanent: boolean) {
    setDeletingEmployeeId(id);
    setError("");
    try {
      await api(
        `/api/company/employees/${encodeURIComponent(id)}?permanent=${permanent ? "true" : "false"}`,
        { method: "DELETE" }
      );
      setTeamActionFor(null);
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "EMPLOYEE_REMOVE_FAILED");
    } finally {
      setDeletingEmployeeId("");
    }
  }

  async function cancelInvitation(id: string) {
    setBusy(true);
    try {
      await api(`/api/company/invitations/${encodeURIComponent(id)}`, {
        method: "DELETE"
      });
      await loadInvitations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "INVITATION_CANCEL_FAILED");
    } finally {
      setBusy(false);
    }
  }

  async function resendInvitation(id: string) {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ inviteUrl: string }>(
        `/api/company/invitations/${encodeURIComponent(id)}/resend`,
        { method: "POST" }
      );
      setInviteLink(result.inviteUrl);
      await loadInvitations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "INVITATION_RESEND_FAILED");
    } finally {
      setBusy(false);
    }
  }

  async function endMeeting(id: string) {
    setEndingRequestId(id);
    setError("");
    try {
      await api(`/api/bookings/${encodeURIComponent(id)}/end`, { method: "POST" });
      await refreshLive();
      await refreshAll();
      if (activeModal === "meetings") await loadAllMeetings();
    } catch (err) {
      setError(err instanceof Error ? err.message : "MEETING_END_FAILED");
    } finally {
      setEndingRequestId("");
    }
  }

  async function act(id: string, action: "accept" | "decline") {
    setActingRequestId(id);
    setError("");

    let actionError: (Error & { code?: string }) | null = null;

    try {
      await api(`/api/bookings/${encodeURIComponent(id)}/${action}`, {
        method: "POST"
      });
    } catch (err) {
      actionError = err as Error & { code?: string };
    }

    try {
      const [pending, history] = await Promise.all([
        api<RequestItem[]>("/api/employee/requests?limit=6"),
        api<{ items: MeetingHistoryItem[]; nextCursor: string | null }>("/api/employee/meetings?paginated=true&limit=6")
      ]);

      setRequests(pending);
      setMeetingHistory(history.items);

      let latestMessage = actionError?.message ?? "";

      if (actionError?.code?.startsWith("BOOKING_")) {
        const latest = pending.find((item) => item.id === id);

        if (latest) {
          latestMessage = actionStateMessage(
            latest.status,
            latest.meeting?.status ?? null
          );
        } else if (
          actionError.code === "BOOKING_ALREADY_ASSIGNED" ||
          actionError.code === "BOOKING_ALREADY_CONFIRMED" ||
          actionError.code === "BOOKING_PROCESSING"
        ) {
          latestMessage =
            "This request is no longer available for your response. The latest server state is shown above.";
        }
      }

      if (activeModal === "meetings") {
        await loadAllMeetings();
      }

      if (actionError) {
        setError(
          latestMessage ||
            "We could not complete that meeting action. The dashboard has been refreshed."
        );
      }
    } catch {
      if (actionError) {
        setError(
          actionError.message ||
            "We could not complete that meeting action. The latest request state could not be refreshed."
        );
      } else {
        setError("The action completed, but the dashboard could not refresh. Reload to see the latest state.");
      }
    } finally {
      setActingRequestId("");
    }
  }

  async function confirmDialogAction() {
    if (!confirmation) return;
    const action = confirmation;
    setConfirmation(null);
    if (action.kind === "remove-employee") {
      await removeEmployee(action.id, action.permanent);
      return;
    }
    if (action.kind === "delete-announcement") {
      await deleteAnnouncement(action.id);
      return;
    }
    if (action.kind === "respond-request") {
      await act(action.id, action.action);
      return;
    }
    if (action.kind === "publish-page") {
      await updatePublishing();
      return;
    }
    await endMeeting(action.id);
  }

  function openModal(
    name: Exclude<ModalName, null>,
    section?: "announcements",
    fromUserGesture = false
  ) {
    setError("");
    setSettingsSection(section === "announcements" ? "announcements" : "public");
    setActiveModal(name);
    const params = new URLSearchParams({ panel: name });
    if (section) params.set("section", section);
    router.push(`/dashboard?${params.toString()}`);
    if (name === "feedback" && fromUserGesture) void playFeedbackSoundIfEnabled();
    if (name === "meetings") void loadAllMeetings();
  }

  if (loading) return <WorkspaceLoading />;

  if (initialLoadFailed) {
    return (
      <WorkspaceLoadError
        onRetry={() => {
          setInitialLoadFailed(false);
          setLoading(true);
          void refreshAll();
        }}
      />
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-[#faf9f1]">
        <div className="mx-auto flex min-h-screen max-w-2xl items-center px-5 py-10">
          <section className="w-full rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
            <div className="grid size-12 place-items-center rounded-2xl bg-slate-950 text-white">
              <Building2Icon />
            </div>
            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
              Company setup
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Create your company workspace
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Company name, email, and phone are required for billing and invoice generation.
            </p>

            <form onSubmit={createCompany} className="mt-8 grid gap-4">
              <label className="grid gap-2 text-sm font-semibold text-slate-800">
                Company name *
                <input name="name" required placeholder="Acme Corporation" className="rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500" />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-slate-800">
                Company email *
                <input name="email" required type="email" placeholder="billing@company.com" className="rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500" />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-slate-800">
                Company phone *
                <input name="phone" required placeholder="+91 98765 43210" className="rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500" />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-slate-800">
                Public address
                <input name="slug" placeholder="acme" className="rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500" />
              </label>

              {error && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                  {error.replaceAll("_", " ")}
                </div>
              )}

              <button
                disabled={busy}
                className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {busy ? "Creating..." : "Create company"}
                <ChevronRight className="size-4" />
              </button>
            </form>
          </section>
        </div>
      </main>
    );
  }

  if (!plan) {
    return (
      <WorkspaceLoadError
        onRetry={() => {
          setLoading(true);
          void refreshAll();
        }}
      />
    );
  }

  const confirmationTitle =
    confirmation?.kind === "remove-employee"
      ? confirmation.permanent ? "Delete employee forever?" : "Remove employee access?"
      : confirmation?.kind === "delete-announcement"
        ? "Delete announcement?"
        : confirmation?.kind === "respond-request"
          ? confirmation.action === "accept" ? "Accept meeting request?" : "Decline meeting request?"
          : confirmation?.kind === "publish-page"
            ? confirmation.published ? "Unpublish public booking page?" : "Publish public booking page?"
            : "End meeting?";

  const confirmationDescription =
    confirmation?.kind === "remove-employee"
      ? confirmation.permanent
        ? `This permanently deletes ${confirmation.name}'s employee account and access data. This action cannot be undone.`
        : `Remove ${confirmation.name} from this company? Their user account remains available for future access.`
      : confirmation?.kind === "delete-announcement"
        ? `Delete “${confirmation.title}” permanently from this company?`
        : confirmation?.kind === "respond-request"
          ? confirmation.action === "accept"
            ? `Accept ${confirmation.customerName}'s meeting request? Conventus will continue with the existing scheduling flow.`
            : `Decline ${confirmation.customerName}'s meeting request? The request will no longer remain available for your response.`
          : confirmation?.kind === "publish-page"
            ? confirmation.published
              ? "Unpublishing will prevent visitors from opening the public booking page. Existing customer requests are not deleted."
              : "Publishing will make the public booking page accessible. Visitors must still sign in with Google before seeing availability or submitting a request."
            : "End this meeting now? Access will close and the booking cannot be reused.";

  const confirmationLabel =
    confirmation?.kind === "remove-employee"
      ? confirmation.permanent ? "Delete forever" : "Remove access"
      : confirmation?.kind === "delete-announcement"
        ? "Delete announcement"
        : confirmation?.kind === "respond-request"
          ? confirmation.action === "accept" ? "Accept request" : "Decline request"
          : confirmation?.kind === "publish-page"
            ? confirmation.published ? "Unpublish page" : "Publish page"
            : "End meeting";

  const confirmationTone =
    confirmation?.kind === "respond-request" && confirmation.action === "accept"
      ? "success"
      : confirmation?.kind === "respond-request" && confirmation.action === "decline"
        ? "destructive"
        : "destructive";

  return (
    <main className="min-h-screen bg-[#faf9f1] text-slate-950">
      <WorkspaceSidebar
        companyName={data.company.name}
        taskManagementEnabled={Boolean(data.currentPlan.taskManagementEnabled)}
        canManage={canManage}
        adminManaged={adminManaged}
        activePanel={activeModal}
        activeSettingsSection={settingsSection}
        onOpenPanel={(panel, section) => openModal(panel, section, true)}
        onNavigateOverview={closeFeedbackModal}
      />
      <div className="lg:pl-72">
      <header className="sticky top-0 z-40 border-b border-slate-200/90 bg-[#faf9f1]/95 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-5 sm:px-6 lg:px-8">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-600">{labels.dashboard}</p>
            <h2 className="mt-1 truncate text-base font-semibold tracking-tight text-slate-950">{data.company.name}</h2>
          </div>

          <div className="flex items-center gap-2">
            {adminManaged && (
              <>
                <Link
                  href={`/admin/companies/${data!.company.id}` as Route}
                  className="hidden items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 sm:inline-flex"
                >
                  <ShieldCheck className="size-4" />
                  Admin console
                </Link>
                <button
                  type="button"
                  onClick={async () => {
                    await fetch("/api/admin/companies/unmanage", { method: "POST" });
                    router.push("/admin");
                  }}
                  className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 sm:inline-flex"
                >
                  Exit admin mode
                </button>
              </>
            )}
            {data.company.publicBookingEnabled ? (
              <Link
                href={`/${data.company.slug}`}
                className="hidden items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 md:inline-flex"
              >
                <Globe2 className="size-4" />
                Open live page
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => openModal("settings")}
                className="hidden items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 md:inline-flex"
              >
                <Globe2 className="size-4" />
                Prepare public page
              </button>
            )}
            <WorkspaceUserProfile name={user.name} email={user.email} image={user.image} companyName={data.company.name} currentRole={data.currentRole} />
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                aria-label="Sign out"
                className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
              >
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
        </div>
      </header>

      {!activeModal && <PlatformAnnouncementBanner scope={"company:" + data.company.id} />}

      <div className={`mx-auto max-w-[1400px] px-5 py-6 sm:px-6 lg:px-10 lg:py-8 ${activeModal ? "hidden" : ""}`}>
        {data.featureLocked && (
          <div className="mb-6 flex items-start justify-between gap-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-900">
            <div>
              <p className="font-semibold">Free feature window ended</p>
              <p className="mt-1 text-xs leading-5 text-rose-700">
                Your Free plan remains active for this 30-day cycle, but scheduling features are locked after the first 14 days. The next cycle renews automatically.
              </p>
            </div>
            <Link href="/dashboard?panel=billing" className="shrink-0 rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800">
              View plans
            </Link>
          </div>
        )}

        {error && (
          <div role="alert" className="mb-6 flex items-start justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span>{error.replaceAll("_", " ")}</span>
            <button type="button" onClick={() => setError("")} aria-label="Dismiss" className="text-amber-700 hover:text-amber-950">
              ×
            </button>
          </div>
        )}

        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-700">
                  {data.currentRole.replaceAll("_", " ")}
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  Operational
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">{data.company.name}</h1>
                {!data.company.profileComplete && canManage && (
                  <Link href="/dashboard/company-profile" className="rounded-full bg-amber-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-amber-700">
                    Complete profile
                  </Link>
                )}
              </div>

              <p className="mt-2 max-w-2xl text-sm text-slate-500">
                {data.company.description ||
                  "Central workspace for customer requests, team coordination, meetings, billing, and company operations."}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void unlockMeetingSound();
                  setSoundEnabled(true);
                }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                {soundEnabled ? "Notifications on" : "Enable notifications"}
              </button>

              <button
                type="button"
                onClick={() => void refreshAll()}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <RefreshCw className="size-3.5" />
                Refresh
              </button>

              {canManage && (
                <button
                  type="button"
                  onClick={() => setConfirmation({ kind: "publish-page", published: data.company.publicBookingEnabled })}
                  disabled={busy || data.featureLocked || (!data.company.publicBookingEnabled && !data.canPublish)}
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 ${data.company.publicBookingEnabled ? "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100" : "bg-blue-600 text-white hover:bg-blue-700"}`}
                >
                  {data.company.publicBookingEnabled ? "Unpublish page" : "Publish page"}
                  <ArrowUpRight className="size-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Plan", plan.name, Settings2],
              ["Team", String(data.memberCount), UsersRound],
              ["Monthly volume", `${data.subscription?.monthlyMeetingsUsed ?? 0} / ${plan.monthlyMeetingLimit}`, Activity],
              ["Ready now", String(readyCount), Video]
            ].map(([title, value, Icon]) => {
              const StatIcon = Icon as typeof Activity;
              return (
                <article key={title as string} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">{title as string}</span>
                    <StatIcon className="size-4 text-slate-400" />
                  </div>
                  <p className="mt-3 text-xl font-semibold tracking-tight text-slate-950">{value as string}</p>
                </article>
              );
            })}
          </div>
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_360px]">
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <CalendarDays className="size-4 text-blue-600" />
                    <h2 className="text-base font-semibold">{labels.meetings}</h2>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Showing five at a time. Open the meeting popup for the full list.
                  </p>
                </div>

                <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                  <button type="button" onClick={() => setMeetingView("new")} className={`rounded-lg px-3.5 py-2 text-xs font-semibold ${meetingView === "new" ? "bg-white text-slate-950 shadow-sm ring-1 ring-slate-200" : "text-slate-500"}`}>
                    New <span className="ml-1 text-slate-400">{requests.length > 5 ? "5+" : requests.length}</span>
                  </button>
                  <button type="button" onClick={() => setMeetingView("old")} className={`rounded-lg px-3.5 py-2 text-xs font-semibold ${meetingView === "old" ? "bg-white text-slate-950 shadow-sm ring-1 ring-slate-200" : "text-slate-500"}`}>
                    Old <span className="ml-1 text-slate-400">{meetingHistory.length > 5 ? "5+" : meetingHistory.length}</span>
                  </button>
                </div>
              </div>
            </div>

            {!hasVisibleMainMeetings ? (
              <div className="px-6 py-16 text-center">
                <div className="mx-auto grid size-11 place-items-center rounded-2xl bg-slate-100 text-slate-400">
                  <Video className="size-5" />
                </div>
                <p className="mt-4 text-sm font-semibold">
                  {meetingView === "new" ? "No active meetings" : "No closed meetings"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {meetingView === "new"
                    ? "New requests and confirmed meetings will appear here."
                    : "Completed meeting records will appear here."}
                </p>
              </div>
            ) : meetingView === "new" ? (
              <div className="divide-y divide-slate-100">
                {requests.slice(0, 5).map((item) => {
                  const actionable = canRespondToMeetings && (item.status === "REQUESTED" || item.status === "RETRYING");
                  const creating = item.status === "ASSIGNED" || item.status === "CREATING_MEETING";
                  const ready = item.meeting?.status === "READY" && Boolean(item.meeting.meetingUri);
                  const scheduled = item.status === "CONFIRMED" || item.status === "IN_PROGRESS";

                  return (
                    <div key={item.id} className="px-6 py-5">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                          {item.customer ? (
                            <UserAvatar
                              name={item.customer.name}
                              email={item.customer.email}
                              image={item.customer.image}
                              size={40}
                            />
                          ) : (
                            <div className="grid size-10 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">?</div>
                          )}

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-semibold">{item.customer?.name ?? "Customer"}</p>
                              <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${ready ? "bg-emerald-50 text-emerald-700" : creating ? "bg-blue-50 text-blue-700" : item.status === "RETRYING" ? "bg-amber-50 text-amber-700" : scheduled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                                {ready ? "Ready" : creating ? "Preparing" : item.status === "RETRYING" ? "Retrying" : scheduled ? "Confirmed" : "Awaiting response"}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-500">
                              {new Date(item.startAt).toLocaleString()} · {item.durationMinutes} min
                            </p>
                            {item.customer?.email && <p className="mt-1 truncate text-[11px] text-slate-400">{item.customer.email}</p>}
                            {!ready && !scheduled && (
                              <MeetingResponseCountdown
                                expiresAt={item.expiresAt}
                                label={
                                  creating
                                    ? "Preparing the meeting"
                                    : item.status === "RETRYING"
                                      ? "Finding the next available team member"
                                      : "Response window"
                                }
                              />
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 xl:justify-end">
                          {ready && item.meeting?.meetingUri && (
                            <>
                              <a href={item.meeting.meetingUri} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700">
                                <Video className="size-4" />
                                Join meeting
                              </a>
                              <button type="button" disabled={endingRequestId === item.id} onClick={() => setConfirmation({ kind: "end-meeting", id: item.id })} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50">
                                <XCircle className="size-4" />
                                {endingRequestId === item.id ? "Ending..." : "End"}
                              </button>
                            </>
                          )}
                          {actionable && (
                            <>
                              <button type="button" disabled={actingRequestId === item.id} onClick={() => setConfirmation({ kind: "respond-request", id: item.id, customerName: item.customer?.name ?? "Customer", action: "decline" })} className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50">Decline</button>
                              <button type="button" disabled={actingRequestId === item.id} onClick={() => setConfirmation({ kind: "respond-request", id: item.id, customerName: item.customer?.name ?? "Customer", action: "accept" })} className="rounded-xl bg-emerald-600 px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                                {actingRequestId === item.id ? "Accepting..." : "Accept"}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {meetingHistory.slice(0, 5).map((meeting, index) => {
                  const timeZone = data.workspace?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
                  const scheduledBy = meeting.scheduledBy ?? meeting.customer;
                  return (
                    <div key={`${meeting.startAt}-${meeting.customer?.email ?? index}`} className="px-6 py-5">
                      <div className="grid gap-5 xl:grid-cols-[1fr_1.1fr_auto] xl:items-center">
                        <div className="flex min-w-0 items-center gap-3">
                          <UserAvatar name={scheduledBy?.name ?? "Customer"} email={scheduledBy?.email} image={scheduledBy?.image} size={40} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-semibold">{scheduledBy?.name ?? "Customer"}</p>
                              <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
                                {meeting.status === "CANCELLED" ? "Cancelled" : "Completed"}
                              </span>
                            </div>
                            <p className="mt-1 text-[11px] text-slate-400">Scheduled by</p>
                            <p className="truncate text-xs text-slate-500">{scheduledBy?.email ?? "Email unavailable"}</p>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <p className="text-xs font-semibold text-slate-900">{formatDate(meeting.startAt, timeZone)}</p>
                          <p className="mt-1 text-xs text-slate-700">
                            {formatTime(meeting.startAt, timeZone)} – {formatTime(meeting.endAt, timeZone)} · {meeting.durationMinutes} min
                          </p>
                        </div>

                        <div className="flex items-center gap-2 xl:justify-end">
                          <div className="text-right">
                            <p className="text-xs font-semibold text-slate-700">{meeting.employee?.name ?? "Team member"}</p>
                            <p className="mt-1 text-[10px] text-slate-400">Handled by</p>
                          </div>
                          <CheckCircle2 className="size-4 text-emerald-600" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {hasMoreMeetings && (
              <div className="border-t border-slate-200 bg-slate-50 px-6 py-4">
                <button type="button" onClick={() => openModal("meetings")} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  See More
                  <ArrowUpRight className="size-3.5" />
                </button>
              </div>
            )}
          </section>

          <div className="space-y-6">
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Workspace access</p>
                  <h2 className="mt-2 text-base font-semibold">Company workspace</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Manage page settings and announcements from the gear control.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openModal("settings")}
                  className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  aria-label="Open workspace settings"
                >
                  <Settings2 className="size-5 text-blue-600" />
                </button>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-3">
                  <span className={`size-2 rounded-full ${data.company.publicBookingEnabled ? "bg-emerald-500" : "bg-slate-300"}`} />
                  <div>
                    <p className="text-xs font-semibold text-slate-800">
                      {data.company.publicBookingEnabled ? "Public page published" : "Public page is draft"}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {data.connectedMemberCount} ready team member{data.connectedMemberCount === 1 ? "" : "s"}.
                    </p>
                  </div>
                </div>
              </div>

              <Link href={`/${data.company.slug}`} className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-xs font-medium text-slate-700 hover:bg-slate-50">
                <span className="truncate">/{data.company.slug}</span>
                <ArrowUpRight className="size-4 shrink-0 text-slate-400" />
              </Link>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{labels.team}</p>
                  <h2 className="mt-2 text-base font-semibold">Members</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    {data.memberCount} people in this workspace.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setTeamTab("members");
                    openModal("team");
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  More
                  <MoreHorizontal className="size-4" />
                </button>
              </div>

              {employees.some((employee) => !employee.googleConnected && employee.email === user.email) && (
                <div className="mb-4">
                  <GoogleIntegrationNotice mode="employee" />
                </div>
              )}
              <div className="mt-5 space-y-2.5">
                {employees.slice(0, 5).map((employee) => (
                  <div key={employee.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3">
                    <UserAvatar name={employee.name} email={employee.email} image={employee.image} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">{employee.name}</p>
                      <p className="truncate text-[11px] text-slate-500">{employee.email}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-semibold text-blue-700">{roleName(employee.role)}</span>
                        <span className="text-[10px] text-slate-500">{employee.jobTitle || "Position not set"}</span>
                        <span className="text-[10px] text-slate-400">· {employee.department || "Department not set"}</span>
                        <span className={"rounded-full px-2 py-0.5 text-[9px] font-semibold ring-1 ring-inset " + employeeStatusClass(employee.employmentStatus)}>{employeeStatusName(employee.employmentStatus)}</span>
                      </div>
                      
                    </div>
                    {employee.googleConnected ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">Connected</span>
                    ) : employee.email === user.email ? (
                      <Link
                        href="/api/auth/google/start?intent=connect&returnTo=%2Fdashboard"
                        prefetch={false}
                        className="rounded-xl bg-slate-950 px-2.5 py-2 text-[10px] font-semibold text-white hover:bg-slate-800"
                      >
                        Setup Google
                      </Link>
                    ) : (
                      <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">Needs setup</span>
                    )}
                  </div>
                ))}
                {employees.length === 0 && (
                  <p className="rounded-2xl bg-slate-50 p-4 text-xs text-slate-500">No team members yet.</p>
                )}
              </div>

              {employees.length > 5 && (
                <button type="button" onClick={() => openModal("team")} className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  See all {employees.length} members
                </button>
              )}
            </section>

            {canManage && (
              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{labels.billing}</p>
                    <h2 className="mt-2 text-base font-semibold">{plan.name} plan</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {adminManaged
                        ? "Admin management mode is read/write for this company dashboard; payment checkout stays disabled in support mode."
                        : data.company.profileComplete
                          ? "Payment checkout and automatic invoice generation are ready."
                          : "Complete the company profile before starting a payment."}
                    </p>
                  </div>
                  <button type="button" onClick={() => openModal("billing")} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                    Details
                    <ArrowUpRight className="size-3.5" />
                  </button>
                </div>

                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-slate-500">Monthly usage</span>
                    <span className="text-sm font-semibold text-slate-900">
                      {data.subscription?.monthlyMeetingsUsed ?? 0} / {plan.monthlyMeetingLimit}
                    </span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full rounded-full bg-blue-600" style={{ width: `${usagePercent}%` }} />
                  </div>
                </div>
              </section>
            )}

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Company contact</p>
                  <h2 className="mt-2 text-base font-semibold">Billing identity</h2>
                </div>
                <Mail className="size-5 text-slate-400" />
              </div>
              <div className="mt-5 space-y-3">
                <div className="rounded-xl bg-slate-50 px-3.5 py-3">
                  <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-slate-400">Email</p>
                  <p className="mt-1 truncate text-xs font-semibold text-slate-800">{data.company.email || "Not configured"}</p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3.5 py-3">
                  <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-slate-400">Phone</p>
                  <p className="mt-1 text-xs font-semibold text-slate-800">{data.company.phone || "Not configured"}</p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      <WorkspaceFeedback
        open={activeModal === "feedback"}
        asPage
        onClose={closeFeedbackModal}
        canViewCustomerFeedback={Boolean(data.currentRole && data.company?.id)}
        canSubmit={data.currentRole !== "PLATFORM_ADMIN"}
      />

      {data.currentRole !== "PLATFORM_ADMIN" && (
        <WorkspaceSupportTickets
          open={activeModal === "support-tickets"}
          asPage
          onClose={closeFeedbackModal}
          user={{ name: user.name, email: user.email }}
          company={{
            name: data.company.name,
            email: data.company.email || "",
            phone: data.company.phone || ""
          }}
        />
      )}

      <AppModal
        open={activeModal === "meetings"}
        title="Meetings & requests"
        subtitle="Current requests, completed meetings, and an auditable request history are kept separate."
        size="xl"
        asPage
        onClose={closeFeedbackModal}
      >
        <div className="p-5 sm:p-6">
          {meetingsError && (
            <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3" role="alert">
              <p className="text-xs text-rose-800">Meetings could not be loaded. Your current dashboard state is unchanged.</p>
              <button
                type="button"
                onClick={() => void loadAllMeetings()}
                className="shrink-0 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                Retry
              </button>
            </div>
          )}
          <div className="mb-5 flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1">
            {(
              [
                ["requests", "Requests"],
                ["meeting-history", "Meeting history"],
                ["request-history", "Request history"]
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMeetingModalView(value)}
                className={`rounded-lg px-4 py-2 text-xs font-semibold ${meetingModalView === value ? "bg-white text-slate-950 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-800"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {meetingsLoading ? (
            <div className="grid gap-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
          ) : meetingModalView === "requests" ? (
            modalRequests.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
                <p className="text-sm font-semibold text-slate-700">No active requests.</p>
                <p className="mt-1 text-xs text-slate-500">Accepted requests stay here while the meeting is being prepared.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {modalRequests.map((item) => {
                  const actionable = canRespondToMeetings && (item.status === "REQUESTED" || item.status === "RETRYING");
                  const creating =
                    item.status === "ASSIGNED" ||
                    item.status === "CREATING_MEETING" ||
                    item.meeting?.status === "CREATING";
                  const ready = item.meeting?.status === "READY" && Boolean(item.meeting.meetingUri);

                  return (
                    <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                          <UserAvatar
                            name={item.customer?.name ?? "Customer"}
                            email={item.customer?.email}
                            image={item.customer?.image}
                            size={42}
                          />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-semibold">{item.customer?.name ?? "Customer"}</p>
                              <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                                ready
                                  ? "bg-emerald-50 text-emerald-700"
                                  : creating
                                    ? "bg-blue-50 text-blue-700"
                                    : item.status === "RETRYING"
                                      ? "bg-amber-50 text-amber-700"
                                      : "bg-slate-100 text-slate-600"
                              }`}>
                                {ready ? "Confirmed" : creating ? "Setting up meeting" : item.status.replaceAll("_", " ")}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-500">
                              {new Date(item.startAt).toLocaleString()} · {item.durationMinutes} min
                            </p>
                            <p className="mt-1 truncate text-[11px] text-slate-400">{item.customer?.email ?? "Email unavailable"}</p>
                            {creating && (
                              <p className="mt-2 text-[11px] font-medium text-blue-700">
                                Google Calendar and Meet are being prepared. Actions are disabled until the server reports the final state.
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {ready && item.meeting?.meetingUri && (
                            <a
                              href={item.meeting.meetingUri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700"
                            >
                              <Video className="size-4" />
                              Join
                            </a>
                          )}
                          {actionable && !creating && (
                            <>
                              <button
                                type="button"
                                disabled={actingRequestId === item.id}
                                onClick={() =>
                                  setConfirmation({
                                    kind: "respond-request",
                                    id: item.id,
                                    customerName: item.customer?.name ?? "Customer",
                                    action: "decline"
                                  })
                                }
                                className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700 disabled:opacity-50"
                              >
                                {actingRequestId === item.id ? "Processing..." : "Decline"}
                              </button>
                              <button
                                type="button"
                                disabled={actingRequestId === item.id}
                                onClick={() =>
                                  setConfirmation({
                                    kind: "respond-request",
                                    id: item.id,
                                    customerName: item.customer?.name ?? "Customer",
                                    action: "accept"
                                  })
                                }
                                className="rounded-xl bg-emerald-600 px-3.5 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
                              >
                                {actingRequestId === item.id ? "Processing..." : "Accept"}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : meetingModalView === "meeting-history" ? (
            modalMeetingHistory.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
                <p className="text-sm font-semibold text-slate-700">No completed or cancelled meetings.</p>
                <p className="mt-1 text-xs text-slate-500">A failed or declined request is not shown as a completed meeting.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {modalMeetingHistory.map((meeting) => {
                  const timeZone = data.workspace?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
                  const scheduledBy = meeting.scheduledBy ?? meeting.customer;
                  return (
                    <div key={meeting.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-center">
                        <div className="flex min-w-0 items-center gap-3">
                          <UserAvatar
                            name={scheduledBy?.name ?? "Customer"}
                            email={scheduledBy?.email}
                            image={scheduledBy?.image}
                            size={42}
                          />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{scheduledBy?.name ?? "Customer"}</p>
                            <p className="mt-1 truncate text-xs text-slate-500">{scheduledBy?.email ?? "Email unavailable"}</p>
                          </div>
                        </div>
                        <div className="rounded-xl bg-slate-50 px-3.5 py-3">
                          <p className="text-xs font-semibold">{formatDate(meeting.startAt, timeZone)}</p>
                          <p className="mt-1 text-[11px] text-slate-500">
                            {formatTime(meeting.startAt, timeZone)} – {formatTime(meeting.endAt, timeZone)} · {meeting.durationMinutes} min
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-semibold text-slate-700">{meeting.employee?.name ?? "Team member"}</p>
                          <p className="mt-1 text-[10px] text-slate-400">{meeting.status.replaceAll("_", " ")}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : modalRequestHistory.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
              <p className="text-sm font-semibold text-slate-700">No request history yet.</p>
              <p className="mt-1 text-xs text-slate-500">Declines, retries, expiry, meeting setup failures, and confirmations will appear here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {modalRequestHistory.map((item) => {
                const label = item.eventType.replaceAll("_", " ");
                const transition = `${item.fromStatus.replaceAll("_", " ")} → ${item.toStatus.replaceAll("_", " ")}`;
                const when = data.workspace?.timezone
                  ? formatDate(item.occurredAt, data.workspace.timezone)
                  : formatDate(item.occurredAt);

                return (
                  <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold capitalize">{label.toLowerCase()}</p>
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                            {item.outcome}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">{transition}</p>
                        <p className="mt-1 text-[11px] text-slate-400">
                          {when} · {item.startAt ? formatTime(item.startAt, data.workspace?.timezone) : "No scheduled time"}
                          {item.durationMinutes ? ` · ${item.durationMinutes} min` : ""}
                        </p>
                        {item.reasonCode && (
                          <p className="mt-2 text-[11px] text-slate-500">Reason: {item.reasonCode}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-semibold text-slate-700">{item.actor?.name ?? "System"}</p>
                        <p className="mt-1 text-[10px] text-slate-400">{item.actor?.role ?? "SYSTEM"}</p>
                      </div>
                    </div>
                    {item.customer && (
                      <div className="mt-3 rounded-xl bg-slate-50 px-3.5 py-2.5 text-[11px] text-slate-600">
                        Customer: {item.customer.name}
                      </div>
                    )}
                  </div>
                );
              })}
              {requestHistoryCursor && (
                <button
                  type="button"
                  onClick={() => void loadOlderRequestHistory()}
                  disabled={requestHistoryLoadingMore}
                  className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {requestHistoryLoadingMore ? "Loading older history..." : "Load older request history"}
                </button>
              )}
            </div>
          )}
        </div>
      </AppModal>

      <AppModal
        open={activeModal === "settings"}
        title={labels.workspaceSettings}
        subtitle="Public page and company announcements are managed here without opening another settings page."
        size="lg"
        asPage
        onClose={closeFeedbackModal}
      >
        <div className="p-5 sm:p-6">
          {canManage && (
            <div className="mb-5">
              <PublicPageShare
                savedSlug={data.company.slug}
                published={data.company.publicBookingEnabled}
                canPublish={data.canPublish && !data.featureLocked}
                busy={busy}
                onPublishRequest={() => setConfirmation({ kind: "publish-page", published: data.company.publicBookingEnabled })}
              />
            </div>
          )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/dashboard/company-profile" onClick={closeFeedbackModal} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                <Settings2 className="size-4" />
                Company profile
              </Link>
              {data.company.publicBookingEnabled ? (
                <Link href={`/${data.company.slug}`} onClick={closeFeedbackModal} className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">
                  <Globe2 className="size-4" />
                  Open live page
                </Link>
              ) : (
                <button type="button" onClick={closeFeedbackModal} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-semibold text-slate-600">
                  <Globe2 className="size-4" />
                  Draft stays private
                </button>
              )}
            </div>

          <section id="workspace-announcements" className="mt-5 rounded-2xl border border-slate-200 bg-white">
            <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div>
                <p className="text-xs font-semibold text-slate-900">Announcements</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Only one announcement can be active at a time.
                </p>
              </div>
              {canManage && (
                <button type="button" onClick={beginNewAnnouncement} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-slate-800">
                  <Plus className="size-4" />
                  New announcement
                </button>
              )}
            </div>

            {announcementEditorOpen && canManage && (
              <form onSubmit={saveAnnouncement} className="border-b border-slate-200 bg-slate-50 px-4 py-4 sm:px-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <input value={announcementTitle} onChange={(e) => setAnnouncementTitle(e.target.value)} maxLength={120} placeholder="Announcement title" className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500" />
                  <textarea value={announcementMessage} onChange={(e) => setAnnouncementMessage(e.target.value)} required maxLength={500} rows={3} placeholder="Message customers should see..." className="resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 sm:col-span-2" />
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" onClick={() => setAnnouncementEditorOpen(false)} className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-600">Cancel</button>
                  <button type="submit" disabled={busy || !announcementMessage.trim()} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3.5 py-2.5 text-xs font-semibold text-white disabled:opacity-40">
                    <Save className="size-3.5" />
                    {announcementEditingId ? "Save changes" : "Publish announcement"}
                  </button>
                </div>
              </form>
            )}

            {announcementManagementError && (
              <div className="mx-4 mt-4 flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 sm:mx-5" role="alert">
                <p className="text-xs text-rose-800">Company announcements could not be loaded.</p>
                <button
                  type="button"
                  onClick={() => void refreshAll()}
                  className="shrink-0 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  Retry
                </button>
              </div>
            )}
            <div className="divide-y divide-slate-100">
              {announcements.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <Megaphone className="mx-auto size-5 text-slate-300" />
                  <p className="mt-3 text-xs font-semibold text-slate-700">No announcements</p>
                  <p className="mt-1 text-[11px] text-slate-400">Create the first announcement for this company.</p>
                </div>
              ) : (
                announcements.map((item) => (
                  <div key={item.id} className="px-4 py-4 sm:px-5">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                          <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${item.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                            {item.active ? "Live" : "Inactive"}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-slate-600">{item.message}</p>
                        <p className="mt-2 text-[10px] text-slate-400">{formatDate(item.createdAt)}</p>
                      </div>
                      {canManage && (
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <button type="button" onClick={() => beginEditAnnouncement(item)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Edit</button>
                          <button type="button" disabled={busy} onClick={() => void toggleAnnouncement(item)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                            {item.active ? "Turn off" : "Make active"}
                          </button>
                          <button type="button" disabled={busy} onClick={() => setConfirmation({ kind: "delete-announcement", id: item.id, title: item.title })} className="grid size-9 place-items-center rounded-xl border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 disabled:opacity-40" aria-label={`Delete ${item.title}`}>
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </AppModal>

      <AppModal
        open={activeModal === "team"}
        title="Team management"
        subtitle="Manage every member and keep invitations in the same popup."
        size="lg"
        asPage
        onClose={closeFeedbackModal}
      >
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button type="button" onClick={() => setTeamTab("members")} className={`rounded-lg px-4 py-2 text-xs font-semibold ${teamTab === "members" ? "bg-white text-slate-950 shadow-sm ring-1 ring-slate-200" : "text-slate-500"}`}>
                Members ({employees.length})
              </button>
              {canManage && (
                <button type="button" onClick={() => setTeamTab("invitations")} className={`rounded-lg px-4 py-2 text-xs font-semibold ${teamTab === "invitations" ? "bg-white text-slate-950 shadow-sm ring-1 ring-slate-200" : "text-slate-500"}`}>
                  Invitations ({invitations.length})
                </button>
              )}
            </div>

            {canManage && teamTab === "members" && (
              <button type="button" onClick={() => setTeamTab("invitations")} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                <Mail className="size-4" />
                Invitations
              </button>
            )}
          </div>

          {teamTab === "members" ? (
            <div>
              {employees.some((employee) => !employee.googleConnected && employee.email === user.email) && (
                <div className="mb-4">
                  <GoogleIntegrationNotice mode="employee" />
                </div>
              )}
              <div className="space-y-3">
              {employees.map((employee) => (
                <div key={employee.id} className="relative rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center gap-3">
                    <UserAvatar name={employee.name} email={employee.email} image={employee.image} size={44} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold">{employee.name}</p>
                        {employee.googleConnected ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">Connected</span>
                        ) : (
                          <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">Needs setup</span>
                        )}
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-500">{employee.email}</p>
                       <div className="mt-2 flex flex-wrap items-center gap-1.5">
                         <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-semibold text-blue-700">{roleName(employee.role)}</span>
                         <span className="text-[10px] text-slate-600">{employee.jobTitle || "Position not set"}</span>
                         <span className="text-[10px] text-slate-400">· {employee.department || "Department not set"}</span>
                         <span className={"rounded-full px-2 py-0.5 text-[9px] font-semibold ring-1 ring-inset " + employeeStatusClass(employee.employmentStatus)}>{employeeStatusName(employee.employmentStatus)}</span>
                    </div>
                      </div>

                    {!employee.googleConnected && employee.email === user.email && (
                      <Link
                        href="/api/auth/google/start?intent=connect&returnTo=%2Fdashboard"
                        prefetch={false}
                        className="shrink-0 rounded-xl bg-slate-950 px-3 py-2.5 text-[10px] font-semibold text-white hover:bg-slate-800"
                      >
                        Setup Google
                      </Link>
                    )}

                    {canManage && employee.role === "EMPLOYEE" && (
                      <button
                        type="button"
                        onClick={() => setTeamActionFor((current) => current === employee.id ? null : employee.id)}
                        className="grid size-9 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"
                        aria-label={`More actions for ${employee.name}`}
                      >
                        <MoreHorizontal className="size-4" />
                      </button>
                    )}
                  </div>

                  {teamActionFor === employee.id && canManage && (
                    <div className="absolute right-4 top-14 z-20 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                      <button
                        type="button"
                        onClick={() => {
                          setTeamActionFor(null);
                          setConfirmation({ kind: "remove-employee", id: employee.id, name: employee.name, permanent: false });
                        }}
                        className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-slate-50"
                      >
                        <UsersRound className="mt-0.5 size-4 text-slate-500" />
                        <span>
                          <span className="block text-xs font-semibold text-slate-800">Remove access</span>
                          <span className="mt-1 block text-[10px] leading-4 text-slate-500">Deactivate this member but retain the user account.</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTeamActionFor(null);
                          setConfirmation({ kind: "remove-employee", id: employee.id, name: employee.name, permanent: true });
                        }}
                        className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-rose-50"
                      >
                        <Trash2 className="mt-0.5 size-4 text-rose-600" />
                        <span>
                          <span className="block text-xs font-semibold text-rose-700">Delete forever</span>
                          <span className="mt-1 block text-[10px] leading-4 text-rose-600">Permanently delete the employee account and access data.</span>
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {employees.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center text-xs text-slate-500">
                  No team members yet.
                </div>
              )}
              </div>
            </div>
          ) : (
            <div className="mt-5">
              {invitationsError && (
                <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3" role="alert">
                  <p className="text-xs text-rose-800">Invitations could not be loaded.</p>
                  <button
                    type="button"
                    onClick={() => void loadInvitations()}
                    className="shrink-0 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    Retry
                  </button>
                </div>
              )}
              {canManage && (
                <form onSubmit={inviteEmployee} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <input
                      required
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="name@company.com"
                      className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500"
                    />
                    <button type="submit" disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40">
                      <Plus className="size-4" />
                      Invite member
                    </button>
                  </div>
                  {inviteLink && (
                    <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3.5 py-3">
                      <p className="break-all text-[11px] leading-5 text-blue-900">{inviteLink}</p>
                      <button type="button" onClick={() => void navigator.clipboard.writeText(inviteLink)} className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-blue-700">
                        <Copy className="size-3.5" />
                        Copy invitation link
                      </button>
                    </div>
                  )}
                </form>
              )}

              <div className="mt-5">
                {invitesLoading ? (
                  <div className="grid gap-3">
                    <div className="h-20 animate-pulse rounded-2xl bg-slate-100" />
                    <div className="h-20 animate-pulse rounded-2xl bg-slate-100" />
                  </div>
                ) : invitations.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center text-xs text-slate-500">
                    No pending invitations.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {invitations.map((invite) => (
                      <div key={invite.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">{invite.email}</p>
                            <p className="mt-1 text-[11px] text-slate-500">
                              {invite.status === "PENDING" ? `Expires ${formatDate(invite.expiresAt)}` : `Expired ${formatDate(invite.expiresAt)}`}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button type="button" disabled={busy} onClick={() => void resendInvitation(invite.id)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40">
                              {invite.status === "EXPIRED" ? "Renew link" : "New link"}
                            </button>
                            <button type="button" disabled={busy} onClick={() => void cancelInvitation(invite.id)} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-40">
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </AppModal>

      <AppModal
        open={activeModal === "billing"}
        title="Billing details"
        subtitle="Compare plans, review current subscription usage, and view invoices generated from successful payments."
        size="xl"
        asPage
        onClose={closeFeedbackModal}
      >
        <div className="p-5 sm:p-6">
          {billingError && (
            <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3" role="alert">
              <p className="text-xs text-rose-800">Invoices could not be loaded.</p>
              <button
                type="button"
                onClick={() => void loadInvoices()}
                className="shrink-0 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                Retry
              </button>
            </div>
          )}
          {!data.company.profileComplete && (
            <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold text-amber-900">Company profile is incomplete</p>
                <p className="mt-1 text-[11px] leading-5 text-amber-800">
                  Company name, email, and phone are required before Razorpay checkout can start.
                </p>
              </div>
              <Link href="/dashboard/company-profile" onClick={closeFeedbackModal} className="inline-flex shrink-0 items-center justify-center rounded-xl bg-amber-900 px-3.5 py-2.5 text-xs font-semibold text-white">
                Complete profile
              </Link>
            </div>
          )}

          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-[720px] w-full text-left">
              <thead className="bg-slate-50">
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">Plan</th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">Price</th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">Employees</th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">Meetings</th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">Duration</th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">Action</th>
                </tr>
              </thead>
              <tbody>
                {billingPlans.map((item) => {
                  const id = item.id;
                  const isCurrent = id === planId;
                  const baseMinor = Math.round(item.priceInr * 100);
                  const discountMinor = Math.round((item.discountAmountInr ?? 0) * 100);
                  const discountedBaseMinor = Math.max(0, baseMinor - discountMinor);
                  const gstRate = data.gstEnabled ? (data.gstRatePercent || 0) : 0;
                  const totalWithGst = data.gstInclusive ? discountedBaseMinor : Math.round(discountedBaseMinor * (1 + gstRate / 100));
                  return (
                    <tr key={id} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold">{item.name}</p>
                          {isCurrent && <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">Current</span>}
                        </div>
                        {item.freeFeatureDays && (
                          <p className="mt-1 text-[10px] text-slate-400">{item.freeFeatureDays}-day feature window / {item.validityDays}-day cycle</p>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-sm font-semibold">{item.finalPriceInr === 0 ? "Free" : `₹${item.finalPriceInr}`}</p>
                        {item.priceInr > item.finalPriceInr && <p className="mt-1 text-[10px] font-semibold text-emerald-700">Save ₹{item.discountAmountInr.toFixed(2)}</p>}
                        {item.priceInr > 0 && (
                          <p className="mt-1 text-[10px] text-slate-400">+{data.gstEnabled ? data.gstRatePercent : 0}% GST · ₹{(totalWithGst / 100).toFixed(2)} total</p>
                        )}
                      </td>
                      <td className="px-4 py-4 text-xs text-slate-600">{item.maxEmployees}</td>
                      <td className="px-4 py-4 text-xs text-slate-600">{item.monthlyMeetingLimit}/month</td>
                      <td className="px-4 py-4 text-xs text-slate-600">{item.maxMeetingDurationMinutes} min</td>
                      <td className="px-4 py-4">
                        {item.status !== "PUBLIC" ? (
                          <button
                            type="button"
                            disabled
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-500 disabled:cursor-not-allowed"
                          >
                            {isCurrent ? "Current plan" : item.status === "COMING_SOON" ? "Coming soon" : "Private"}
                          </button>
                        ) : item.requiresPayment ? (
                          <RazorpayPlanButton
                            planId={id}
                            planName={item.name}
                            currentPlanId={planId}
                            onComplete={() => {
                              void loadInvoices();
                              void refreshAll();
                            }}
                            onError={(message) => setError(message)}
                          />
                        ) : (
                          <button
                            type="button"
                            disabled={busy || isCurrent || nowMs === null || paidAccessActive}
                            onClick={() => {
                              setBusy(true);
                              void api("/api/billing/free", {
                                method: "POST",
                                body: JSON.stringify({ planId: id })
                              })
                                .then(() => Promise.all([loadInvoices(), refreshAll()]))
                                .catch((error) => setError(error instanceof Error ? error.message : "FREE_PLAN_FAILED"))
                                .finally(() => setBusy(false));
                            }}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {isCurrent
                              ? "Current plan"
                              : nowMs === null
                                ? "Checking subscription…"
                                : paidAccessActive
                                  ? "Available after expiry"
                                  : "Select plan"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-4 py-4">
              <div>
                <p className="text-xs font-semibold text-slate-900">Current subscription</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {data.subscription?.status ?? "ACTIVE"} · {plan.name} · {subscriptionSource === "PAID" ? "Paid" : subscriptionSource === "ADMIN_GRANTED" ? "Admin granted" : "Free"}
                </p>
              </div>
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700">
                {data.subscription?.monthlyMeetingsUsed ?? 0} / {plan.monthlyMeetingLimit} used
              </span>
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 px-3.5 py-3">
                <p className="text-[10px] uppercase tracking-[0.1em] text-slate-400">Period ends</p>
                <p className="mt-1 text-xs font-semibold">{data.subscription?.periodEnd ? formatDate(data.subscription.periodEnd) : "—"}</p>
              </div>
              <div className="rounded-xl bg-slate-50 px-3.5 py-3">
                <p className="text-[10px] uppercase tracking-[0.1em] text-slate-400">Billing email</p>
                <p className="mt-1 truncate text-xs font-semibold">{data.company.email || "—"}</p>
              </div>
              <div className="rounded-xl bg-slate-50 px-3.5 py-3">
                <p className="text-[10px] uppercase tracking-[0.1em] text-slate-400">Billing phone</p>
                <p className="mt-1 text-xs font-semibold">{data.company.phone || "—"}</p>
              </div>
              {plan.freeFeatureDays && (
                <div className="rounded-xl bg-amber-50 px-3.5 py-3">
                  <p className="text-[10px] uppercase tracking-[0.1em] text-amber-600">Free feature window</p>
                  <p className="mt-1 text-xs font-semibold">{data.featureLocked ? "Locked until renewal" : `${plan.freeFeatureDays} days available`}</p>
                </div>
              )}
            </div>
          </section>

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-4">
              <p className="text-xs font-semibold text-slate-900">Invoices</p>
              <p className="mt-1 text-[11px] text-slate-500">
                Every active subscription has an invoice record. Paid plans include GST; free and admin-granted access is clearly labelled.
              </p>
            </div>

            {billingLoading ? (
              <div className="space-y-3 p-4">
                <div className="h-20 animate-pulse rounded-xl bg-slate-100" />
                <div className="h-20 animate-pulse rounded-xl bg-slate-100" />
              </div>
            ) : invoices.length === 0 ? (
              <div className="p-10 text-center">
                <CreditCard className="mx-auto size-5 text-slate-300" />
                <p className="mt-3 text-xs font-semibold text-slate-700">No invoices yet</p>
                <p className="mt-1 text-[11px] text-slate-400">An invoice is created automatically for active paid, free, or admin-granted access.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {invoices.map((invoice) => {
                  const tax = invoice.taxSnapshot;
                  return (
                    <div key={invoice.id} className="px-4 py-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold">{invoice.invoiceNumber}</p>
                            <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                              invoice.source === "PAID"
                                ? "bg-emerald-50 text-emerald-700"
                                : invoice.source === "ADMIN_GRANTED"
                                  ? "bg-violet-50 text-violet-700"
                                  : "bg-slate-100 text-slate-700"
                            }`}>
                              {invoice.source === "PAID" ? "Paid" : invoice.source === "ADMIN_GRANTED" ? "Admin granted" : "Free"}
                            </span>
                            {invoice.isCurrentPlan && (
                              <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700">Current plan</span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            {invoice.planSnapshot.name} · {formatDate(invoice.issuedAt)}
                          </p>
                          <p className="mt-2 text-[11px] font-medium text-slate-600">
                            {tax?.enabled
                              ? `GST @ ${tax.ratePercent.toFixed(2)}% ${tax.inclusive ? "included" : "added"} · taxable ${(tax.taxableAmount / 100).toFixed(2)} · GST ${(tax.gstAmount / 100).toFixed(2)}`
                              : "GST not applied"}
                          </p>
                          <p className="mt-2 break-all text-[10px] text-slate-400">
                            {invoice.source === "PAID" ? `Payment: ${invoice.providerPaymentId}` : invoice.source === "ADMIN_GRANTED" ? "Access granted by platform admin" : "Free plan access"}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                          <div className="text-left lg:text-right">
                            <p className="text-lg font-semibold">₹{(invoice.amount / 100).toFixed(2)}</p>
                            <p className="mt-1 text-[10px] uppercase tracking-[0.1em] text-slate-400">{invoice.currency} · {invoice.source === "PAID" ? "total paid" : "access value"}</p>
                          </div>
                          <Link
                            href={`/billing/invoices/${invoice.id}` as Route}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            View
                            <ArrowUpRight className="size-3.5" />
                          </Link>
                          <a
                            href={`/api/billing/invoices/${invoice.id}/pdf`}
                            download
                            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-3 py-2.5 text-xs font-semibold text-white hover:bg-slate-800"
                          >
                            PDF
                          </a>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-2 text-[11px] text-slate-500 sm:grid-cols-3">
                        <span>{invoice.companySnapshot.name}</span>
                        <span>{invoice.companySnapshot.email}</span>
                        <span>{invoice.companySnapshot.phone}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </AppModal>

      <ConfirmDialog
        open={Boolean(confirmation)}
        title={confirmationTitle}
        description={confirmationDescription}
        confirmLabel={confirmationLabel}
        tone={confirmationTone === "success" ? "success" : "neutral"}
        destructive={confirmationTone === "destructive"}
        busy={
          confirmation?.kind === "remove-employee"
            ? deletingEmployeeId === confirmation.id
            : busy ||
              (confirmation?.kind === "end-meeting" && endingRequestId === confirmation.id) ||
              (confirmation?.kind === "respond-request" && actingRequestId === confirmation.id)
        }
        onCancel={() => {
          if (!busy && !deletingEmployeeId && !endingRequestId && !actingRequestId) setConfirmation(null);
        }}
        onConfirm={() => void confirmDialogAction()}
      />
      </div>
    </main>
  );
}

function Building2Icon() {
  return <span className="relative block size-6"><span className="absolute inset-x-1 bottom-0 top-2 rounded-sm bg-white" /><span className="absolute left-0 top-1 h-1.5 w-2 rounded-sm bg-white" /><span className="absolute right-0 top-1 h-1.5 w-2 rounded-sm bg-white" /></span>;
}
