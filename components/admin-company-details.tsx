import Link from "next/link";
import type { Route } from "next";
import {
  ArrowLeft,
  ArrowUpRight,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Database,
  FileText,
  Globe2,
  HardDrive,
  UploadCloud,
  Mail,
  MapPin,
  MessageCircle,
  LogIn,
  Phone,
  ReceiptText,
  UsersRound
} from "lucide-react";
import UserAvatar from "@/components/user-avatar";
import type { AdminCompanyDetails } from "@/lib/admin";
import AdminManageCompanyButton from "@/components/admin-manage-company-button";
import AdminGrantPlanButton from "@/components/admin-grant-plan-button";
import AdminCompanyPlanSuspensionButton from "@/components/admin-company-plan-suspension-button";

function dateLabel(value: Date | null, withTime = false) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", withTime
    ? { dateStyle: "medium", timeStyle: "short" }
    : { dateStyle: "medium" }).format(new Date(value));
}

function money(minor: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(minor / 100);
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let amount = value;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }
  return `${amount >= 100 || index === 0 ? amount.toFixed(0) : amount >= 10 ? amount.toFixed(1) : amount.toFixed(2)} ${units[index]}`;
}

export default function AdminCompanyDetailsView({ company }: { company: AdminCompanyDetails }) {
  const remaining = company.meetingsRemaining;
  const completion = company.totalMeetings ? Math.round((company.completedMeetings / company.totalMeetings) * 100) : 0;
  const vault = company.vaultUsage;
  const canvas = company.taskCanvasUsage;
  const canvasUsagePercent = canvas.canvasLimit > 0
    ? Math.min(100, (canvas.canvasCount / canvas.canvasLimit) * 100)
    : 0;
  const taskManagement = company.taskManagementUsage;
  const taskUsagePercent = taskManagement.enabled && taskManagement.dailyLimit !== null && taskManagement.dailyLimit > 0
    ? Math.min(100, (taskManagement.usedToday / taskManagement.dailyLimit) * 100)
    : 0;
  const chat = company.liveChatUsage;
  const chatUsagePercent = chat.monthlyLimit > 0
    ? Math.min(100, (chat.chatsUsedThisMonth / chat.monthlyLimit) * 100)
    : 0;
  const chatCustomerUsagePercent = chat.customerLimit > 0
    ? Math.min(100, (chat.customersUsedThisMonth / chat.customerLimit) * 100)
    : 0;
  const publicLogins = company.publicPageLoginUsage;
  const vaultPercent = vault.quotaBytes > 0
    ? Math.min(100, (vault.usedBytes / vault.quotaBytes) * 100)
    : vault.usedBytes > 0 ? 100 : 0;
  const subscriptionStatusLabel = vault.subscriptionStatus.replaceAll("_", " ").toLowerCase();

  return (
    <div className="space-y-6">
      <Link href={"/admin/companies" as Route} className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-950">
        <ArrowLeft className="size-4" /> Back to companies
      </Link>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-slate-950 text-white"><Building2 className="size-6" /></div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-blue-600">Company details</p>
              <h1 className="mt-2 truncate text-3xl font-semibold tracking-tight">{company.name}</h1>
              <p className="mt-2 text-sm text-slate-500">/{company.slug} · created {dateLabel(company.createdAt)}</p>
              <p className="mt-2 inline-flex rounded-lg bg-blue-50 px-2.5 py-1 font-mono text-xs font-semibold text-blue-800">Company ID #{company.publicId?.toLocaleString("en-IN") ?? "Pending migration"}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">{company.planName}</span>
            <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${company.publicBookingEnabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
              {company.publicBookingEnabled ? "Public scheduling live" : "Public page draft"}
            </span>
            <AdminManageCompanyButton companyId={company.id} />
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Total payment", money(company.totalPayments), "captured platform revenue", CreditCard],
          ["Plan expiry", dateLabel(company.periodEnd), "subscription period end", CalendarClock],
          ["Employees", String(company.employees), "active employee accounts", UsersRound],
          ["Meeting users", String(company.meetingUsers), "unique public customers", UsersRound],
          ["Meetings happened", String(company.completedMeetings), `${company.totalMeetings} meetings recorded`, CheckCircle2],
          ["Meetings remaining", String(remaining), company.planLimit ? `${company.monthlyMeetingsUsed}/${company.planLimit} used this period` : "No plan limit", CalendarClock],
          ["Payment count", String(company.paymentCount), "captured payments", ReceiptText],
          ["Last payment", dateLabel(company.lastPaymentAt), "latest captured transaction", ReceiptText]
        ].map(([label, value, detail, Icon]) => {
          const MetricIcon = Icon as typeof CreditCard;
          return (
            <article key={label as string} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <MetricIcon className="size-5 text-blue-600" />
              <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.11em] text-slate-400">{label as string}</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight">{value as string}</p>
              <p className="mt-1 text-[11px] leading-5 text-slate-500">{detail as string}</p>
            </article>
          );
        })}
      </section>

      <section className="space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><HardDrive className="size-5" /></span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-600">Company Vault</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">Storage and entitlement details</h2>
              <p className="mt-1 text-sm text-slate-500">Live server-side storage, quota, folder, file, and upload-reservation data for this company.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={"rounded-full px-3 py-1.5 text-[10px] font-semibold " + (vault.vaultEnabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600")}>
              {vault.vaultEnabled ? "Cloud vault enabled" : "Cloud vault disabled"}
            </span>
            <Link href={"/admin/vault-usage" as Route} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              All vaults <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Storage in use", formatBytes(vault.usedBytes), formatBytes(vault.pendingUploadBytes) + " reserved by active uploads"],
            ["Plan quota", vault.vaultEnabled ? formatBytes(vault.quotaBytes) : "No quota", vault.planName + " · " + subscriptionStatusLabel + " subscription"],
            ["Storage available", vault.vaultEnabled ? formatBytes(vault.availableBytes) : "Unavailable", vault.quotaExceeded ? "Quota exceeded or entitlement missing" : "Remaining upload capacity"],
            ["Items / item limit", vault.usedItems.toLocaleString("en-IN") + " / " + (vault.vaultEnabled ? vault.maxItems.toLocaleString("en-IN") : "—"), "Files plus active upload reservations"],
            ["Stored files", vault.fileCount.toLocaleString("en-IN"), "Committed file metadata records"],
            ["Folders", company.vaultFolderCount.toLocaleString("en-IN"), "Nested folder records"],
            ["Active uploads", vault.pendingUploadCount.toLocaleString("en-IN"), formatBytes(vault.pendingUploadBytes) + " reserved"],
            ["Maximum file size", vault.vaultEnabled ? formatBytes(vault.maxFileBytes) : "—", "Plan limit, capped by platform hard limit"]
          ].map(([label, value, detail]) => (
            <article key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">{label as string}</p>
              <p className="mt-2 break-words text-xl font-semibold tracking-tight text-slate-950">{value as string}</p>
              <p className="mt-1 text-[10px] leading-4 text-slate-500">{detail as string}</p>
            </article>
          ))}
        </div>

        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-slate-700">Storage utilization</span>
            <span className="text-slate-500">{vault.quotaBytes > 0 ? vaultPercent.toFixed(1) + "% of quota" : vault.usedBytes > 0 ? "Storage exists without an active quota" : "No storage quota assigned"}</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className={"h-full rounded-full " + (vault.quotaExceeded ? "bg-rose-500" : "bg-blue-600")} style={{ width: vaultPercent + "%" }} />
          </div>
          {vault.quotaExceeded && <p className="mt-3 text-xs font-semibold text-rose-700">Attention: used or reserved storage is above the active plan quota, or this company has stored data while vault access is disabled.</p>}
          <div className="mt-4 grid gap-2 sm:grid-cols-[auto_1fr] sm:items-start">
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Storage prefix</span>
            <code className="break-all rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">{vault.storagePrefix}</code>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Stored files</h3>
              <p className="mt-1 text-[11px] text-slate-500">Latest {company.vaultFiles.length} of {vault.fileCount} files, sorted newest first.</p>
            </div>
            <FileText className="size-4 text-slate-400" />
          </div>
          {company.vaultFiles.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-[780px] w-full text-left">
                <thead className="bg-slate-50">
                  <tr>{["File", "Folder", "Uploaded by", "Stored size", "Uploaded"].map((label) => <th key={label} className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</th>)}</tr>
                </thead>
                <tbody>
                  {company.vaultFiles.map((file) => (
                    <tr key={file.id} className="border-t border-slate-100">
                      <td className="px-4 py-3">
                        <p className="max-w-[260px] truncate text-xs font-semibold text-slate-900" title={file.name}>{file.name}</p>
                        <p className="mt-1 text-[10px] text-slate-500">{file.mimeType} · original {formatBytes(file.originalSizeBytes)}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">{file.folderName}</td>
                      <td className="px-4 py-3">
                        <p className="text-xs font-semibold text-slate-700">{file.uploadedBy?.name ?? "Unknown user"}</p>
                        <p className="mt-1 text-[10px] text-slate-500">{file.uploadedBy?.email || "No email"}</p>
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold tabular-nums text-slate-700">{formatBytes(file.storedBytes)}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{dateLabel(file.createdAt, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-8 text-center text-sm text-slate-500">No committed files are recorded for this company.</p>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Active upload reservations</h3>
              <p className="mt-1 text-[11px] text-slate-500">Pending uploads count toward used bytes and item limits.</p>
            </div>
            <UploadCloud className="size-4 text-slate-400" />
          </div>
          {company.activeVaultUploads.length ? (
            <div className="divide-y divide-slate-100">
              {company.activeVaultUploads.map((upload) => (
                <div key={upload.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(180px,1fr)_auto_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-800">{upload.name}</p>
                    <p className="mt-1 text-[10px] text-slate-500">Expires {dateLabel(upload.expiresAt, true)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-700">{formatBytes(upload.reservedBytes)}</p>
                    <p className="mt-1 text-[10px] text-slate-500">{upload.receivedChunks}/{upload.expectedChunks} chunks received</p>
                  </div>
                  <span className={"w-fit rounded-full px-2.5 py-1 text-[10px] font-semibold " + (upload.status === "COMPLETING" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700")}>{upload.status.replaceAll("_", " ")}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="p-8 text-center text-sm text-slate-500">No active upload reservations.</p>
          )}
        </div>
        <p className="text-[11px] leading-5 text-slate-500">The tables show the latest 25 file and upload records. Use Manage workspace above to browse all nested folders and the full live vault as the company.</p>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Task management</p>
            <h2 className="mt-2 text-base font-semibold">Company task usage and plan allowance</h2>
            <p className="mt-1 text-xs text-slate-500">Current plan: {company.planName}. Daily usage follows the company workspace timezone.</p>
          </div>
          <span className={"w-fit rounded-full px-3 py-1.5 text-[10px] font-semibold " + (taskManagement.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600")}>
            {taskManagement.enabled ? "Task Management included" : "Not included in current plan"}
          </span>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Today's task actions", taskManagement.usedToday.toLocaleString("en-IN") + " / " + (taskManagement.dailyLimit === null ? "Unlimited" : taskManagement.dailyLimit.toLocaleString("en-IN")), taskManagement.dayKey ? "Workspace day · " + taskManagement.dayKey : "Workspace unavailable"],
            ["Remaining today", taskManagement.dailyLimit === null ? "Unlimited" : taskManagement.remainingToday?.toLocaleString("en-IN") ?? "—", "Remaining task create/assignment actions"],
            ["Total tasks", company.totalTasks.toLocaleString("en-IN"), "All tasks recorded for this company"],
            ["Task assignments", company.totalTaskAssignments.toLocaleString("en-IN"), "Assignment records across company workspaces"],
            ["Active tasks", company.activeTasks.toLocaleString("en-IN"), "Todo, in progress, blocked or in review"],
            ["Completed tasks", company.completedTasks.toLocaleString("en-IN"), "Tasks marked completed"],
            ["Overdue tasks", company.overdueTasks.toLocaleString("en-IN"), "Past due and not closed"]
          ].map(([label, value, detail]) => (
            <article key={label as string} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">{label as string}</p>
              <p className="mt-2 break-words text-xl font-semibold tracking-tight text-slate-950">{value as string}</p>
              <p className="mt-1 text-[10px] leading-4 text-slate-500">{detail as string}</p>
            </article>
          ))}
        </div>
        {taskManagement.enabled && taskManagement.dailyLimit !== null && (
          <div className="mt-4 rounded-2xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-slate-700">Daily plan utilization</span>
              <span className="text-slate-500">{taskManagement.usedToday.toLocaleString("en-IN")} of {taskManagement.dailyLimit.toLocaleString("en-IN")} actions · {taskUsagePercent.toFixed(1)}%</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className={"h-full rounded-full " + (taskManagement.usedToday >= taskManagement.dailyLimit ? "bg-amber-500" : "bg-blue-600")} style={{ width: taskUsagePercent + "%" }} />
            </div>
          </div>
        )}
        <p className="mt-3 text-[11px] leading-5 text-slate-500">The daily action counter increments once per successful task create/assignment action, not once per assignee. Historical tasks and assignments remain visible even when this plan does not currently include Task Management.</p>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><LogIn className="size-5" aria-hidden="true" /></span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-600">Public company page</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">Customer sign-ins</h2>
              <p className="mt-1 text-sm text-slate-500">Successful sign-ins through this company’s public-page customer login flow, with Google avatars, profile names and email addresses.</p>
            </div>
          </div>
          <span className="w-fit rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-semibold text-slate-600">Latest {publicLogins.items.length} shown</span>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[
            ["Unique signed-in users", publicLogins.uniqueUsers.toLocaleString("en-IN"), "Distinct accounts with a tracked sign-in to this company"],
            ["Total sign-ins", publicLogins.totalLogins.toLocaleString("en-IN"), "Counted since company-specific login tracking began"],
            ["Recent sign-in", publicLogins.items[0] ? dateLabel(publicLogins.items[0].lastLoginAt, true) : "—", "Most recent tracked login"]
          ].map(([label, value, detail]) => (
            <article key={label as string} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">{label as string}</p>
              <p className="mt-2 break-words text-xl font-semibold tracking-tight text-slate-950">{value as string}</p>
              <p className="mt-1 text-[10px] leading-4 text-slate-500">{detail as string}</p>
            </article>
          ))}
        </div>
        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
          {publicLogins.items.length ? (
            <div className="divide-y divide-slate-100">
              {publicLogins.items.map((user) => (
                <div key={user.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                  <UserAvatar name={user.name} email={user.email} image={user.image} size={42} className="border-blue-100 bg-blue-50 text-blue-700" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-slate-900">{user.name}</p>
                    <p className="mt-1 truncate text-[11px] text-slate-500">{user.email}</p>
                    <p className="mt-1 text-[10px] text-slate-400">First sign-in {dateLabel(user.firstLoginAt, true)} · Last sign-in {dateLabel(user.lastLoginAt, true)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold text-slate-800">{user.loginCount.toLocaleString("en-IN")} sign-ins</p>
                    <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">{user.role.replaceAll("_", " ")}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="p-8 text-center text-sm text-slate-500">No tracked public-page sign-ins yet. The list starts recording successful customer sign-ins after this version is deployed; older sign-ins cannot be reconstructed.</p>
          )}
          {publicLogins.hasMore && <p className="border-t border-slate-100 px-4 py-3 text-[11px] text-slate-500">Showing the latest {publicLogins.items.length} accounts; summary totals include all tracked users for this company.</p>}
        </div>
      </section>

      <section className="space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-cyan-50 text-cyan-700"><MessageCircle className="size-5" aria-hidden="true" /></span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-700">Live Chat</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">Plan features and usage</h2>
              <p className="mt-1 text-sm text-slate-500">{company.planName} · usage period {chat.periodKey} (UTC).</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={"rounded-full px-3 py-1.5 text-[10px] font-semibold " + (chat.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600")}>{chat.enabled ? "Included in plan" : "Not included in plan"}</span>
            <span className={"rounded-full px-3 py-1.5 text-[10px] font-semibold " + (chat.widgetEnabled ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600")}>{chat.widgetEnabled ? "Public widget enabled" : "Public widget off"}</span>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Chats started", chat.chatsUsedThisMonth.toLocaleString("en-IN") + " / " + chat.monthlyLimit.toLocaleString("en-IN"), chat.chatsRemaining.toLocaleString("en-IN") + " remaining this month"],
            ["Unique visitors", chat.customersUsedThisMonth.toLocaleString("en-IN") + " / " + chat.customerLimit.toLocaleString("en-IN"), chat.customersRemaining.toLocaleString("en-IN") + " remaining this month"],
            ["Open conversations", chat.openChats.toLocaleString("en-IN"), "Currently open and not expired"],
            ["Agent capacity", chat.agentLimit.toLocaleString("en-IN"), "Maximum agents allowed by the plan"],
            ["Message cooldown", chat.messageCooldownSeconds.toLocaleString("en-IN") + " sec", "Minimum interval for customer replies"],
            ["History retention", chat.retentionDays.toLocaleString("en-IN") + " days", "Plan retention setting for chat data"],
            ["PDF export", chat.pdfExportEnabled ? "Available" : "Disabled", "Current plan capability"],
            ["Delete conversations", chat.deleteEnabled ? "Available" : "Disabled", "Current plan capability"]
          ].map(([label, value, detail]) => (
            <article key={label as string} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">{label as string}</p>
              <p className="mt-2 break-words text-xl font-semibold tracking-tight text-slate-950">{value as string}</p>
              <p className="mt-1 text-[10px] leading-4 text-slate-500">{detail as string}</p>
            </article>
          ))}
        </div>
        {chat.enabled && (
          <div className="mt-1 space-y-4 rounded-2xl border border-slate-200 p-4">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-700">Monthly chat usage</span>
                <span className="text-slate-500">{chat.chatsUsedThisMonth.toLocaleString("en-IN")} of {chat.monthlyLimit.toLocaleString("en-IN")} · {chatUsagePercent.toFixed(1)}%</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className={"h-full rounded-full " + (chat.chatsUsedThisMonth >= chat.monthlyLimit ? "bg-amber-500" : "bg-cyan-600")} style={{ width: chatUsagePercent + "%" }} />
              </div>
            </div>
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-700">Unique customer allowance</span>
                <span className="text-slate-500">{chat.customersUsedThisMonth.toLocaleString("en-IN")} of {chat.customerLimit.toLocaleString("en-IN")} · {chatCustomerUsagePercent.toFixed(1)}%</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className={"h-full rounded-full " + (chat.customersUsedThisMonth >= chat.customerLimit ? "bg-amber-500" : "bg-blue-600")} style={{ width: chatCustomerUsagePercent + "%" }} />
              </div>
            </div>
          </div>
        )}
        <p className="text-[11px] leading-5 text-slate-500">“Chats started” counts newly created conversations, not individual messages. Unique visitors are deduplicated using the existing monthly privacy-safe visitor counter. Existing usage remains visible even if Live Chat is not enabled on the current plan.</p>
      </section>


      <section className="space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700"><Database className="size-5" aria-hidden="true" /></span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-600">Task Canvas</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">Company canvas usage and MongoDB storage</h2>
              <p className="mt-1 text-sm text-slate-500">Server-rendered usage metrics for this company only. Stored sizes are measured without loading scene blobs into the page response.</p>
            </div>
          </div>
          <span className={"w-fit rounded-full px-3 py-1.5 text-[10px] font-semibold " + (canvas.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600")}>
            {canvas.enabled ? "Included in current plan" : "Not included in current plan"}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Canvases / plan limit", canvas.canvasCount.toLocaleString("en-IN") + " / " + canvas.canvasLimit.toLocaleString("en-IN"), "Company-wide across workspaces"],
            ["Collaborator limit", canvas.maxCollaboratorsPerCanvas.toLocaleString("en-IN") + " per canvas", "Plan entitlement; member count is shown per canvas"],
            ["Collaboration seats", canvas.totalCollaboratorSeats.toLocaleString("en-IN"), "Per-canvas membership entries across stored canvases"],
            ["Scene payload stored", formatBytes(canvas.totalStoredSceneBytes), "Gzip bytes plus legacy scene BSON bytes"],
            ["MongoDB document footprint", formatBytes(canvas.totalDocumentBsonBytes), "BSON size of all company canvas documents"],
            ["Known raw / legacy scene size", formatBytes(canvas.totalRawSceneBytes), "Measured JSON bytes and legacy BSON estimates; older gzip scenes are excluded"],
            ["Scene elements", canvas.totalElements.toLocaleString("en-IN"), "Known elements across measured and legacy canvases"],
            ["Files / embedded assets", canvas.totalFiles.toLocaleString("en-IN"), "File entries in canvas scenes"],
            ["Path points", canvas.totalPoints.toLocaleString("en-IN"), "Points stored in line, arrow and free-draw paths"],
            ["Per-canvas stats", canvas.measuredCanvasCount.toLocaleString("en-IN") + " / " + canvas.canvasCount.toLocaleString("en-IN"), canvas.unmeasuredCanvasCount ? canvas.unmeasuredCanvasCount.toLocaleString("en-IN") + " older compressed canvas(es) need a save to record item counts" : "Element counts available for all canvas records"]
          ].map(([label, value, detail]) => (
            <article key={label as string} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">{label as string}</p>
              <p className="mt-2 break-words text-xl font-semibold tracking-tight text-slate-950">{value as string}</p>
              <p className="mt-1 text-[10px] leading-4 text-slate-500">{detail as string}</p>
            </article>
          ))}
        </div>

        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-slate-700">Canvas allowance usage</span>
            <span className="text-slate-500">{canvas.canvasCount.toLocaleString("en-IN")} of {canvas.canvasLimit.toLocaleString("en-IN")} canvases · {canvasUsagePercent.toFixed(1)}%</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className={"h-full rounded-full " + (canvas.canvasCount > canvas.canvasLimit || !canvas.enabled && canvas.canvasCount > 0 ? "bg-rose-500" : "bg-violet-600")} style={{ width: canvasUsagePercent + "%" }} />
          </div>
          {(!canvas.enabled && canvas.canvasCount > 0) && <p className="mt-3 text-xs font-semibold text-rose-700">This company has stored canvases although Task Canvas is not enabled on the current plan. Data is retained; current feature access is controlled separately.</p>}
          {canvas.canvasCount > canvas.canvasLimit && <p className="mt-3 text-xs font-semibold text-amber-700">Stored canvas count is above the current plan allowance. Existing data is reported as-is; no records were changed by this view.</p>}
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Canvas records and storage details</h3>
              <p className="mt-1 text-[11px] text-slate-500">Latest {canvas.items.length} of {canvas.canvasCount} canvases, newest updated first. Scene storage size is the gzip payload for compressed records or BSON scene size for legacy records; document bytes include metadata but exclude indexes.</p>
            </div>
            <Database className="size-4 text-slate-400" aria-hidden="true" />
          </div>
          {canvas.items.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-[1160px] w-full text-left">
                <thead className="bg-slate-50">
                  <tr>{["Canvas", "Items / path points", "Collaborators", "Raw / legacy scene", "Stored scene", "MongoDB document", "Updated"].map((label) => <th key={label} className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</th>)}</tr>
                </thead>
                <tbody>
                  {canvas.items.map((item) => (
                    <tr key={item.id} className="border-t border-slate-100 align-top">
                      <td className="px-4 py-3">
                        <p className="max-w-[250px] break-words text-xs font-semibold text-slate-900">{item.name}</p>
                        <p className="mt-1 font-mono text-[10px] text-slate-500" title={item.id}>{item.id.slice(-8)} · v{item.version} · {item.storageFormat === "gzip" ? "gzip" : "legacy"}</p>
                        <p className="mt-1 font-mono text-[10px] text-slate-400" title={item.workspaceId}>Workspace …{item.workspaceId.slice(-6)}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700">
                        <p className="font-semibold tabular-nums">{item.sceneElementCount == null ? "Not measured" : item.sceneElementCount.toLocaleString("en-IN") + " elements"}</p>
                        <p className="mt-1 text-[10px] text-slate-500">{item.scenePointCount == null ? "Path points —" : item.scenePointCount.toLocaleString("en-IN") + " path points"}</p>
                        <p className="mt-1 text-[10px] text-slate-500">{item.sceneFileCount == null ? "Files —" : item.sceneFileCount.toLocaleString("en-IN") + " files"}</p>
                      </td>
                      <td className="px-4 py-3 text-xs tabular-nums text-slate-700">{item.memberCount.toLocaleString("en-IN")} / {canvas.maxCollaboratorsPerCanvas}</td>
                      <td className="px-4 py-3 text-xs tabular-nums text-slate-700">{item.sceneRawBytes == null ? "—" : (item.storageFormat === "legacy" ? "≈ " : "") + formatBytes(item.sceneRawBytes)}</td>
                      <td className="px-4 py-3 text-xs font-semibold tabular-nums text-violet-700">{formatBytes(item.sceneStoredBytes)}</td>
                      <td className="px-4 py-3 text-xs tabular-nums text-slate-700">{formatBytes(item.documentBsonBytes)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600">{dateLabel(item.updatedAt, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-8 text-center text-sm text-slate-500">No Task Canvas records are stored for this company.</p>
          )}
          {canvas.hasMore && <p className="border-t border-slate-100 px-4 py-3 text-[11px] text-slate-500">Only the latest {canvas.items.length} canvases are listed here to keep the admin page responsive; aggregate totals include all {canvas.canvasCount} canvas records.</p>}
        </div>
        <p className="text-[11px] leading-5 text-slate-500">Size details are read server-side from this company&apos;s MongoDB records. Older gzip scenes that predate save-time element metrics show stored bytes immediately; element, file, point and exact raw-JSON counts become available after the next save. Legacy scene bytes marked ≈ are BSON-size estimates. This view never mutates or decompresses scene payloads.</p>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.15fr_.85fr]">
        <div className="space-y-6">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Billing identity</p>
                <h2 className="mt-2 text-base font-semibold">Company profile</h2>
              </div>
              <ReceiptText className="size-5 text-blue-600" />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Email</p><p className="mt-2 break-all text-sm font-semibold">{company.email || "Not configured"}</p></div>
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Phone</p><p className="mt-2 text-sm font-semibold">{company.phone || "Not configured"}</p></div>
              <div className="rounded-2xl bg-slate-50 p-4 sm:col-span-2"><p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Description</p><p className="mt-2 text-sm leading-6 text-slate-700">{company.description || "No description"}</p></div>
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Website</p><p className="mt-2 break-all text-sm font-semibold">{company.websiteUrl || "—"}</p></div>
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Tax / registration</p><p className="mt-2 text-sm font-semibold">{company.taxId || "—"}</p></div>
            </div>
            <div className="mt-3 flex items-start gap-3 rounded-2xl border border-slate-200 p-4">
              <MapPin className="mt-0.5 size-4 shrink-0 text-blue-600" />
              <div className="text-sm leading-6 text-slate-600">
                {[company.address.line1, company.address.line2, company.address.city, company.address.state, company.address.postalCode, company.address.country].filter(Boolean).join(", ") || "Billing address not configured"}
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Plan & lifecycle</p>
              <h2 className="mt-2 text-base font-semibold">Subscription details</h2>
            </div>
            <div className="border-b border-slate-200 px-6 py-4">
              <AdminCompanyPlanSuspensionButton
                key={JSON.stringify([
                  company.id,
                  company.planSuspended,
                  company.planSuspendedAt ?? null,
                  company.planExpired,
                  company.planExpiredAt ?? null,
                  company.planExpiryTestActive
                ])}
                companyId={company.id}
                suspended={company.planSuspended}
                suspendedAt={company.planSuspendedAt}
                expired={company.planExpired}
                expiredAt={company.planExpiredAt}
                expiryTestActive={company.planExpiryTestActive}
              />
            </div>
            <div className="grid gap-3 p-6 sm:grid-cols-3">
              <div className="rounded-2xl bg-blue-50 p-4"><p className="text-[10px] uppercase tracking-[0.12em] text-blue-600">Current plan</p><p className="mt-2 text-lg font-semibold text-slate-950">{company.planName}</p></div>
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Expiry</p><p className="mt-2 text-sm font-semibold">{dateLabel(company.periodEnd, true)}</p></div>
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Renewal</p><p className="mt-2 text-sm font-semibold">{dateLabel(company.periodEnd, true)}</p></div>
            </div>
            <div className="border-t border-slate-200 p-6">
              <p className="text-xs font-semibold">Plan comparison</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {Object.values(company.plans).filter((plan) => !plan.archivedAt || plan.id === company.planId).map((plan) => (
                  <div key={plan.id} className={`rounded-2xl border p-4 ${plan.id === company.planId ? "border-blue-200 bg-blue-50/50" : "border-slate-200 bg-white"}`}>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">{plan.archivedAt ? "Archived" : plan.status.replace("_", " ")}</span>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">{plan.name}</p>
                      <div className="flex items-center gap-2">
                        {plan.id === company.planId ? <span className="rounded-full bg-blue-600 px-2 py-1 text-[10px] font-semibold text-white">Current</span> : <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500">Available</span>}
                        <AdminGrantPlanButton companyId={company.id} planId={plan.id} currentPlanId={company.planId} />
                      </div>
                    </div>
                    <p className="mt-2 text-xl font-semibold">₹{plan.priceInr}<span className="text-xs font-normal text-slate-400"> / {plan.validityDays} days</span></p>
                    {plan.discountType !== "NONE" && <p className="mt-1 text-[10px] font-semibold text-emerald-700">Discount: {plan.discountType === "PERCENTAGE" ? plan.discountValue + "%" : "₹" + plan.discountValue}</p>}
                    <p className="mt-2 text-xs leading-5 text-slate-500">{plan.maxEmployees} employees · {plan.monthlyMeetingLimit} meetings · {plan.maxMeetingDurationMinutes} min · {plan.maxConcurrentMeetings} concurrent</p>
                  </div>
                ))}
              </div>
              {company.alternativePlanId && (
                <p className="mt-4 text-xs text-slate-500">Available alternative plan: <span className="font-semibold text-slate-700">{company.plans[company.alternativePlanId as keyof typeof company.plans]?.name}</span>.</p>
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Payments & invoices</p>
              <h2 className="mt-2 text-base font-semibold">Billing history</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {company.recentPayments.map((payment) => (
                <div key={payment.id} className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{payment.providerPaymentId || payment.providerOrderId}</p>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${payment.status === "CAPTURED" ? "bg-emerald-50 text-emerald-700" : payment.status === "FAILED" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>{payment.status}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">{company.plans[payment.planId as keyof typeof company.plans]?.name ?? payment.planId} · {dateLabel(payment.paidAt, true)}</p>
                  </div>
                  <p className="text-lg font-semibold">{money(payment.amount)} {payment.currency}</p>
                </div>
              ))}
              {!company.recentPayments.length && <div className="p-8 text-center text-sm text-slate-500">No payment records yet.</div>}
            </div>

            <div className="border-t border-slate-200">
              {company.invoices.length ? company.invoices.map((invoice) => (
                <div key={invoice.id} className="flex flex-col gap-3 border-b border-slate-100 px-6 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-semibold">{invoice.invoiceNumber}</p>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                        invoice.source === "PAID" ? "bg-emerald-50 text-emerald-700" :
                        invoice.source === "ADMIN_GRANTED" ? "bg-violet-50 text-violet-700" :
                        "bg-slate-100 text-slate-700"
                      }`}>{invoice.source === "PAID" ? "Paid" : invoice.source === "ADMIN_GRANTED" ? "Admin granted" : "Free"}</span>
                      {invoice.isCurrentPlan && <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700">Current plan</span>}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {company.plans[invoice.planId as keyof typeof company.plans]?.name ?? invoice.planId} · {dateLabel(invoice.issuedAt)}
                      {invoice.gstRatePercent ? ` · GST ${invoice.gstRatePercent.toFixed(2)}%` : " · GST not applied"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-sm font-semibold">{money(invoice.amount)}</p>
                      {invoice.gstAmount > 0 && <p className="mt-1 text-[10px] text-slate-400">GST included {money(invoice.gstAmount)}</p>}
                    </div>
                    <a
                      href={`/billing/invoices/${invoice.id}`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      View
                      <ArrowUpRight className="size-3.5" />
                    </a>
                  </div>
                </div>
              )) : <div className="p-6 text-xs text-slate-500">No automatic invoices have been recorded for captured payments.</div>}
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <UserAvatar
                name={company.owner?.name ?? "Unknown"}
                email={company.owner?.email}
                image={company.owner?.image}
                size={44}
              />
              <div className="min-w-0"><p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Company owner</p><p className="mt-1 truncate text-sm font-semibold">{company.owner?.name ?? "Unknown"}</p><p className="mt-1 truncate text-xs text-slate-500">{company.owner?.email ?? "Unknown email"}</p></div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between"><div><p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Meeting usage</p><p className="mt-1 text-base font-semibold">{completion}% completed</p></div><CalendarClock className="size-5 text-blue-600" /></div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${completion}%` }} /></div>
            <div className="mt-4 grid gap-2 text-xs">
              {Object.entries(company.meetingStatusCounts).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5"><span className="text-slate-500">{status.replaceAll("_", " ")}</span><b>{count}</b></div>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between"><div><p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Team</p><p className="mt-1 text-base font-semibold">{company.activeMembers.length} active members</p></div><UsersRound className="size-5 text-blue-600" /></div>
            <div className="mt-5 space-y-2">
              {company.activeMembers.map((member) => (
                <div key={member.id} className="flex items-center gap-2.5 rounded-xl border border-slate-200 p-3">
                  <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{member.name}</p><p className="truncate text-[10px] text-slate-500">{member.email}</p></div>
                  <div className="text-right"><p className="text-[9px] font-semibold uppercase text-slate-400">{member.role.replaceAll("_", " ")}</p><p className={`mt-1 text-[9px] font-semibold ${member.googleConnected ? "text-emerald-600" : "text-amber-600"}`}>{member.googleConnected ? "Google ready" : "Needs setup"}</p></div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Meeting history</p><h2 className="mt-2 text-base font-semibold">Recent meetings and public customers</h2></div>
          <span className="text-xs font-semibold text-slate-500">{company.recentMeetings.length} latest</span>
        </div>
        <div className="divide-y divide-slate-100">
          {company.recentMeetings.map((meeting) => (
            <div key={meeting.id} className="grid gap-3 px-6 py-4 md:grid-cols-[1fr_1fr_auto] md:items-center">
              <div><p className="text-xs font-semibold">{meeting.customer?.name ?? "Customer unavailable"}</p><p className="mt-1 text-[11px] text-slate-500">{meeting.customer?.email ?? "No customer email"}</p></div>
              <div><p className="text-xs font-semibold">{dateLabel(meeting.startAt, true)}</p><p className="mt-1 text-[11px] text-slate-500">Employee: {meeting.employee?.name ?? "Unknown"}</p></div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600 md:justify-self-end">{meeting.status}</span>
            </div>
          ))}
          {!company.recentMeetings.length && <div className="p-10 text-center text-sm text-slate-500">No meeting history yet.</div>}
        </div>
      </section>

      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
        <span className="inline-flex items-center gap-2"><Mail className="size-3.5" /> {company.email || "No billing email"}</span>
        <span className="inline-flex items-center gap-2"><Phone className="size-3.5" /> {company.phone || "No billing phone"}</span>
        <span className="inline-flex items-center gap-2"><Globe2 className="size-3.5" /> {company.websiteUrl || "No website"}</span>
      </div>
    </div>
  );
}
