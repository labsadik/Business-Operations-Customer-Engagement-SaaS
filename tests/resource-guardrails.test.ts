import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

test("live views throttle API polling and pause background work", () => {
  const workspace = source("components/workspace-dashboard.tsx");
  const tasks = source("features/task-management/components/task-management-dashboard.tsx");
  const booking = source("components/public-booking.tsx");

  assert.ok(workspace.includes("if (document.visibilityState === \"visible\") void refreshLive();\n    }, 30_000);"));
  assert.ok(tasks.includes("window.setInterval(refreshVisibleTasks, 30_000)"));
  assert.ok(booking.includes("window.setInterval(refreshAvailabilityWhenVisible, 60_000)"));
  assert.ok(booking.includes("timer = window.setInterval(() => void pollBookingStatus(), 5000)"));
  assert.ok(booking.includes("document.visibilityState !== \"visible\""));
  assert.ok(/requestInFlight\s*\|\|\s*terminal/.test(booking));
});

test("public availability uses the same valid ISO date check before calculation and cache reads", () => {
  const availability = source("lib/public-availability.ts");
  const dateChecks = availability
    .split("\n")
    .filter((line) => line.includes(".test(dateIso)"));

  assert.equal(dateChecks.length, 2);
  assert.equal(dateChecks[0], dateChecks[1]);
  assert.ok(dateChecks[0].includes("/^\\d{4}-\\d{2}-\\d{2}$/"));
});

test("availability results use a bounded short-lived cache and coalesce duplicate reads", () => {
  const availability = source("lib/public-availability.ts");

  assert.ok(availability.includes("AVAILABILITY_CACHE_TTL_SECONDS = 75"));
  assert.ok(availability.includes("MAX_AVAILABILITY_CACHE_ENTRIES = 128"));
  assert.ok(availability.includes("inFlightAvailability"));
  assert.ok(availability.includes('redis.set(\n          cacheKey,\n          JSON.stringify(result),\n          { EX: AVAILABILITY_CACHE_TTL_SECONDS }'));
});

test("scheduled sweep work is capped per request", () => {
  const sweep = source("app/api/jobs/sweep/route.ts");

  assert.ok(sweep.includes("EXPIRY_SWEEP_BATCH_LIMIT = 25"));
  assert.ok(sweep.includes("RETRY_SWEEP_BATCH_LIMIT = 25"));
  assert.ok(sweep.includes("MEETING_RETRY_SWEEP_BATCH_LIMIT = 5"));
  assert.ok(sweep.includes("hasMoreWork:"));
});

test("Google access tokens are cached locally with bounded memory and single-flight refresh", () => {
  const calendar = source("lib/google-calendar.ts");
  const ignore = source(".gitignore");

  assert.ok(calendar.includes("MAX_ACCESS_TOKEN_CACHE_ENTRIES = 500"));
  assert.ok(calendar.includes("pendingAccessTokenLoads"));
  assert.ok(calendar.includes("function rememberAccessToken"));
  assert.ok(ignore.includes("/tsconfig.tsbuildinfo"));
});

test("Google Calendar free/busy calls have bounded concurrency and queue size", () => {
  const calendar = source("lib/google-calendar.ts");

  assert.ok(calendar.includes("MAX_CONCURRENT_FREE_BUSY_REQUESTS = 20"));
  assert.ok(calendar.includes("MAX_QUEUED_FREE_BUSY_REQUESTS = 500"));
  assert.ok(calendar.includes('throw new Error("GOOGLE_CALENDAR_BUSY")'));
  assert.ok(calendar.includes("return withFreeBusyCapacity(async () =>"));
});

test("Google-backed availability work has bounded concurrency and fails fast when saturated", () => {
  const availability = source("lib/public-availability.ts");
  const route = source("app/api/public/[companySlug]/availability/route.ts");

  assert.ok(availability.includes("MAX_CONCURRENT_AVAILABILITY_CALCULATIONS = 10"));
  assert.ok(availability.includes("MAX_QUEUED_AVAILABILITY_CALCULATIONS = 40"));
  assert.ok(availability.includes('throw new Error("AVAILABILITY_BUSY")'));
  assert.ok(availability.includes("withAvailabilityCalculationCapacity(async () =>"));
  assert.ok(route.includes('code === "AVAILABILITY_BUSY" || code === "GOOGLE_CALENDAR_BUSY" ? 503 : 400'));
});

