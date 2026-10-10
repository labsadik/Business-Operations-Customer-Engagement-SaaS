"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
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

const SIDEBAR_SCROLL_KEY = "conventus:sidebar-scroll";

const primaryItems = [
  { key: "dashboard", href: "/dashboard", label: "Overview", icon: BarChart3 }
] as const;

type SidebarKey =
  | "dashboard"
  | "meetings"
  | "team"
  | "tasks"
  | "vault"
  | "profile"
  | "announcements"
  | "billing"
  | "settings"
  | "feedback"
  | "support-tickets";

export default function WorkspaceSidebar({
  companyName,
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
  const navRef = useRef<HTMLElement | null>(null);
  const scrollPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDashboard = pathname === "/dashboard" && !activePanel;
  const isTasks = pathname === "/dashboard/tasks" || pathname.startsWith("/dashboard/tasks/");
  const isVault = pathname === "/dashboard/vault";
  const isProfile = activeProfile || pathname === "/dashboard/company-profile" || pathname.startsWith("/dashboard/company-profile/");
  const isAnnouncements = activePanel === "settings" && activeSettingsSection === "announcements" && !activeProfile;
  const isSettings = activePanel === "settings" && activeSettingsSection !== "announcements" && !activeProfile;

  const isActive = (key: SidebarKey) => {
    switch (key) {
      case "dashboard": return isDashboard;
      case "meetings": return activePanel === "meetings";
      case "team": return activePanel === "team";
      case "tasks": return isTasks;
      case "vault": return isVault;
      case "profile": return isProfile;
      case "announcements": return isAnnouncements;
      case "billing": return activePanel === "billing";
      case "settings": return isSettings;
      case "feedback": return activePanel === "feedback";
      case "support-tickets": return activePanel === "support-tickets";
    }
  };

  const persistScrollPosition = useCallback((top?: number) => {
    try {
      const scrollTop = top ?? navRef.current?.scrollTop ?? 0;
      sessionStorage.setItem(SIDEBAR_SCROLL_KEY, JSON.stringify({
        workspace: companyName,
        top: Math.max(0, scrollTop)
      }));
    } catch {
      // Scroll retention is progressive enhancement and must not block navigation.
    }
  }, [companyName]);

  const handleNavScroll = (top: number) => {
    if (scrollPersistTimerRef.current) clearTimeout(scrollPersistTimerRef.current);
    // Capture the value from this scroll event so a later route change cannot lose it.
    scrollPersistTimerRef.current = setTimeout(() => {
      persistScrollPosition(top);
      scrollPersistTimerRef.current = null;
    }, 120);
  };

  const attachNavRef = useCallback((nav: HTMLElement | null) => {
    navRef.current = nav;
    if (!nav) return;

    // A callback ref runs during the commit, restoring the scroll before the first visible paint.
    try {
      const saved = sessionStorage.getItem(SIDEBAR_SCROLL_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as { workspace?: string; top?: number };
        nav.scrollTop = parsed.workspace === companyName &&
          typeof parsed.top === "number" &&
          Number.isFinite(parsed.top)
          ? Math.max(0, parsed.top)
          : 0;
      } else {
        nav.scrollTop = 0;
      }
    } catch {
      // Invalid or unavailable session storage falls back to the browser's default position.
    }
  }, [companyName]);

  useEffect(() => {
    return () => {
      if (scrollPersistTimerRef.current) {
        clearTimeout(scrollPersistTimerRef.current);
        scrollPersistTimerRef.current = null;
      }
      const nav = navRef.current;
      if (nav) persistScrollPosition(nav.scrollTop);
    };
  }, [companyName, persistScrollPosition]);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav || nav.clientHeight === 0) return;

    const activeItem = nav.querySelector<HTMLElement>('[data-sidebar-active="true"]');
    if (!activeItem) return;

    const navRect = nav.getBoundingClientRect();
    const itemRect = activeItem.getBoundingClientRect();
    if (itemRect.top < navRect.top || itemRect.bottom > navRect.bottom) {
      activeItem.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    }
    persistScrollPosition(nav.scrollTop);
  }, [pathname, activePanel, activeSettingsSection, activeProfile, isTasks, isVault, canManage, taskManagementEnabled, vaultEnabled, companyName, persistScrollPosition]);

  const open = (panel: Panel, section?: "announcements") => {
    persistScrollPosition();
    if (onOpenPanel) {
      onOpenPanel(panel, section);
      return;
    }
    const query = new URLSearchParams({ panel });
    if (section) query.set("section", section);
    router.push(`/dashboard?${query.toString()}`);
  };

  const buttonClass = (selected: boolean) => [
    "group relative flex w-full items-center rounded-xl py-2.5 text-left text-[13px] font-medium transition-colors",
    collapsed ? "justify-center px-1.5" : "gap-3 px-3",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
    selected
      ? "bg-blue-50/80 font-semibold text-blue-700 ring-1 ring-inset ring-blue-100 before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-r-full before:bg-blue-600"
      : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
  ].join(" ");

  const iconClass = (selected: boolean) =>
    selected ? "text-blue-600" : "text-slate-400 group-hover:text-slate-700";

  const mobileItemClass = (selected: boolean) => [
    "group flex min-w-0 items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
    selected ? "bg-blue-50/80 text-blue-700 ring-1 ring-inset ring-blue-100" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
  ].join(" ");

  const groupHeading = (label: string) => (
    <div className={`flex items-center ${collapsed ? "justify-center px-1 py-3" : "px-3 pb-2 pt-1"}`}>
      {collapsed ? (
        <span className="h-px w-7 bg-slate-200" aria-hidden="true" />
      ) : (
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      )}
    </div>
  );

  const mobileGroupHeading = (label: string) => (
    <h2 className="px-1 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
      {label}
    </h2>
  );

  return (
    <>
      <aside className={`fixed inset-y-0 left-0 z-50 hidden flex-col border-r border-slate-200/90 bg-white transition-[width] duration-200 lg:flex ${collapsed ? "w-20" : "w-72"}`}>
        <div className={`border-b border-slate-200/80 ${collapsed ? "px-2 py-3" : "px-3.5 py-3.5"}`}>
          <div className={`flex items-center justify-between ${collapsed ? "gap-1" : "gap-2.5"}`}>
            <div className={`flex min-w-0 items-center ${collapsed ? "justify-center" : "gap-3"}`}>
              <div className={`grid shrink-0 place-items-center rounded-xl bg-slate-950 text-white shadow-sm ${collapsed ? "size-7" : "size-10 rounded-2xl"}`}>
                <Building2 className={collapsed ? "size-4" : "size-5"} aria-hidden="true" />
              </div>
              {!collapsed && (
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold tracking-tight text-slate-950">{companyName || "Company workspace"}</p>
                  <p className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Powered by Conventus</p>
                </div>
              )}
            </div>
            {onToggleCollapsed && (
              <button
                type="button"
                onClick={onToggleCollapsed}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                className="grid size-8 shrink-0 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
              </button>
            )}
          </div>
        </div>

        <nav
          ref={attachNavRef}
          aria-label="Company workspace navigation"
          onScroll={(event) => handleNavScroll(event.currentTarget.scrollTop)}
          className={`flex-1 overflow-y-auto overscroll-contain py-2 ${collapsed ? "px-2" : "px-3"}`}
        >
          <div role="group" aria-label="Core Workspace" className="mt-3 first:mt-0">
            {groupHeading("Core Workspace")}
            {primaryItems.map((item) => {
              const selected = isActive("dashboard");
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href as Route}
                  onClick={(event) => {
                    persistScrollPosition();
                    if (onNavigateOverview) {
                      event.preventDefault();
                      onNavigateOverview();
                    }
                  }}
                  className={buttonClass(selected)}
                  title={labels.dashboard}
                  aria-current={selected ? "page" : undefined}
                  data-sidebar-active={selected ? "true" : "false"}
                  data-sidebar-key="dashboard"
                >
                  <Icon className={`size-4 shrink-0 ${iconClass(selected)}`} />
                  <span className={collapsed ? "sr-only" : "min-w-0 truncate"}>{labels.dashboard}</span>
                </Link>
              );
            })}
            <button type="button" onClick={() => open("meetings")} className={buttonClass(isActive("meetings"))} title={labels.meetings} aria-pressed={isActive("meetings")} data-sidebar-active={isActive("meetings") ? "true" : "false"} data-sidebar-key="meetings">
              <CalendarDays className={`size-4 shrink-0 ${iconClass(isActive("meetings"))}`} />
              <span className={collapsed ? "sr-only" : "min-w-0 truncate"}>{labels.meetings}</span>
            </button>
            <button type="button" onClick={() => open("team")} className={buttonClass(isActive("team"))} title={labels.team} aria-pressed={isActive("team")} data-sidebar-active={isActive("team") ? "true" : "false"} data-sidebar-key="team">
              <UsersRound className={`size-4 shrink-0 ${iconClass(isActive("team"))}`} />
              <span className={collapsed ? "sr-only" : "min-w-0 truncate"}>{labels.team}</span>
            </button>
          </div>

          {(taskManagementEnabled || vaultEnabled) && (
            <div role="group" aria-label="Workspace Tools" className="mt-4">
              {groupHeading("Workspace Tools")}
              {taskManagementEnabled && (
                <Link href={"/dashboard/tasks" as Route} onClick={() => persistScrollPosition()} className={buttonClass(isTasks)} title="Task Management" aria-current={isTasks ? "page" : undefined} data-sidebar-active={isTasks ? "true" : "false"} data-sidebar-key="tasks">
                  <ClipboardList className={`size-4 shrink-0 ${iconClass(isTasks)}`} />
                  <span className={collapsed ? "sr-only" : "min-w-0 truncate"}>Task Management</span>
                  {!collapsed && <span className="ml-auto rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-blue-700">New</span>}
                </Link>
              )}
              {vaultEnabled && (
                <Link href={"/dashboard/vault" as Route} onClick={() => persistScrollPosition()} className={buttonClass(isVault)} title="Cloud Vault" aria-current={isVault ? "page" : undefined} data-sidebar-active={isVault ? "true" : "false"} data-sidebar-key="vault">
                  <FolderOpen className={`size-4 shrink-0 ${iconClass(isVault)}`} />
                  <span className={collapsed ? "sr-only" : "min-w-0 truncate"}>Cloud Vault</span>
                  {!collapsed && <span className="ml-auto rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-blue-700">New</span>}
                </Link>
              )}
            </div>
          )}

          {canManage && (
            <div role="group" aria-label="Workspace Management" className="mt-4">
              {groupHeading("Workspace Management")}
              <Link href={"/dashboard/company-profile" as Route} onClick={() => persistScrollPosition()} className={buttonClass(isProfile)} title={labels.companyProfile} aria-current={isProfile ? "page" : undefined} data-sidebar-active={isProfile ? "true" : "false"} data-sidebar-key="profile">
                <Building2 className={`size-4 shrink-0 ${iconClass(isProfile)}`} />
                <span className={collapsed ? "sr-only" : "min-w-0 truncate"}>{labels.companyProfile}</span>
              </Link>
              <button type="button" onClick={() => open("settings", "announcements")} className={buttonClass(isAnnouncements)} title={labels.announcements} aria-pressed={isAnnouncements} data-sidebar-active={isAnnouncements ? "true" : "false"} data-sidebar-key="announcements">
                <Megaphone className={`size-4 shrink-0 ${iconClass(isAnnouncements)}`} />
                <span className={collapsed ? "sr-only" : "min-w-0 truncate"}>{labels.announcements}</span>
              </button>
              <button type="button" onClick={() => open("billing")} className={buttonClass(isActive("billing"))} title={labels.billing} aria-pressed={isActive("billing")} data-sidebar-active={isActive("billing") ? "true" : "false"} data-sidebar-key="billing">
                <CreditCard className={`size-4 shrink-0 ${iconClass(isActive("billing"))}`} />
                <span className={collapsed ? "sr-only" : "min-w-0 truncate"}>{labels.billing}</span>
              </button>
              <button type="button" onClick={() => open("settings")} className={buttonClass(isSettings)} title={labels.workspaceSettings} aria-pressed={isSettings} data-sidebar-active={isSettings ? "true" : "false"} data-sidebar-key="settings">
                <Settings2 className={`size-4 shrink-0 ${iconClass(isSettings)}`} />
                <span className={collapsed ? "sr-only" : "min-w-0 truncate"}>{labels.workspaceSettings}</span>
              </button>
            </div>
          )}

                    <div role="group" aria-label="Help & Support" className="mt-4">
            {groupHeading("Help & Support")}
            <button type="button" onClick={() => open("feedback")} className={buttonClass(isActive("feedback"))} title={labels.feedback} aria-pressed={isActive("feedback")} data-sidebar-active={isActive("feedback") ? "true" : "false"} data-sidebar-key="feedback">
              <MessageSquareText className={`size-4 shrink-0 ${iconClass(isActive("feedback"))}`} />
              <span className={collapsed ? "sr-only" : "min-w-0 truncate"}>{labels.feedback}</span>
            </button>
            {!adminManaged && (
              <button type="button" onClick={() => open("support-tickets")} className={buttonClass(isActive("support-tickets"))} title="Support Tickets" aria-pressed={isActive("support-tickets")} data-sidebar-active={isActive("support-tickets") ? "true" : "false"} data-sidebar-key="support-tickets">
                <LifeBuoy className={`size-4 shrink-0 ${iconClass(isActive("support-tickets"))}`} />
                <span className={collapsed ? "sr-only" : "min-w-0 truncate"}>Support Tickets</span>
              </button>
            )}
          </div>
        </nav>

        {adminManaged && (
          <div className="border-t border-slate-200/80 p-3">
            <Link href="/admin" title="Return to Admin Console" className={`group flex items-center rounded-xl py-2.5 text-[13px] font-semibold text-blue-700 transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${collapsed ? "justify-center px-1.5" : "gap-3 px-3"}`}>
              <ShieldCheck className="size-4 shrink-0" />
              <span className={collapsed ? "sr-only" : "min-w-0 truncate"}>Return to Admin Console</span>
              {!collapsed && <ArrowUpRight className="ml-auto size-3.5" />}
            </Link>
          </div>
        )}
      </aside>

      <nav aria-label="Mobile company workspace navigation" className="border-b border-slate-200/90 bg-white/95 backdrop-blur-lg lg:hidden">
        <div className="flex items-center justify-between gap-2.5 px-4 py-3">
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
          <div id="mobile-company-workspace-menu" className="border-t border-slate-200/80 px-4 pb-4">
            <div role="group" aria-label="Core Workspace" className="mt-4 first:mt-0">
              {mobileGroupHeading("Core Workspace")}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Link href="/dashboard" onClick={(event) => { persistScrollPosition(); if (onNavigateOverview) { event.preventDefault(); onNavigateOverview(); } }} className={mobileItemClass(isDashboard)} title={labels.dashboard} aria-current={isDashboard ? "page" : undefined}>
                  <BarChart3 className="size-4 shrink-0" /><span className="min-w-0 truncate">{labels.dashboard}</span>
                </Link>
                <button type="button" onClick={() => open("meetings")} className={mobileItemClass(isActive("meetings"))} title={labels.meetings} aria-pressed={isActive("meetings")}>
                  <CalendarDays className="size-4 shrink-0" /><span className="min-w-0 truncate">{labels.meetings}</span>
                </button>
                <button type="button" onClick={() => open("team")} className={mobileItemClass(isActive("team"))} title={labels.team} aria-pressed={isActive("team")}>
                  <UsersRound className="size-4 shrink-0" /><span className="min-w-0 truncate">{labels.team}</span>
                </button>
              </div>
            </div>

            {(taskManagementEnabled || vaultEnabled) && (
              <div role="group" aria-label="Workspace Tools" className="mt-4">
                {mobileGroupHeading("Workspace Tools")}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {taskManagementEnabled && <Link href={"/dashboard/tasks" as Route} onClick={() => persistScrollPosition()} className={mobileItemClass(isTasks)} title="Task Management" aria-current={isTasks ? "page" : undefined}><ClipboardList className="size-4 shrink-0" /><span className="min-w-0 truncate">Task Management</span><span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-blue-700">New</span></Link>}
                  {vaultEnabled && <Link href={"/dashboard/vault" as Route} onClick={() => persistScrollPosition()} className={mobileItemClass(isVault)} title="Cloud Vault" aria-current={isVault ? "page" : undefined}><FolderOpen className="size-4 shrink-0" /><span className="min-w-0 truncate">Cloud Vault</span><span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-blue-700">New</span></Link>}
                </div>
              </div>
            )}

            {canManage && (
              <div role="group" aria-label="Workspace Management" className="mt-4">
                {mobileGroupHeading("Workspace Management")}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Link href={"/dashboard/company-profile" as Route} onClick={() => persistScrollPosition()} className={mobileItemClass(isProfile)} title={labels.companyProfile} aria-current={isProfile ? "page" : undefined}><Building2 className="size-4 shrink-0" /><span className="min-w-0 truncate">{labels.companyProfile}</span></Link>
                  <button type="button" onClick={() => open("settings", "announcements")} className={mobileItemClass(isAnnouncements)} title={labels.announcements} aria-pressed={isAnnouncements}><Megaphone className="size-4 shrink-0" /><span className="min-w-0 truncate">{labels.announcements}</span></button>
                  <button type="button" onClick={() => open("billing")} className={mobileItemClass(isActive("billing"))} title={labels.billing} aria-pressed={isActive("billing")}><CreditCard className="size-4 shrink-0" /><span className="min-w-0 truncate">{labels.billing}</span></button>
                  <button type="button" onClick={() => open("settings")} className={mobileItemClass(isSettings)} title={labels.workspaceSettings} aria-pressed={isSettings}><Settings2 className="size-4 shrink-0" /><span className="min-w-0 truncate">{labels.workspaceSettings}</span></button>
                </div>
              </div>
            )}

            <div role="group" aria-label="Help & Support" className="mt-4">
              {mobileGroupHeading("Help & Support")}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <button type="button" onClick={() => open("feedback")} className={mobileItemClass(isActive("feedback"))} title={labels.feedback} aria-pressed={isActive("feedback")}><MessageSquareText className="size-4 shrink-0" /><span className="min-w-0 truncate">{labels.feedback}</span></button>
                {!adminManaged && <button type="button" onClick={() => open("support-tickets")} className={mobileItemClass(isActive("support-tickets"))} title="Support Tickets" aria-pressed={isActive("support-tickets")}><LifeBuoy className="size-4 shrink-0" /><span className="min-w-0 truncate">Support Tickets</span></button>}
              </div>
            </div>
          </div>
        )}
      </nav>
    </>
  );
}
