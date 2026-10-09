"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import UserAvatar from "@/components/user-avatar";
import { useNavigationLabels } from "@/components/navigation-labels-provider";
import {
  Building2,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  ClipboardList,
  CreditCard,
  Globe2,
  LifeBuoy,
  LogOut,
  Megaphone,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Settings2,
  ShieldCheck,
  UsersRound
} from "lucide-react";

type Panel = "meetings" | "team" | "settings" | "billing" | "feedback" | "support-tickets";

type WorkspaceSidebarProps = {
  companyName: string;
  userName: string;
  userEmail: string;
  userImage?: string;
  currentRole: string;
  taskManagementEnabled?: boolean;
  canManage?: boolean;
  adminManaged?: boolean;
  activePanel?: Panel | null;
  activeSettingsSection?: "public" | "announcements";
  activeProfile?: boolean;
  onOpenPanel?: (panel: Panel, section?: "announcements") => void;
  avatarFallback?: string;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
};

const primaryItems = [
  { key: "dashboard", href: "/dashboard", label: "Overview", icon: BarChart3 }
] as const;

const defaultSupportTicketsLabel = "Raise a ticket";

export default function WorkspaceSidebar({
  companyName,
  userName,
  userEmail,
  userImage,
  currentRole,
  taskManagementEnabled = false,
  canManage = false,
  adminManaged = false,
  activePanel = null,
  activeSettingsSection = "public",
  activeProfile = false,
  onOpenPanel,
  avatarFallback,
  collapsed = false,
  onToggleCollapsed
}: WorkspaceSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { labels } = useNavigationLabels();

  const isDashboard = pathname === "/dashboard" && !activePanel;
  const isTasks = pathname === "/dashboard/tasks" || pathname.startsWith("/dashboard/tasks/");
  const active = (key: "dashboard" | Panel | "profile") => {
    if (key === "dashboard") return isDashboard;
    if (key === "profile") return activeProfile;
    return activePanel === key;
  };

  const open = (panel: Panel, section?: "announcements") => {
    if (onOpenPanel) {
      onOpenPanel(panel, section);
      return;
    }
    const query = new URLSearchParams({ panel });
    if (section) query.set("section", section);
    router.push(`/dashboard?${query.toString()}`);
  };

  const buttonClass = (selected: boolean) => [
    "group flex w-full items-center rounded-xl py-3 text-left text-sm font-semibold transition",
    collapsed ? "justify-center px-2.5" : "gap-3 px-3.5",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
    selected
      ? "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-100"
      : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
  ].join(" ");

  const iconClass = (selected: boolean) =>
    selected ? "text-blue-600" : "text-slate-400 group-hover:text-slate-700";

  return (
    <>
      <aside className={`fixed inset-y-0 left-0 z-50 hidden flex-col border-r border-slate-200/90 bg-white transition-[width] duration-200 lg:flex ${collapsed ? "w-20" : "w-72"}`}>
        <div className={`border-b border-slate-200/80 py-4 ${collapsed ? "px-2" : "px-4"}`}>
          <div className={`mb-3 flex items-center ${collapsed ? "justify-center" : "justify-between gap-2"}`}>
            {!collapsed && <p className="truncate text-xs font-semibold text-slate-950">{companyName}</p>}
            {onToggleCollapsed && (
              <button
                type="button"
                onClick={onToggleCollapsed}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                className="grid size-9 shrink-0 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
              </button>
            )}
          </div>
          <div className={`rounded-2xl bg-[#faf9f1] p-2.5 ring-1 ring-inset ring-amber-100/80 ${collapsed ? "flex justify-center" : "p-3"}`}>
            <div className={`flex items-center ${collapsed ? "justify-center" : "gap-2"}`}>
              <UserAvatar name={userName} email={userEmail} image={userImage} fallbackImage={avatarFallback} size={30} className="border-0 bg-blue-600 text-white" />
              {!collapsed && (
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-semibold text-slate-800">{userName}</p>
                  <p className="truncate text-[10px] text-slate-500">{userEmail}</p>
                </div>
              )}
            </div>
            {!collapsed && (
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                {currentRole.replaceAll("_", " ")}
              </div>
            )}
          </div>
        </div>

        <nav aria-label="Company workspace navigation" className={`flex-1 overflow-y-auto py-5 ${collapsed ? "px-2" : "px-4"}`}>
          {!collapsed && <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Workspace</p>

          <div className="space-y-1">
            {primaryItems.map((item) => {
              const selected = active("dashboard");
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href as Route} className={buttonClass(selected)} title={labels.dashboard}>
                  <Icon className={`size-4 ${iconClass(selected)}`} />
                  <span className={collapsed ? "sr-only" : ""}>{labels.dashboard}</span>
                  {selected && !collapsed && <span className="ml-auto size-1.5 rounded-full bg-blue-600" />}
                </Link>
              );
            })}

            <button type="button" onClick={() => open("meetings")} className={buttonClass(active("meetings"))} title={labels.meetings}>
              <CalendarDays className={`size-4 ${iconClass(active("meetings"))}`} />
              <span className={collapsed ? "sr-only" : ""}>{labels.meetings}</span>
            </button>

            <button type="button" onClick={() => open("team")} className={buttonClass(active("team"))} title={labels.team}>
              <UsersRound className={`size-4 ${iconClass(active("team"))}`} />
              <span className={collapsed ? "sr-only" : ""}>{labels.team}</span>
            </button>

            {taskManagementEnabled && (
              <Link href={"/dashboard/tasks" as Route} className={buttonClass(isTasks)} title="Tasks">
                <ClipboardList className={`size-4 ${iconClass(isTasks)}`} />
                <span className={collapsed ? "sr-only" : ""}>Tasks</span>
                {isTasks && !collapsed && <span className="ml-auto size-1.5 rounded-full bg-blue-600" />}
              </Link>
            )}

            <button type="button" onClick={() => open("feedback")} className={buttonClass(active("feedback"))} title={labels.feedback}>
              <MessageSquareText className={`size-4 ${iconClass(active("feedback"))}`} />
              <span className={collapsed ? "sr-only" : ""}>{labels.feedback}</span>
            </button>
            {canManage && (
              <>
                <button type="button" onClick={() => open("settings", "announcements")} className={buttonClass(activePanel === "settings" && activeSettingsSection === "announcements" && !activeProfile)} title={labels.announcements}>
                  <Megaphone className={`size-4 ${iconClass(activePanel === "settings" && activeSettingsSection === "announcements" && !activeProfile)}`} />
                  <span className={collapsed ? "sr-only" : ""}>{labels.announcements}</span>
                </button>

                <button type="button" onClick={() => open("billing")} className={buttonClass(active("billing"))} title={labels.billing}>
                  <CreditCard className={`size-4 ${iconClass(active("billing"))}`} />
                  <span className={collapsed ? "sr-only" : ""}>{labels.billing}</span>
                </button>

                <button type="button" onClick={() => open("settings")} className={buttonClass(activePanel === "settings" && activeSettingsSection !== "announcements" && !activeProfile)} title={labels.workspaceSettings}>
                  <Settings2 className={`size-4 ${iconClass(activePanel === "settings" && activeSettingsSection !== "announcements" && !activeProfile)}`} />
                  <span className={collapsed ? "sr-only" : ""}>{labels.workspaceSettings}</span>
                </button>
              </>
            )}

            <Link href="/dashboard/company-profile" className={buttonClass(active("profile"))} title={labels.companyProfile}>
              <Building2 className={`size-4 ${iconClass(active("profile"))}`} />
              <span className={collapsed ? "sr-only" : ""}>{labels.companyProfile}</span>
            </Link>
          </div>

          {currentRole !== "PLATFORM_ADMIN" && (
            <div className="mt-7">
              {!collapsed && <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Platform Support</p>}
              <button
                type="button"
                onClick={() => open("support-tickets")}
                className={buttonClass(active("support-tickets"))}
                title="Platform Support — Raise a ticket"
                aria-label="Raise a ticket to Platform Support"
              >
                <LifeBuoy className={`size-4 ${iconClass(active("support-tickets"))}`} />
                <span className={collapsed ? "sr-only" : ""}>{defaultSupportTicketsLabel}</span>
              </button>
            </div>
          )}

          {!collapsed && <p className="mt-7 px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">External</p>}

          <div className="space-y-1">
            <Link href="/" title="Conventus home" className={buttonClass(false)}>
              <Globe2 className="size-4 text-slate-400 group-hover:text-slate-700" />
              <span className={collapsed ? "sr-only" : ""}>Conventus home</span>
              {!collapsed && <ArrowUpRight className="ml-auto size-3.5 text-slate-300" />}
            </Link>

          </div>
        </nav>

        <div className="border-t border-slate-200/80 p-4">
          {adminManaged && (
            <Link href="/admin" title="Return to admin console" className={`mb-2 flex items-center rounded-xl py-3 text-xs font-semibold text-blue-700 hover:bg-blue-50 ${collapsed ? "justify-center px-2.5" : "gap-3 px-3.5"}`}>
              <ShieldCheck className="size-4" />
              <span className={collapsed ? "sr-only" : ""}>Return to admin console</span>
              {!collapsed && <ArrowUpRight className="ml-auto size-3.5" />}
            </Link>
          )}
          {!collapsed && <p className="px-3 pb-2 text-[10px] text-slate-400">Signed in as {userEmail}</p>}
          <form action="/api/auth/logout" method="post">
            <button title="Sign out" className={`flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${collapsed ? "px-2" : ""}`}>
              {collapsed ? <LogOut className="size-4" /> : "Sign out"}
            </button>
          </form>
        </div>
      </aside>

      <nav aria-label="Mobile company workspace navigation" className="border-b border-slate-200/90 bg-white/95 backdrop-blur-lg lg:hidden">
        <div className="flex items-center gap-2 overflow-x-auto px-4 py-2.5">
          <Link href="/dashboard" className={`shrink-0 rounded-xl px-3 py-2 text-xs font-semibold ${isDashboard ? "bg-blue-50 text-blue-700 ring-1 ring-blue-100" : "text-slate-600 hover:bg-slate-50"}`}>
            {labels.dashboard}
          </Link>
          <button type="button" onClick={() => open("meetings")} className={`shrink-0 rounded-xl px-3 py-2 text-xs font-semibold ${active("meetings") ? "bg-blue-50 text-blue-700 ring-1 ring-blue-100" : "text-slate-600 hover:bg-slate-50"}`}>{labels.meetings}</button>
          <button type="button" onClick={() => open("team")} className={`shrink-0 rounded-xl px-3 py-2 text-xs font-semibold ${active("team") ? "bg-blue-50 text-blue-700 ring-1 ring-blue-100" : "text-slate-600 hover:bg-slate-50"}`}>{labels.team}</button>
          {taskManagementEnabled && <Link href={"/dashboard/tasks" as Route} className={`shrink-0 rounded-xl px-3 py-2 text-xs font-semibold ${isTasks ? "bg-blue-50 text-blue-700 ring-1 ring-blue-100" : "text-slate-600 hover:bg-slate-50"}`}>Tasks</Link>}
          <button type="button" onClick={() => open("feedback")} className={`shrink-0 rounded-xl px-3 py-2 text-xs font-semibold ${active("feedback") ? "bg-blue-50 text-blue-700 ring-1 ring-blue-100" : "text-slate-600 hover:bg-slate-50"}`}>{labels.feedback}</button>
          {currentRole !== "PLATFORM_ADMIN" && <button type="button" onClick={() => open("support-tickets")} className={`shrink-0 rounded-xl px-3 py-2 text-xs font-semibold ${active("support-tickets") ? "bg-blue-50 text-blue-700 ring-1 ring-blue-100" : "text-slate-600 hover:bg-slate-50"}`}>{defaultSupportTicketsLabel}</button>}
          {canManage && <button type="button" onClick={() => open("settings", "announcements")} className={`shrink-0 rounded-xl px-3 py-2 text-xs font-semibold ${activePanel === "settings" && activeSettingsSection === "announcements" ? "bg-blue-50 text-blue-700 ring-1 ring-blue-100" : "text-slate-600 hover:bg-slate-50"}`}>{labels.announcements}</button>}
          {canManage && <button type="button" onClick={() => open("billing")} className={`shrink-0 rounded-xl px-3 py-2 text-xs font-semibold ${active("billing") ? "bg-blue-50 text-blue-700 ring-1 ring-blue-100" : "text-slate-600 hover:bg-slate-50"}`}>{labels.billing}</button>}
          {canManage && <button type="button" onClick={() => open("settings")} className={`shrink-0 rounded-xl px-3 py-2 text-xs font-semibold ${activePanel === "settings" && activeSettingsSection !== "announcements" ? "bg-blue-50 text-blue-700 ring-1 ring-blue-100" : "text-slate-600 hover:bg-slate-50"}`}>{labels.workspaceSettings}</button>}
          <Link href="/dashboard/company-profile" className={`shrink-0 rounded-xl px-3 py-2 text-xs font-semibold ${active("profile") ? "bg-blue-50 text-blue-700 ring-1 ring-blue-100" : "text-slate-600 hover:bg-slate-50"}`}>{labels.companyProfile}</Link>
        </div>
      </nav>
    </>
  );
}