test("task board avoids reloading the whole employee directory on every task poll", () => {
  const dashboard = source("features/task-management/components/task-management-dashboard.tsx");
  const employees = source("app/api/company/employees/route.ts");

  assert.ok(dashboard.includes("EMPLOYEE_DIRECTORY_REFRESH_MS = 5 * 60_000"));
  assert.ok(dashboard.includes("Date.now() - employeeDirectoryLoadedAtRef.current >= EMPLOYEE_DIRECTORY_REFRESH_MS"));
  assert.ok(employees.includes('.select("userId role jobTitle department employmentStatus")'));
  assert.ok(employees.includes('.select("_id name email image role")'));
});

test("Redis-cached Google tokens use a short local TTL below the token-expiry safety margin", () => {
  const calendar = source("lib/google-calendar.ts");
  assert.ok(calendar.includes("TOKEN_CACHE_FROM_REDIS_TTL_MS = 30_000"));
  assert.ok(calendar.includes("Math.floor(refreshed.expires_in) - 60"));
});

test("only the four canonical user roles are allowed and tenant authorization does not implicitly bypass roles", () => {
  const domain = source("types/domain.ts");
  const user = source("models/user.ts");
  const membership = source("models/membership.ts");
  const session = source("models/session.ts");
  const authz = source("lib/authz.ts");
  const dashboardLayout = source("app/dashboard/layout.tsx");

  assert.ok(domain.includes('["PLATFORM_ADMIN", "COMPANY_ADMIN", "EMPLOYEE", "CUSTOMER"] as const'));
  assert.ok(user.includes("enum: [...USER_ROLES]"));
  assert.ok(membership.includes("enum: [...COMPANY_MEMBER_ROLES]"));
  assert.ok(session.includes("enum: [...USER_ROLES]"));
  assert.ok(authz.includes("!roles.includes(session.role)"));
  assert.ok(!authz.includes("adminManaged"));
  assert.ok(dashboardLayout.includes('session.role === "PLATFORM_ADMIN"'));
  assert.ok(dashboardLayout.includes('session.role !== "EMPLOYEE"'));
});

test("findOneAndUpdate and findOneAndReplace call sites avoid deprecated new: true", () => {
  const paths = [
    "app/api/admin/plans/[identifier]/route.ts",
    "app/api/admin/platform-settings/route.ts",
    "app/api/auth/google/callback/route.ts",
    "app/api/billing/free/route.ts",
    "app/api/billing/invoices/route.ts",
    "app/api/bookings/[bookingId]/accept/route.ts",
    "app/api/bookings/[bookingId]/decline/route.ts",
    "app/api/company/employees/[userId]/route.ts",
    "app/api/company/route.ts",
    "app/api/profile/member/route.ts",
    "app/api/tasks/[taskId]/route.ts",
    "app/api/tasks/[taskId]/status/route.ts",
    "app/api/tasks/notifications/[notificationId]/route.ts",
    "app/api/jobs/sweep/route.ts",
    "lib/platform.ts",
    "lib/booking-history.ts",
    "lib/plans-server.ts",
    "lib/billing.ts",
    "features/task-management/server/task-daily-limit.ts"
  ];
  for (const path of paths) {
    assert.doesNotMatch(source(path), /\bnew\s*:\s*true\b/, `${path} still uses the deprecated option`);
  }
});


test("platform admin tenant scope only comes from explicit managed-company context", () => {
  const session = source("lib/session.ts");
  const manageRoute = source("app/api/admin/companies/[companyId]/manage/route.ts");
  const unmanageRoute = source("app/api/admin/companies/unmanage/route.ts");

  assert.ok(session.includes("const scopedCompanyId = managed?.companyId;"));
  assert.ok(!session.includes("defaultMembership"));
  assert.ok(session.includes("store.get(ADMIN_MANAGED_COMPANY_COOKIE)"));
  assert.ok(manageRoute.includes("active: true"));
  assert.ok(unmanageRoute.includes("store.delete(ADMIN_MANAGED_COMPANY_COOKIE)"));
});


