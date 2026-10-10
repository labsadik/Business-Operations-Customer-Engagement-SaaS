"use client";

import Link from "next/link";
import type { Route } from "next";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useNavigationLabels } from "@/components/navigation-labels-provider";
import {
  Building2,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  ClipboardList,
  CreditCard,
  FolderOpen,
  LifeBuoy,
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
  taskManagementEnabled?: boolean;
  vaultEnabled?: boolean;
  canManage?: boolean;
  adminManaged?: boolean;
  activePanel?: Panel | null;
  activeSettingsSection?: "public" | "announcements";
  activeProfile?: boolean;
  onOpenPanel?: (panel: Panel, section?: "announcements") => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  onNavigateOverview?: () => void;
};

const primaryItems = [
  { key: "dashboard", href: "/dashboard", label: "Overview", icon: BarChart3 }
] as const;

export default function WorkspaceSidebar({
  taskManagementEnabled = false,
  vaultEnabled = false,
  canManage = false,
  adminManaged = false,
  activePanel = null,
  activeSettingsSection = "public",
  activeProfile = false,
  onOpenPanel,
  collapsed = false,
  onToggleCollapsed,
  onNavigateOverview
}: WorkspaceSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { labels } = useNavigationLabels();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(true);

  const isDashboard = pathname === "/dashboard" && !activePanel;
  const isTasks = pathname === "/dashboard/tasks" || pathname.startsWith("/dashboard/tasks/");
  const isVault = pathname === "/dashboard/vault";
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

  const mobileItemClass = (selected: boolean) => [
    "flex min-w-0 items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
    selected ? "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-100" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
  ].join(" ");

  return (
    <>
      <aside className={`fixed inset-y-0 left-0 z-50 hidden flex-col border-r border-slate-200/90 bg-white transition-[width] duration-200 lg:flex ${collapsed ? "w-20" : "w-72"}`}>
        <div className={`border-b border-slate-200/80 ${collapsed ? "px-2 py-3" : "px-4 py-4"}`}>
          <div className={`flex items-center ${collapsed ? "justify-center" : "gap-3"}`}>
            <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-slate-950 text-white shadow-sm">
              <Building2 className="size-5" aria-hidden="true" />
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold tracking-tight text-slate-950">{companyName || "Company workspace"}</p>
                <p className="mt-1 truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Powered by Conventus</p>
              </div>
            )}
          </div>
          {onToggleCollapsed && (
            <button
              type="button"
              onClick={onToggleCollapsed}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className={`grid size-9 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${collapsed ? "mx-auto mt-3" : "ml-auto mt-3"}`}
            >
              {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            </button>
          )}
        </div>

        <nav aria-label="Company workspace navigation" className={`flex-1 overflow-y-auto py-4 ${collapsed ? "px-2" : "px-4"}`}>

          <div className="space-y-1">
            {primaryItems.map((item) => {
              const selected = active("dashboard");
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href as Route}
                  onClick={(event) => {
                    if (onNavigateOverview) {
                      event.preventDefault();
                      onNavigateOverview();
                    }
                  }}
                  className={buttonClass(selected)}
                  title={labels.dashboard}
                >
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
              <Link href={"/dashboard/tasks" as Route} className={buttonClass(isTasks)} title="Task Management">
                <ClipboardList className={`size-4 ${iconClass(isTasks)}`} />
                <span className={collapsed ? "sr-only" : ""}>Task Management</span>
                {!collapsed && <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-blue-700">New</span>}
                {isTasks && !collapsed && <span className="ml-auto size-1.5 rounded-full bg-blue-600" />}
              </Link>
            )}

            {vaultEnabled && (
              <Link href={"/dashboard/vault" as Route} className={buttonClass(isVault)} title="Cloud Vault">
                <FolderOpen className={`size-4 ${iconClass(isVault)}`} />
                <span className={collapsed ? "sr-only" : ""}>Cloud Vault</span>
                {!collapsed && <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-blue-700">New</span>}
                {isVault && !collapsed && <span className="ml-auto size-1.5 rounded-full bg-blue-600" />}
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

          {!adminManaged && (
            <div className="mt-4 border-t border-slate-200/80 pt-4">
              <button
                type="button"
                onClick={() => open("support-tickets")}
                className={buttonClass(active("support-tickets"))}
                title="Support tickets"
              >
                <LifeBuoy className={`size-4 ${iconClass(active("support-tickets"))}`} />
                <span className={collapsed ? "sr-only" : ""}>Support tickets</span>
              </button>
            </div>
          )}

        </nav>

        {adminManaged && (
          <div className="border-t border-slate-200/80 p-4">
            <Link href="/admin" title="Return to admin console" className={`flex items-center rounded-xl py-3 text-xs font-semibold text-blue-700 hover:bg-blue-50 ${collapsed ? "justify-center px-2.5" : "gap-3 px-3.5"}`}>
              <ShieldCheck className="size-4" />
              <span className={collapsed ? "sr-only" : ""}>Return to admin console</span>
              {!collapsed && <ArrowUpRight className="ml-auto size-3.5" />}
            </Link>
          </div>
        )}
      </aside>

      <nav aria-label="Mobile company workspace navigation" className="border-b border-slate-200/90 bg-white/95 backdrop-blur-lg lg:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-950 text-white">
              <Building2 className="size-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold tracking-tight text-slate-950">{companyName || "Company workspace"}</p>
              <p className="mt-0.5 truncate text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">Powered by Conventus</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-company-workspace-menu"
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {mobileMenuOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
            <span>{mobileMenuOpen ? "Hide menu" : "Show menu"}</span>
          </button>
        </div>
        {mobileMenuOpen && (
          <div id="mobile-company-workspace-menu" className="border-t border-slate-200/80">
            <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
              <Link
                href="/dashboard"
                onClick={(event) => {
                  if (onNavigateOverview) {
                    event.preventDefault();
                    onNavigateOverview();
                  }
                }}
                className={mobileItemClass(isDashboard)}
                title={labels.dashboard}
              >
                <BarChart3 className="size-4 shrink-0" />
                <span className="min-w-0 truncate">{labels.dashboard}</span>
              </Link>
              <button type="button" onClick={() => open("meetings")} className={mobileItemClass(active("meetings"))}>
                <CalendarDays className="size-4 shrink-0" /><span className="min-w-0 truncate">{labels.meetings}</span>
              </button>
              <button type="button" onClick={() => open("team")} className={mobileItemClass(active("team"))}>
                <UsersRound className="size-4 shrink-0" /><span className="min-w-0 truncate">{labels.team}</span>
              </button>
              {taskManagementEnabled && (
                <Link href={"/dashboard/tasks" as Route} className={mobileItemClass(isTasks)} title="Task Management">
                  <ClipboardList className="size-4 shrink-0" />
                  <span className="min-w-0 truncate">Task Management</span>
                  <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-blue-700">New</span>
                </Link>
              )}
              {vaultEnabled && (
                <Link href={"/dashboard/vault" as Route} className={mobileItemClass(isVault)} title="Cloud Vault">
                  <FolderOpen className="size-4 shrink-0" />
                  <span className="min-w-0 truncate">Cloud Vault</span>
                  <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-blue-700">New</span>
                </Link>
              )}
              <button type="button" onClick={() => open("feedback")} className={mobileItemClass(active("feedback"))}>
                <MessageSquareText className="size-4 shrink-0" /><span className="min-w-0 truncate">{labels.feedback}</span>
              </button>
              {canManage && (
                <button type="button" onClick={() => open("settings", "announcements")} className={mobileItemClass(activePanel === "settings" && activeSettingsSection === "announcements" && !activeProfile)}>
                  <Megaphone className="size-4 shrink-0" /><span className="min-w-0 truncate">{labels.announcements}</span>
                </button>
              )}
              {canManage && (
                <button type="button" onClick={() => open("billing")} className={mobileItemClass(active("billing"))}>
                  <CreditCard className="size-4 shrink-0" /><span className="min-w-0 truncate">{labels.billing}</span>
                </button>
              )}
              {canManage && (
                <button type="button" onClick={() => open("settings")} className={mobileItemClass(activePanel === "settings" && activeSettingsSection !== "announcements" && !activeProfile)}>
                  <Settings2 className="size-4 shrink-0" /><span className="min-w-0 truncate">{labels.workspaceSettings}</span>
                </button>
              )}
              <Link href="/dashboard/company-profile" className={mobileItemClass(active("profile"))} title={labels.companyProfile}>
                <Building2 className="size-4 shrink-0" /><span className="min-w-0 truncate">{labels.companyProfile}</span>
              </Link>
              {!adminManaged && (
                <button type="button" onClick={() => open("support-tickets")} className={mobileItemClass(active("support-tickets"))}>
                  <LifeBuoy className="size-4 shrink-0" /><span className="min-w-0 truncate">Support tickets</span>
                </button>
              )}
            </div>
          </div>
        )}
      </nav>
    </>
  );
}