test("private company overview rejects customers and never infers tenant scope from owner identity", () => {
  const route = source("app/api/company/route.ts");
  const scopedResolver = route.slice(route.indexOf("async function getScopedCompany"), route.indexOf("export async function GET"));
  assert.ok(route.includes('["COMPANY_ADMIN", "EMPLOYEE", "PLATFORM_ADMIN"].includes(session.role)'));
  assert.ok(scopedResolver.includes('role: session.role'));
  assert.ok(scopedResolver.includes('workspaceId: session.workspaceId'));
  assert.ok(scopedResolver.includes('return session.companyId ? Company.findById(session.companyId).lean() : null;'));
  assert.ok(!scopedResolver.includes('Company.findOne({ ownerUserId: session.userId })'));
});


test("desktop push delivery is removed and in-app task notifications remain tenant scoped", () => {
  const workspace = source("components/workspace-dashboard.tsx");
  const taskBoard = source("features/task-management/components/task-management-dashboard.tsx");
  const taskEvents = source("features/task-management/server/task-events.ts");
  const bookings = source("app/api/public/[companySlug]/bookings/route.ts");
  const meetingRequests = source("app/api/employee/requests/route.ts");
  const taskNotifications = source("app/api/tasks/notifications/route.ts");
  const worker = source("public/sw.js");
  const readme = source("README.md");

  assert.doesNotMatch(workspace, /DesktopNotificationCenter|sendDesktopNotification|getUnseenDesktopNotificationIds/);
  assert.doesNotMatch(taskBoard, /DesktopNotificationCenter|desktop-notification-settings/);
  assert.doesNotMatch(taskEvents, /sendWebPushNotifications|web-push|from "next.server"/);
  assert.doesNotMatch(bookings, /sendWebPushNotifications|isWebPushConfigured|web-push/);
  assert.doesNotMatch(meetingRequests, /searchParams.get\("notifications"\)/);
  assert.doesNotMatch(taskNotifications, /desktopOnly|searchParams.get\("desktop"\)/);
  assert.ok(taskNotifications.includes("TaskNotification.find(recipientFilter)"));
  assert.ok(worker.includes("self.registration.unregister()"));
  assert.doesNotMatch(worker, /addEventListener\(["']push["']/);
  assert.doesNotMatch(readme, /WEB_PUSH_VAPID|generate-vapid-keys|Desktop alerts use the browser Notification API/i);
  for (const removedPath of [
    "components/desktop-notification-settings.tsx",
    "app/api/notifications/push/route.ts",
    "lib/web-push.ts",
    "models/push-subscription.ts",
    "scripts/generate-vapid-keys.mjs"
  ]) {
    assert.equal(existsSync(resolve(process.cwd(), removedPath)), false, removedPath + " should be deleted");
  }
});


test("invoice service periods hydrate invoice views and the profile dropdown remains focused on user details", () => {
  const invoicing = source("lib/invoicing.ts");
  const billing = source("lib/billing.ts");
  const invoiceList = source("app/api/billing/invoices/route.ts");
  const invoicePage = source("app/billing/invoices/[invoiceId]/page.tsx");
  const invoicePdf = source("app/api/billing/invoices/[invoiceId]/pdf/route.ts");
  const profileRoute = source("app/api/profile/member/route.ts");
  const profileUi = source("components/workspace-user-profile.tsx");
  const dashboard = source("components/workspace-dashboard.tsx");

  assert.ok(invoicing.includes("export function resolveInvoiceBillingPeriod"));
  assert.ok(billing.includes("missingDates.billingPeriodEnd = period.billingPeriodEnd"));
  assert.ok(invoiceList.includes("billingPeriodStart: billingPeriod.billingPeriodStart"));
  assert.ok(invoicePage.includes("billingPeriodEnd: billingPeriod.billingPeriodEnd"));
  assert.ok(invoicePdf.includes("dateLabel(billingPeriod.billingPeriodStart)"));
  assert.ok(profileRoute.includes("AvailabilityRule.find"));
  assert.ok(profileUi.includes("Work availability"));
  assert.doesNotMatch(profileUi, /Plan period|billingPlan|profileCompany/);
  assert.ok(dashboard.includes("Plan period:"));
});


test("company vault APIs stay tenant-scoped and Bunny secrets remain server-only", () => {
  const routes = [
    "app/api/vault/route.ts",
    "app/api/vault/folders/route.ts",
    "app/api/vault/folders/[folderId]/route.ts",
    "app/api/vault/uploads/route.ts",
    "app/api/vault/uploads/[uploadId]/chunks/[chunkIndex]/route.ts",
    "app/api/vault/uploads/[uploadId]/complete/route.ts",
    "app/api/vault/uploads/[uploadId]/route.ts",
    "app/api/vault/files/[fileId]/route.ts"
  ].map(source);

  for (const route of routes) {
    assert.ok(route.includes("requireVaultScope()"));
    assert.ok(route.includes("scope.companyId"));
    assert.ok(route.includes("scope.workspaceId"));
    assert.doesNotMatch(route, /searchParams\.get\(["']companyId["']\)/);
    assert.doesNotMatch(route, /body\.companyId/);
  }

  const storage = source("features/company-vault/server/vault-storage.ts");
  const browser = source("components/company-vault.tsx");
  const downloads = source("app/api/vault/files/[fileId]/route.ts");
  const folderModel = source("models/vault-folder.ts");
  const fileModel = source("models/vault-file.ts");
  const folderCreate = source("app/api/vault/folders/route.ts");

  assert.ok(storage.includes("requireCompanyMember("));
  assert.ok(storage.includes("headers: Record<string, string> = { AccessKey: config.password }"));
  assert.ok(storage.includes("vaultFolderSegment"));
  assert.ok(folderCreate.includes('parent.storageKey + "/" + folderSegment'));
  assert.ok(folderCreate.includes('storageRoot + "/" + folderSegment'));
  assert.doesNotMatch(browser, /BUNNY_STORAGE_PASSWORD|AccessKey/);
  assert.ok(downloads.includes('"Content-Disposition": downloadDisposition(file.originalName, inline)'));
  assert.ok(downloads.includes('"X-Content-Type-Options": "nosniff"'));
  assert.ok(downloads.includes('"Cache-Control": "private, no-store"'));
  assert.match(folderModel, /companyId:[\s\S]*?immutable: true/);
  assert.match(folderModel, /workspaceId:[\s\S]*?immutable: true/);
  assert.match(fileModel, /companyId:[\s\S]*?immutable: true/);
  assert.match(fileModel, /workspaceId:[\s\S]*?immutable: true/);

  const listing = source("app/api/vault/route.ts");
  assert.doesNotMatch(listing, /cleanupExpiredVaultUploads|bunnyEnsureMarker/);
});



test("vault limits follow company plan entitlement, avoid Bunny folder marker writes, and stream completed files", () => {
  const storage = source("features/company-vault/server/vault-storage.ts");
  const createFolder = source("app/api/vault/folders/route.ts");
  const complete = source("app/api/vault/uploads/[uploadId]/complete/route.ts");
  const plans = source("lib/plan-catalog.ts");
  const planSchema = source("models/plan.ts");
  const profile = source("components/company-profile.tsx");
  const vaultUi = source("components/company-vault.tsx");
  const sidebar = source("components/workspace-sidebar.tsx");

  assert.ok(storage.includes("getCompanyEntitlements"));
  assert.ok(storage.includes("VAULT_FEATURE_NOT_INCLUDED"));
  assert.ok(storage.includes("scope.vaultQuotaBytes"));
  assert.ok(storage.includes("scope.vaultMaxItems"));
  assert.ok(storage.includes("usedItems: 1"));
  assert.ok(storage.includes("bunnyPutStream"));
  assert.ok(planSchema.includes("vaultEnabled"));
  assert.ok(plans.includes("vaultQuotaBytes"));
  assert.doesNotMatch(createFolder, /bunnyEnsureMarker|\.conventus-folder/);
  assert.ok(complete.includes("streamVaultParts("));
  assert.ok(complete.includes("if (finalStorageKey)"));
  assert.doesNotMatch(complete, /Buffer\.concat|bunnyReadBuffer/);
  assert.doesNotMatch(profile, /body:\s*JSON\.stringify\(\{[\s\S]*slug:\s*form\.slug/);
  assert.doesNotMatch(vaultUi, /window\.(?:prompt|confirm|alert)\s*\(/);
  assert.ok(vaultUi.includes('role="progressbar"'));
  assert.ok(vaultUi.includes("onDrop="));
  assert.ok(sidebar.includes("{vaultEnabled && ("));
});


test("vault quota counter remains compatible with workspace-era records", () => {
  const usageModel = source("models/vault-usage.ts");
  const storage = source("features/company-vault/server/vault-storage.ts");
  const adminUsage = source("app/api/admin/vault-usage/route.ts");

  assert.ok(usageModel.includes("vaultUsageSchema.index({ companyId: 1, workspaceId: 1 }, { unique: true })"));
  assert.ok(storage.includes("const usageWorkspaceId = companyId"));
  assert.ok(storage.includes("VaultUsage.deleteMany({ companyId, workspaceId: { $ne: usageWorkspaceId } })"));
  assert.ok(adminUsage.includes("const usedBytes = (fileStats?.sizeBytes ?? 0) + (pendingStats?.sizeBytes ?? 0);"));
  assert.ok(adminUsage.includes("committedFiles"));
});


test("company vault uses the database company name plus immutable company ID for Bunny prefixes", () => {
  const company = source("models/company.ts");
  const storage = source("features/company-vault/server/vault-storage.ts");
  const adminUsage = source("app/api/admin/vault-usage/route.ts");

  assert.ok(company.includes("vaultStorageRoot"));
  assert.ok(storage.includes("buildCompanyVaultRoot(company.name, String(company._id))"));
  assert.ok(storage.includes('return "company-" + readable + "-" + companyId'));
  assert.ok(storage.includes("counterVersion: 2"));
  assert.ok(storage.includes("deleteVaultFileAndRelease"));
  assert.ok(storage.includes("getVaultUsageSnapshot"));
  assert.ok(adminUsage.includes("storagePrefix: company.vaultStorageRoot ?? buildCompanyVaultRoot(company.name, companyId)"));
});

test("company profile and drive thumbnails use live usage and labeled, private previews", () => {
  const companyRoute = source("app/api/company/route.ts");
  const profile = source("components/company-profile.tsx");
  const drive = source("components/company-vault.tsx");
  const fileRoute = source("app/api/vault/files/[fileId]/route.ts");

  assert.ok(companyRoute.includes("getVaultUsageSnapshot"));
  assert.ok(profile.includes("Company Cloud Vault usage"));
  assert.ok(drive.includes("fileTypeLabel"));
  assert.ok(drive.includes('loading="lazy"'));
  assert.ok(drive.includes("<video"));
  assert.ok(fileRoute.includes("Accept-Ranges"));
  assert.ok(fileRoute.includes("deleteVaultFileAndRelease"));
});


test("vault errors do not expose MongoDB or provider internals to users", () => {
  const storage = source("features/company-vault/server/vault-storage.ts");
  assert.ok(storage.includes("Internal MongoDB/provider errors belong in server logs"));
  assert.ok(storage.includes('console.error("Company vault operation failed"'));
  assert.doesNotMatch(storage, /return jsonError\\(code \\|\\| fallback, status\\)/);
});


test("vault compression is lossless, optional, and usage is counted by stored bytes", () => {
  const fileModel = source("models/vault-file.ts");
  const uploadModel = source("models/vault-upload.ts");
  const uploadRoute = source("app/api/vault/uploads/route.ts");
  const complete = source("app/api/vault/uploads/[uploadId]/complete/route.ts");
  const fileRoute = source("app/api/vault/files/[fileId]/route.ts");
  const storage = source("features/company-vault/server/vault-storage.ts");
  const adminUsage = source("app/api/admin/vault-usage/route.ts");
  const ui = source("components/company-vault.tsx");

  assert.ok(fileModel.includes("storageSizeBytes"));
  assert.ok(fileModel.includes('enum: ["identity", "gzip"]'));
  assert.ok(uploadModel.includes("originalSizeBytes"));
  assert.ok(uploadRoute.includes("originalSizeBytes > scope.vaultMaxFileBytes"));
  assert.ok(uploadRoute.includes("contentEncoding"));
  assert.ok(complete.includes("storageSizeBytes: claimedUpload.sizeBytes"));
  assert.ok(complete.includes("contentEncoding: claimedUpload.contentEncoding ?? \"identity\""));
  assert.ok(fileRoute.includes('new DecompressionStream("gzip")'));
  assert.ok(storage.includes('$ifNull: ["$storageSizeBytes", "$sizeBytes"]'));
  assert.ok(adminUsage.includes('$ifNull: ["$storageSizeBytes", "$sizeBytes"]'));
  assert.ok(ui.includes('new CompressionStream("gzip")'));
  assert.ok(ui.includes('compressed.size + 128 < file.size'));
  assert.ok(ui.includes('return { blob: file, contentEncoding: "identity" }'));
});
