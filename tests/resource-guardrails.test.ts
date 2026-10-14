import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string) {
  // Normalize checkout line endings so multi-line source assertions work on Windows and Linux.
  return readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");
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
  assert.ok(employees.includes('.select("userId role employmentStatus createdAt")'));
  assert.ok(employees.includes(".limit(limit + 1)"));
  assert.ok(employees.includes("nextCursor: hasMore"));
  assert.ok(dashboard.includes('api<EmployeePage>("/api/company/employees?limit=5")'));
  assert.ok(dashboard.includes("Load 5 more members"));
  assert.ok(employees.includes('.select("_id name email image role jobTitle department")'));
  assert.ok(employees.includes('jobTitle: user.jobTitle ?? ""'));
  assert.ok(employees.includes('department: user.department ?? ""'));
});

test("job title and department are owned by users, while employment status stays with membership", () => {
  const userModel = source("models/user.ts");
  const membershipModel = source("models/membership.ts");
  const employeeDirectory = source("app/api/company/employees/route.ts");
  const employeeProfile = source("app/api/company/employees/[userId]/route.ts");
  const oauthCallback = source("app/api/auth/google/callback/route.ts");
  const companyRoute = source("app/api/company/route.ts");
  const workspaceModel = source("models/workspace.ts");
  const billing = source("lib/billing.ts");
  const freePlanRoute = source("app/api/billing/free/route.ts");
  const ownProfile = source("app/api/profile/member/route.ts");
  const migration = source("scripts/migrate-membership-profile-fields.mjs");
  const packageJson = JSON.parse(source("package.json")) as { scripts: Record<string, string> };
  const plansServer = source("lib/plans-server.ts");
  const planSnapshotSchema = source("models/plan-entitlement-snapshot.ts");
  const invoiceModel = source("models/invoice.ts");
  const paymentModel = source("models/payment.ts");
  const subscriptionModel = source("models/subscription.ts");
  const invoicing = source("lib/invoicing.ts");
  const addressSchema = source("models/address-schema.ts");
  const companyModel = source("models/company.ts");
  const platformSettings = source("models/platform-settings.ts");
  const userProfileValidation = source("lib/user-profile.ts");
  const profileUi = source("components/workspace-user-profile.tsx");

  assert.match(userModel, /jobTitle:[\s\S]*?department:/);
  assert.doesNotMatch(membershipModel, /jobTitle|department|googleConnectionStatus/);
  assert.doesNotMatch(userModel, /googleSubject|googleEmail/);
  assert.ok(employeeDirectory.includes('.select("userId role employmentStatus createdAt")'));
  assert.ok(employeeDirectory.includes('.select("_id name email image role jobTitle department")'));
  assert.ok(employeeDirectory.includes('jobTitle: user.jobTitle ?? ""'));
  assert.ok(employeeDirectory.includes('department: user.department ?? ""'));
  assert.ok(employeeProfile.includes("User.findByIdAndUpdate"));
  assert.ok(ownProfile.includes("User.findByIdAndUpdate"));
  assert.ok(ownProfile.includes("Membership.findOneAndUpdate"));
  assert.ok(migration.includes('$unset: { jobTitle: "", department: "", googleConnectionStatus: "" }'));
  assert.doesNotMatch(employeeProfile, /googleConnectionStatus/);
  assert.doesNotMatch(oauthCallback, /googleConnectionStatus/);
  assert.doesNotMatch(companyRoute, /googleConnectionStatus/);
  assert.doesNotMatch(workspaceModel, /planId/);
  assert.doesNotMatch(billing, /Workspace\.updateOne/);
  assert.doesNotMatch(freePlanRoute, /Workspace\.updateOne/);
  assert.doesNotMatch(companyRoute, /planId:\s*"free"/);
  assert.ok(migration.includes('workspacePlanIdsRemoved'));
  assert.ok(migration.includes('$unset: { googleSubject: "", googleEmail: "" }'));
  assert.doesNotMatch(oauthCallback.replace(oauthCallback.slice(oauthCallback.indexOf("      await GoogleAccount.findOneAndUpdate("), oauthCallback.indexOf("\n      await User.findByIdAndUpdate(", oauthCallback.indexOf("      await GoogleAccount.findOneAndUpdate("))), ""), /googleSubject|googleEmail/);
  assert.ok(migration.includes('$unset: { planId: "" }'));
  assert.ok(migration.includes("ORPHANED_MEMBERSHIP_PROFILE_DATA"));
  assert.equal(packageJson.scripts["membership-profile:migrate"], "node scripts/migrate-membership-profile-fields.mjs");
  assert.doesNotMatch(plansServer, /Workspace\.updateOne|from "@\/models\/workspace"/);
  assert.ok(plansServer.includes("planAccessExpiresAt: periodEnd"));
  assert.ok(planSnapshotSchema.includes("liveChatEnabled"));
  assert.ok(planSnapshotSchema.includes("liveChatMessageCooldownSeconds"));
  assert.ok(planSnapshotSchema.includes("liveChatPdfExportEnabled"));
  assert.ok(invoiceModel.includes("planEntitlementSnapshotSchema"));
  assert.ok(paymentModel.includes("planEntitlementSnapshotSchema"));
  assert.ok(subscriptionModel.includes("planEntitlementSnapshotSchema"));
  assert.ok(invoicing.includes("planSnapshot: createEntitlementSnapshot(input.plan)"));
  assert.doesNotMatch(invoiceModel, /planSnapshot:\s*\{\s*id:/);
  assert.doesNotMatch(paymentModel, /checkoutPlanSnapshot:\s*\{\s*_id:\s*false/);
  assert.doesNotMatch(subscriptionModel, /entitlementSnapshot:\s*\{\s*_id:\s*false/);
  assert.ok(companyModel.includes("createAddressSchema"));
  assert.ok(platformSettings.includes("createAddressSchema"));
  assert.ok(invoiceModel.includes("createAddressSchema"));
  assert.ok(addressSchema.includes("ADDRESS_MAX_LENGTHS"));
  assert.ok(employeeProfile.includes("normalizeUserProfileFields"));
  assert.ok(ownProfile.includes("normalizeUserProfileFields"));
  assert.doesNotMatch(employeeProfile, /body\.jobTitle\.trim\(\)|body\.department\.trim\(\)/);
  assert.doesNotMatch(ownProfile, /body\.jobTitle\.trim\(\)|body\.department\.trim\(\)/);
  assert.ok(userProfileValidation.includes("USER_JOB_TITLE_MAX_LENGTH"));
  assert.ok(userProfileValidation.includes("USER_DEPARTMENT_MAX_LENGTH"));
  assert.ok(userProfileValidation.includes("EMPLOYMENT_STATUSES"));
  assert.ok(membershipModel.includes("enum: [...EMPLOYMENT_STATUSES]"));
  assert.ok(profileUi.includes("EMPLOYMENT_STATUSES.map"));
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
    assert.match(route, /requireVaultScope\s*\(/, "vault route must resolve an authenticated scope");
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
  assert.ok(downloads.includes('"Cache-Control": "private, no-store, max-age=0"'));
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
  assert.doesNotMatch(createFolder, /bunnyEnsureMarker|\.canvas-folder/);
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
  const adminUsage = source("lib/admin-vault-usage.ts");

  assert.ok(usageModel.includes("vaultUsageSchema.index({ companyId: 1, workspaceId: 1 }, { unique: true })"));
  assert.ok(storage.includes("const usageWorkspaceId = companyId"));
  assert.ok(storage.includes("VaultUsage.deleteMany({ companyId, workspaceId: { $ne: usageWorkspaceId } })"));
  assert.ok(adminUsage.includes("const usedBytes = (fileStats?.sizeBytes ?? 0) + pendingUploadBytes;"));
  assert.ok(adminUsage.includes("committedFiles"));
});


test("company vault uses the database company name plus immutable company ID for Bunny prefixes", () => {
  const company = source("models/company.ts");
  const storage = source("features/company-vault/server/vault-storage.ts");
  const adminUsage = source("lib/admin-vault-usage.ts");

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
  const adminUsage = source("lib/admin-vault-usage.ts");
  const ui = source("components/company-vault.tsx");

  assert.ok(fileModel.includes("storageSizeBytes"));
  assert.ok(fileModel.includes('enum: ["identity", "gzip"]'));
  assert.ok(uploadModel.includes("originalSizeBytes"));
  assert.ok(uploadRoute.includes("originalSizeBytes > scope.vaultMaxFileBytes"));
  assert.ok(uploadRoute.includes("contentEncoding"));
  assert.ok(complete.includes("storageSizeBytes: claimedUpload.sizeBytes"));
  assert.ok(complete.includes("contentEncoding: claimedUpload.contentEncoding ?? \"identity\""));
  assert.ok(fileRoute.includes('new DecompressionStream("gzip")'));
  assert.ok(storage.includes("file.storageSizeBytes ?? file.sizeBytes"));
  assert.ok(adminUsage.includes('$ifNull: ["$storageSizeBytes", "$sizeBytes"]'));
  assert.ok(ui.includes('new CompressionStream("gzip")'));
  assert.ok(ui.includes('compressed.size + 128 < file.size'));
  assert.ok(ui.includes('return { blob: file, contentEncoding: "identity" }'));
});


test("vault uploads stream chunks and never report 100 percent before Bunny finalization", () => {
  const chunks = source("app/api/vault/uploads/[uploadId]/chunks/[chunkIndex]/route.ts");
  const storage = source("features/company-vault/server/vault-storage.ts");
  const ui = source("components/company-vault.tsx");
  const start = source("app/api/vault/uploads/route.ts");
  const cleanupJob = source("app/api/jobs/vault-upload-cleanup/route.ts");
  const vercel = source("vercel.json");

  assert.ok(chunks.includes("bunnyPutStream("));
  assert.ok(chunks.includes("streamRequestBody(request.body, expectedSize)"));
  assert.ok(!chunks.includes("request.arrayBuffer()"));
  assert.ok(!chunks.includes("Buffer.from(await request.arrayBuffer())"));
  assert.ok(storage.includes("export async function* streamRequestBody("));
  assert.ok(storage.includes("Math.min(6, chunkCount)"));
  assert.ok(storage.includes("batchLimit?: number"));
  assert.doesNotMatch(start, /cleanupExpiredVaultUploads/);

  const chunkRequest = ui.indexOf('await apiRequest("/api/vault/uploads/" + upload.uploadId + "/chunks/" + index');
  const confirmedProgress = ui.indexOf("setUploadPercent(percentage);", chunkRequest);
  const finalization = ui.indexOf('await apiRequest("/api/vault/uploads/" + upload.uploadId + "/complete"');
  const completedProgress = ui.indexOf("setUploadPercent(100);");
  assert.ok(chunkRequest >= 0 && confirmedProgress > chunkRequest);
  assert.ok(finalization > confirmedProgress);
  assert.ok(completedProgress > finalization);
  assert.ok(ui.includes("Math.min(99, Math.floor("));
  assert.ok(ui.includes("Upload complete · Bunny confirmed all files"));

  assert.ok(cleanupJob.includes("cleanupExpiredVaultUploads(undefined, CLEANUP_BATCH_LIMIT)"));
  assert.ok(cleanupJob.includes('request.headers.get("authorization") === `Bearer ${secret}`'));
  assert.ok(vercel.includes('"schedule": "0 3 * * *"'));
});


test("vault listing and usage reads are bounded for very large tenants", () => {
  const listing = source("app/api/vault/route.ts");
  const storage = source("features/company-vault/server/vault-storage.ts");
  const files = source("models/vault-file.ts");
  const folders = source("models/vault-folder.ts");
  const usage = storage.slice(
    storage.indexOf("export async function getVaultUsageSnapshot("),
    storage.indexOf("export function uploadChunkKey(")
  );
  const download = source("app/api/vault/files/[fileId]/route.ts");

  assert.ok(listing.includes("const PAGE_SIZE = 5"));
  assert.ok(listing.includes(".limit(PAGE_SIZE + 1)"));
  assert.ok(listing.includes("nextFolderCursor"));
  assert.ok(listing.includes("nextFileCursor"));
  assert.ok(files.includes("originalName: 1, _id: 1"));
  assert.ok(folders.includes("nameKey: 1, _id: 1"));
  assert.equal(usage.includes(".aggregate("), false);
  assert.equal(usage.includes("$lookup"), false);
  assert.equal(usage.includes("pendingRows"), false);
  assert.ok(usage.includes("usage.counterVersion !== 2"));
  assert.ok(download.includes('"Cache-Control": "private, no-store, max-age=0"'));
  assert.ok(download.includes('"Cross-Origin-Resource-Policy": "same-origin"'));
  assert.ok(download.includes('request.headers.get("sec-fetch-site") === "cross-site"'));
});


test("invoice UI and one-page PDF resolve the full plan-specific feature entitlement snapshot", () => {
  const invoiceModel = source("models/invoice.ts");
  const paymentModel = source("models/payment.ts");
  const planSnapshotSchema = source("models/plan-entitlement-snapshot.ts");
  const invoicing = source("lib/invoicing.ts");
  const resolver = source("lib/invoice-plan-snapshot.ts");
  const invoicePage = source("app/billing/invoices/[invoiceId]/page.tsx");
  const invoiceList = source("app/api/billing/invoices/route.ts");
  const invoiceUi = source("components/invoice-document.tsx");
  const pdf = source("app/api/billing/invoices/[invoiceId]/pdf/route.ts");

  for (const field of ["taskManagementDailyLimit", "vaultEnabled", "vaultQuotaBytes", "vaultMaxFileBytes", "vaultMaxItems", "liveChatEnabled", "liveChatMonthlyLimit"]) {
    assert.ok(planSnapshotSchema.includes(field), "shared plan snapshot persists " + field);
    assert.ok(invoiceModel.includes("planEntitlementSnapshotSchema"), "invoice uses the shared plan snapshot schema");
    assert.ok(paymentModel.includes("planEntitlementSnapshotSchema"), "checkout uses the shared plan snapshot schema");
    assert.ok(resolver.includes(field), "legacy invoice resolver repairs " + field);
  }
  assert.ok(invoicing.includes("planSnapshot: createEntitlementSnapshot(input.plan)"));

  assert.ok(invoicePage.includes("resolveInvoicePlanSnapshot"));
  assert.ok(invoiceList.includes("resolveInvoicePlanSnapshot"));
  assert.ok(invoiceUi.includes('label="Task management"'));
  assert.ok(invoiceUi.includes('label="Cloud Vault"'));
  assert.ok(invoiceUi.includes('label="Task daily limit"'));
  assert.ok(pdf.includes('"Task management: " + (planSnapshot.taskManagementEnabled ? "Included" : "Not included")'));
  assert.ok(pdf.includes('"Cloud Vault: " + (planSnapshot.vaultEnabled ? "Included" : "Not included")'));
  assert.equal((pdf.match(/pdfDoc\.addPage\(/g) ?? []).length, 1, "invoice PDF stays one page");
});


test("company dashboard navigation stays consistent, collapsible, branded, and entitlement-aware on every page", () => {
  const sidebar = source("components/workspace-sidebar.tsx");
  const sidebarState = source("components/use-workspace-sidebar-state.ts");
  const workspace = source("components/workspace-dashboard.tsx");
  const tasks = source("features/task-management/components/task-management-dashboard.tsx");
  const taskPage = source("app/dashboard/tasks/page.tsx");
  const vault = source("components/company-vault.tsx");
  const vaultPage = source("app/dashboard/vault/page.tsx");
  const profile = source("components/company-profile.tsx");

  assert.ok(sidebar.includes("{companyName || \"Company workspace\"}"));
  assert.ok(sidebar.includes("Powered by Canvas"));
  assert.ok(sidebar.includes("Task Management"));
  assert.ok(sidebar.includes("Cloud Vault"));
  assert.ok(sidebar.includes("aria-label={collapsed ? \"Expand sidebar\" : \"Collapse sidebar\"}"));
  assert.ok(sidebar.includes("aria-expanded={mobileMenuOpen}"));
  assert.doesNotMatch(sidebar, /api\/auth\/logout|Sign out|LogOut/);
  assert.ok(sidebarState.includes("canvas:workspace-sidebar-collapsed"));
  assert.ok(workspace.includes("useWorkspaceSidebarState"));
  assert.ok(workspace.includes('sidebarCollapsed ? "lg:pl-20" : "lg:pl-72"'));
  assert.ok(tasks.includes("vaultEnabled={vaultEnabled}"));
  assert.ok(taskPage.includes("vaultEnabled={Boolean(plan.vaultEnabled)}"));
  assert.ok(vault.includes("taskManagementEnabled={taskManagementEnabled}"));
  assert.ok(vaultPage.includes("taskManagementEnabled={Boolean(entitlements.taskManagementEnabled)}"));
  assert.ok(profile.includes("taskManagementEnabled={taskManagementEnabled}"));
});


test("enterprise workspace sidebar groups navigation, aligns the toggle, and retains scroll context", () => {
  const sidebar = source("components/workspace-sidebar.tsx");
  const skeleton = source("components/route-loading.tsx");
  const dashboard = source("components/workspace-dashboard.tsx");
  const profilePage = source("app/dashboard/company-profile/page.tsx");
  const profile = source("components/company-profile.tsx");

  assert.ok(sidebar.includes('className={`flex items-center justify-between ${collapsed ? "gap-1" : "gap-2.5"}`}'));
  assert.ok(sidebar.includes('className="grid size-8 shrink-0 place-items-center'));
  assert.ok(sidebar.includes('aria-label="Core Workspace"'));
  assert.ok(sidebar.includes('aria-label="Workspace Tools"'));
  assert.ok(sidebar.includes('aria-label="Workspace Management"'));
  assert.ok(sidebar.includes('aria-label="Help & Support"'));
  assert.ok(sidebar.includes('aria-label="Mobile company workspace navigation"'));
  assert.ok(sidebar.includes("sessionStorage.setItem(SIDEBAR_SCROLL_KEY"));
  assert.ok(sidebar.includes("ref={attachNavRef}"));
  assert.ok(sidebar.includes('scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" })'));
  assert.ok(sidebar.includes("data-sidebar-active={isSettings ? \"true\" : \"false\"}"));
  assert.ok(sidebar.includes("onOpenPanel"));
  assert.ok(sidebar.includes("router.push(`/dashboard?${query.toString()}`)"));
  assert.ok(sidebar.includes("onNavigateOverview"));
  assert.ok(!sidebar.includes("/api/auth/logout"));
  assert.ok(!sidebar.includes("Sign out"));
  assert.ok(!sidebar.includes("LogOut"));

  assert.ok(skeleton.includes('min-h-[68px] items-center justify-between gap-2.5'));
  assert.ok(skeleton.includes('className="size-8 shrink-0 rounded-lg"'));
  assert.ok(skeleton.includes("Array.from({ length: 4 }"));
  assert.ok(dashboard.includes("useWorkspaceSidebarState"));
  assert.ok(dashboard.includes("onToggleCollapsed={toggleSidebar}"));
  assert.ok(profilePage.includes("<CompanyProfile"));
  assert.ok(profile.includes("WorkspaceSidebar"));
  assert.ok(profile.includes("onToggleCollapsed={toggleSidebar}"));
});


test("Cloud Vault server-prefetches tenant content and renders a light Drive-style explorer", () => {
  const page = source("app/dashboard/vault/page.tsx");
  const vault = source("components/company-vault.tsx");

  assert.ok(page.includes("getTenantFolder(scope, requestedFolderId)"));
  assert.ok(page.includes("VaultFolder.find({ companyId, workspaceId, parentFolderId })"));
  assert.ok(page.includes("VaultFile.find({ companyId, workspaceId, folderId: parentFolderId })"));
  assert.ok(page.includes("getVaultUsageSnapshot({"));
  assert.ok(page.includes("initialSnapshot={initialSnapshot}"));
  assert.ok(vault.includes("useState<VaultSnapshot | null>(initialSnapshot)"));
  assert.ok(vault.includes("lastLoadedRequestRef.current"));
  assert.ok(vault.includes('aria-label="Filter files by type"'));
  assert.ok(vault.includes('["spreadsheets", "Spreadsheets"]'));
  assert.ok(vault.includes("Drop files to upload"));
  assert.ok(vault.includes('aria-label={"Preview " + file.name}'));
  assert.ok(vault.includes("<span>File size</span>"));
  assert.doesNotMatch(vault, /bg-slate-950|blur-3xl|backdrop-blur|bg-black/);
  assert.ok(vault.includes("/api/vault/uploads"));
  assert.ok(vault.includes("/api/vault/folders/"));
  assert.ok(vault.includes("/api/vault/files/"));
});


test("Cloud Vault PDF previews use the first-party page-by-page canvas viewer", () => {
  const vault = source("components/company-vault.tsx");
  const viewer = source("components/custom-pdf-viewer.tsx");

  assert.ok(vault.includes('import CustomPdfViewer from "@/components/custom-pdf-viewer"'));
  assert.ok(vault.includes("<CustomPdfViewer"));
  assert.ok(vault.includes('previewFile.name.toLowerCase().endsWith(".pdf")'));
  assert.ok(vault.includes('"/api/vault/files/" + encodeURIComponent(previewFile.id) + "?inline=1"'));
  assert.ok(viewer.includes('import("pdfjs-dist")'));
  assert.ok(viewer.includes('new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url)'));
  assert.ok(viewer.includes('aria-label="Previous PDF page"'));
  assert.ok(viewer.includes('aria-label="Next PDF page"'));
  assert.ok(viewer.includes("canvasContext: context"));
  assert.ok(viewer.includes("Fit width"));
});

test("landing pricing is rendered from fresh server data, not cached marketing HTML", () => {
  const landing = source("app/page.tsx");
  const config = source("next.config.ts");

  assert.ok(landing.includes('export const dynamic = "force-dynamic";'));
  assert.ok(landing.includes('export const runtime = "nodejs";'));
  assert.ok(landing.includes("const plans = await listPublicPlans();"));
  assert.match(config, /source: "\/",\s*headers: \[noStore\]/);
  assert.doesNotMatch(config, /source: "\/",\s*headers: \[publicLongCache\]/);
});

test("billing checkout renders the selected server plan and its configured entitlements", () => {
  const checkout = source("app/billing/checkout/page.tsx");
  const button = source("components/razorpay-plan-button.tsx");

  assert.ok(checkout.includes('plan = await getPlanForCheckout(planId);'));
  assert.ok(checkout.includes("Plan ID: {plan.id}"));
  assert.ok(checkout.includes("{plan.description}"));
  assert.ok(checkout.includes('["Workspaces", String(plan.maxWorkspaces)]'));
  assert.ok(checkout.includes('["Companies", String(plan.maxCompanies)]'));
  assert.ok(checkout.includes("plan.taskManagementEnabled"));
  assert.ok(checkout.includes("plan.vaultEnabled"));
  assert.ok(checkout.includes("plan.liveChatEnabled"));
  assert.ok(button.includes('if (checkoutData.planId !== planId)'));
  assert.ok(button.includes('"Plan ID": checkoutData.planId'));
});

test("company plan suspension is admin-controlled, server-enforced, and restored by an applied paid plan", () => {
  const company = source("models/company.ts");
  const adminPage = source("components/admin-company-details.tsx");
  const suspensionApi = source("app/api/admin/companies/[companyId]/plan-suspension/route.ts");
  const expiryApi = source("app/api/admin/companies/[companyId]/plan-expiry-test/route.ts");
  const suspensionButton = source("components/admin-company-plan-suspension-button.tsx");
  const plans = source("lib/plans-server.ts");
  const companyAccessApi = source("app/api/company/plan-access/route.ts");
  const workspace = source("components/workspace-dashboard.tsx");
  const billing = source("lib/billing.ts");
  const tasks = source("features/task-management/server/task-authorization.ts");
  const vault = source("features/company-vault/server/vault-storage.ts");
  const booking = source("app/api/public/[companySlug]/bookings/route.ts");
  const liveChat = source("lib/live-chat.ts");
  const publicChatConfig = source("app/api/public/live-chat/[companySlug]/route.ts");
  const publicChatConversations = source("app/api/public/live-chat/[companySlug]/conversations/route.ts");
  const publicChatMessages = source("app/api/public/live-chat/[companySlug]/conversations/[conversationId]/messages/route.ts");

  assert.ok(company.includes('planSuspended: { type: Boolean, default: false, index: true }'));
  assert.ok(company.includes('planAccessExpiresAt: { type: Date }'));
  assert.ok(company.includes('planExpired: { type: Boolean, default: false, index: true }'));
  assert.ok(adminPage.includes("<AdminCompanyPlanSuspensionButton"));
  assert.ok(suspensionButton.includes('JSON.stringify({ suspended: next })'));
  assert.ok(suspensionButton.includes("setIsSuspended(next)"));
  assert.ok(suspensionApi.includes("requirePlatformAdmin()"));
  assert.ok(suspensionApi.includes('action: body.suspended ? "PLAN_SUSPENDED" : "PLAN_RESUMED"'));
  assert.ok(expiryApi.includes("requirePlatformAdmin()"));
  assert.ok(expiryApi.includes('action: "PLAN_EXPIRY_TEST_STARTED"'));
  assert.ok(expiryApi.includes("billingPeriodPreserved: true"));
  assert.ok(expiryApi.includes("PLAN_EXPIRY_TEST_RESTORED"));
  assert.ok(plans.includes('throw new Error("PLAN_SUSPENDED")'));
  assert.ok(plans.includes("planAccessExpiresAt"));
  assert.ok(companyAccessApi.includes("getCompanyPlanAccessState(session.companyId)"));
  assert.ok(plans.includes("planExpiryTestActive: Boolean(company.planExpiryTestActive)"));
  assert.ok(workspace.includes('fetch("/api/company/plan-access"'));
  assert.ok(workspace.includes("window.setInterval(() => void syncPlanAccess(), 8_000)"));
  assert.ok(workspace.includes("Your workspace and existing information remain visible"));
  assert.ok(workspace.includes('data.company.planExpired ? "Your plan has expired" : "Plan access is suspended"'));
  assert.ok(tasks.includes("allowSuspendedRead"));
  assert.ok(vault.includes("allowSuspendedRead"));
  assert.ok(booking.includes('code === "PLAN_SUSPENDED" ? 423'));
  assert.ok(liveChat.includes("PLAN_SUSPENDED"));
  assert.ok(publicChatConfig.includes("assertCompanyPlanNotSuspended(String(context.company._id))"));
  assert.ok(publicChatConversations.includes("assertCompanyPlanNotSuspended(String(context.company._id))"));
  assert.ok(publicChatMessages.includes("assertCompanyPlanNotSuspended(claims.companyId)"));
  assert.ok(source("components/plan-access-guard.tsx").includes('href="/billing/renew"'));
  assert.ok(source("app/billing/checkout/page.tsx").includes('href="/billing/renew"'));
  const dashboardLayout = source("app/dashboard/layout.tsx");
  const memberAuthz = source("lib/authz.ts");
  assert.ok(dashboardLayout.includes("getCompanyPlanAccessState"));
  assert.ok(dashboardLayout.includes("globalGate"));
  assert.ok(memberAuthz.includes("assertCompanyPlanNotSuspended(session.companyId)"));
  assert.ok(memberAuthz.includes("allowPlanLocked?: boolean"));
  assert.ok(source("app/api/company/plan-access/route.ts").includes("{ allowPlanLocked: true }"));
  assert.ok(source("components/plan-access-guard.tsx").includes("/api/company/support-tickets"));
  assert.ok(source("components/plan-access-guard.tsx").includes("Send request to support"));
  assert.ok(source("app/billing/renew/page.tsx").includes("plan.taskManagementEnabled"));
  assert.ok(source("app/billing/renew/page.tsx").includes("plan.vaultEnabled"));
  assert.ok(source("app/billing/renew/page.tsx").includes("plan.liveChatEnabled"));
  assert.ok(source("app/billing/company-profile/page.tsx").includes("BillingCompanyProfileForm"));
  assert.ok(source("app/api/billing/company-profile/route.ts").includes("assertSameOrigin(request)"));
  assert.doesNotMatch(source("components/plan-access-guard.tsx"), /dashboard\?billing=1/);
  assert.ok(billing.includes("// A successful payment restores expired access but never overrides a"));
  assert.ok(billing.includes("planAccessExpiresAt: periodEnd"));
  assert.ok(billing.includes("planExpiryTestActive: false"));
  assert.doesNotMatch(billing, /planSuspended:\s*false/);
  assert.ok(tasks.includes("assertCompanyPlanNotSuspended(scope.companyId)"));
  assert.ok(vault.includes("await assertCompanyPlanNotSuspended(String(companyId))"));
  assert.ok(source("app/dashboard/tasks/page.tsx").includes("PlanAccessGuard"));
  assert.ok(source("app/dashboard/vault/page.tsx").includes("PlanAccessGuard"));
  assert.ok(source("app/dashboard/live-chat/page.tsx").includes("PlanAccessGuard"));
});


test("expired Free plan access locks the whole dashboard and cannot be restarted through the free-plan endpoint", () => {
  const plans = source("lib/plans-server.ts");
  const freePlanApi = source("app/api/billing/free/route.ts");
  const dashboardLayout = source("app/dashboard/layout.tsx");

  assert.ok(plans.includes('subscription.source === "FREE"'));
  assert.ok(plans.includes("freeFeatureExpiresAt"));
  assert.ok(plans.includes("markCompanyPlanExpired(companyId, subscription.currentPeriodEnd)"));
  assert.ok(freePlanApi.includes("getCompanyPlanAccessState(session.companyId)"));
  assert.ok(freePlanApi.includes('"PLAN_REQUIRES_RENEWAL"'));
  assert.ok(dashboardLayout.includes("getCompanyPlanAccessState"));
});

test("platform user role changes share the canonical platform audit model", () => {
  const platformAuditModel = source("models/platform-audit-event.ts");
  const userAccessRoute = source("app/api/admin/access/users/[userId]/route.ts");
  const migration = source("scripts/migrate-admin-audit-events.mjs");
  const packageJson = JSON.parse(source("package.json")) as { scripts: Record<string, string> };

  assert.ok(platformAuditModel.includes('"USER"'));
  assert.ok(userAccessRoute.includes('import { PlatformAuditEvent } from "@/models/platform-audit-event"'));
  assert.equal((userAccessRoute.match(/PlatformAuditEvent\.create/g) ?? []).length, 2);
  assert.doesNotMatch(userAccessRoute, /AdminAuditEvent/);
  assert.ok(migration.includes('db.collection("adminauditevents")'));
  assert.ok(migration.includes('db.collection("platformauditevents")'));
  assert.ok(migration.includes("AUDIT_EVENT_MIGRATION_INCOMPLETE"));
  assert.ok(migration.includes("--drop-legacy"));
  assert.equal(packageJson.scripts["audit-events:migrate"], "node scripts/migrate-admin-audit-events.mjs");
});

test("Mongoose model enums use canonical shared constants instead of copied lists", () => {
  const domain = source("types/domain.ts");
  const taskConstants = source("features/task-management/shared/constants.ts");
  const bookingState = source("lib/booking-state.ts");
  const planRules = source("lib/plan-rules.ts");
  const taskModel = source("models/task.ts");
  const taskActivityModel = source("models/task-activity.ts");
  const taskEvents = source("features/task-management/server/task-events.ts");
  const bookingActivityModel = source("models/booking-activity.ts");
  const bookingHistory = source("lib/booking-history.ts");
  const assignmentModel = source("models/task-assignment.ts");
  const notificationModel = source("models/task-notification.ts");
  const bookingModel = source("models/booking-request.ts");
  const planModel = source("models/plan.ts");
  const paymentModel = source("models/payment.ts");
  const invoiceModel = source("models/invoice.ts");
  const subscriptionModel = source("models/subscription.ts");
  const googleModel = source("models/google-account.ts");

  assert.ok(taskModel.includes("enum: [...TASK_PRIORITIES]"));
  assert.ok(taskModel.includes("enum: [...TASK_STATUSES]"));
  assert.ok(assignmentModel.includes("enum: [...TASK_STATUSES]"));
  assert.ok(notificationModel.includes("enum: [...TASK_NOTIFICATION_TYPES]"));
  assert.ok(taskActivityModel.includes("enum: [...TASK_ACTIVITY_EVENT_TYPES]"));
  assert.ok(taskEvents.includes("eventType: TaskActivityEventType"));
  assert.ok(bookingActivityModel.includes("enum: [...BOOKING_ACTIVITY_EVENT_TYPES]"));
  assert.ok(bookingActivityModel.includes("enum: [...BOOKING_OUTCOMES]"));
  assert.ok(bookingActivityModel.includes("enum: [...BOOKING_ACTIVITY_ACTOR_ROLES]"));
  assert.ok(bookingHistory.includes("import type { BookingActivityEventType, BookingOutcome }"));
  assert.doesNotMatch(taskEvents, /eventType: "TASK_CREATED" \|/);
  assert.doesNotMatch(bookingHistory, /export type BookingActivityEventType =/);
  assert.ok(bookingModel.includes("enum: [...BOOKING_STATUSES]"));
  assert.ok(planModel.includes("enum: [...PLAN_STATUSES]"));
  assert.ok(planModel.includes("enum: [...PLAN_DISCOUNT_TYPES]"));
  assert.ok(paymentModel.includes("enum: [...PLAN_DISCOUNT_TYPES]"));
  assert.ok(invoiceModel.includes("enum: [...PLAN_DISCOUNT_TYPES]"));
  assert.ok(invoiceModel.includes("enum: [...BILLING_SOURCES]"));
  assert.ok(subscriptionModel.includes("enum: [...BILLING_SOURCES]"));
  assert.ok(googleModel.includes("enum: [...GOOGLE_CONNECTION_STATUSES]"));
  assert.ok(domain.includes("BILLING_SOURCES"));
  assert.ok(domain.includes("GOOGLE_CONNECTION_STATUSES"));
  assert.ok(taskConstants.includes("TASK_NOTIFICATION_TYPES"));
  assert.ok(bookingState.includes("BOOKING_STATUSES"));
  assert.ok(planRules.includes("PLAN_DISCOUNT_TYPES"));
});

test("MongoDB database name is environment-configured and Free plan seeding is verified", () => {
  const mongo = source("lib/mongodb.ts");
  const planCatalog = source("lib/plan-catalog.ts");
  const companyRoute = source("app/api/company/route.ts");
  const envExample = source(".env.example");
  const envDocs = source(".env.example.md");
  const scripts = [
    "scripts/create-platform-admin.mjs",
    "scripts/migrate-roles.mjs",
    "scripts/migrate-membership-profile-fields.mjs",
    "scripts/migrate-task-assignees.mjs",
    "scripts/migrate-admin-audit-events.mjs",
    "scripts/seed-canvas-demo.mjs"
  ].map(source);
  const envHelper = source("scripts/lib/env.mjs");
  const demoSeed = source("scripts/seed-canvas-demo.mjs");

  assert.ok(mongo.includes('process.env.MONGODB_DB_NAME?.trim() || "Canvas"'));
  assert.ok(envHelper.includes('process.env.MONGODB_DB_NAME?.trim() || "Canvas"'));
  assert.ok(envExample.includes("MONGODB_DB_NAME=canvas_test"));
  assert.ok(envDocs.includes("MONGODB_DB_NAME=canvas_test"));
  assert.ok(envExample.includes("NEXT_PUBLIC_APP_NAME=Canvas"));
  assert.ok(envExample.includes("NEXT_PUBLIC_COMPANY_NAME=AlgoQuit"));
  assert.ok(scripts.every((script) => script.includes("mongoDatabaseName()")));
  assert.ok(scripts.every((script) => !script.includes('dbName: "Canvas"')));
  assert.ok(demoSeed.includes('EXPECTED_TEST_DATABASE = "canvas_test"'));
  assert.ok(demoSeed.includes("for (let ei = 1; ei <= 49; ei += 1)"));
  assert.ok(demoSeed.includes("const platformToken"));
  assert.ok(demoSeed.includes('"vaultfiles"'));
  assert.ok(demoSeed.includes("Canvas by AlgoQuit"));
  assert.equal(JSON.parse(source("package.json")).scripts["seed:demo"], "node --experimental-strip-types scripts/seed-canvas-demo.mjs");

  assert.ok(planCatalog.includes("seedPromiseState.databaseKey !== databaseKey"));
  assert.ok(planCatalog.includes("function seedPlanDocument"));
  assert.ok(planCatalog.includes("function isDuplicateKeyError"));
  assert.ok(planCatalog.includes('id === "free" ? "FREE_PLAN_NOT_CONFIGURED"'));
  assert.ok(planCatalog.includes('Plan.findOne({ identifier: "free" })'));
  assert.ok(companyRoute.includes("PLAN_CATALOG_UNAVAILABLE"));
  assert.ok(companyRoute.includes('jsonError("FREE_PLAN_NOT_CONFIGURED", 503)'));
});


test("Google Cloud Run container runs the standard Next.js server and keeps runtime secrets out of its image", () => {
  const nextConfig = source("next.config.ts");
  const dockerfile = source("Dockerfile");
  const dockerignore = source(".dockerignore");
  const gcloudignore = source(".gcloudignore");
  const deploymentGuide = source("docs/DEPLOY_GCP_CLOUD_RUN.md");
  const cloudBuild = source("cloudbuild.yaml");

  assert.ok(nextConfig.includes('process.env.NEXT_OUTPUT_STANDALONE === "1"'));
  assert.ok(dockerfile.includes("npm ci --no-audit --no-fund"));
  assert.ok(dockerfile.includes("npm ci --omit=dev --no-audit --no-fund"));
  assert.ok(dockerfile.includes("/app/.next ./.next"));
  assert.ok(dockerfile.includes('CMD ["npm", "run", "start"]'));
  assert.equal(JSON.parse(source("package.json")).scripts.start, "next start");
  assert.doesNotMatch(dockerfile, /server\.mjs|WebSocket/);
  assert.doesNotMatch(dockerfile, /NEXT_OUTPUT_STANDALONE=1|\.next\/standalone/);
  assert.ok(dockerfile.includes('ENV PORT=8080'));
  assert.ok(dockerfile.includes('ENV HOSTNAME=0.0.0.0'));
  assert.ok(dockerfile.includes("USER nextjs"));
  assert.doesNotMatch(dockerfile, /MONGODB_URI|GOOGLE_CLIENT_SECRET|AUTH_SECRET|RAZORPAY_KEY_SECRET/);
  assert.ok(dockerignore.includes(".env.*"));
  assert.ok(gcloudignore.includes(".env.*"));
  assert.ok(deploymentGuide.includes("MONGODB_DB_NAME=Canvas"));
  assert.ok(deploymentGuide.includes("MONGODB_DB_NAME=canvas_test"));
  assert.ok(deploymentGuide.includes("Secret Manager"));
  assert.ok(deploymentGuide.includes("/api/jobs/sweep"));
  assert.ok(cloudBuild.includes("gcloud"));
  assert.ok(cloudBuild.includes("$_NEXT_PUBLIC_APP_URL"));
});


test("admin company invoice repair avoids conflicting parent and child snapshot updates", () => {
  const billing = source("lib/billing.ts");
  const admin = source("lib/admin.ts");
  const start = billing.indexOf("async function createOrUpdateAccessInvoice");
  const end = billing.indexOf("\n/**", start);
  assert.ok(start >= 0 && end > start, "access invoice upsert helper exists");
  const helper = billing.slice(start, end);

  assert.ok(helper.includes("$setOnInsert"));
  assert.ok(helper.includes("...snapshots"));
  assert.doesNotMatch(helper, /companySnapshot\\.name/);
  assert.doesNotMatch(helper, /\\$set:\\s*\\{\\s*["']companySnapshot\\./);
  assert.ok(admin.includes("await ensureInvoicesForCapturedPayments(String(objectId))"));
  assert.ok(admin.includes("await requirePlatformAdmin()"));
});


test("Free plan bootstrap and 10,000-company smoke seeder stay environment-scoped", () => {
  const mongo = source("lib/mongodb.ts");
  const catalog = source("lib/plan-catalog.ts");
  const smokeSeeder = source("scripts/seed-canvas-scale-smoke.mjs");
  const packageJson = JSON.parse(source("package.json")) as { scripts: Record<string, string> };
  const envExample = source(".env.example");
  const envGuide = source(".env.example.md");

  assert.ok(mongo.includes("process.env.MONGODB_DB_NAME?.trim()"));
  assert.ok(mongo.includes('|| "Canvas"'));
  assert.ok(catalog.includes("async function ensureFreePlanSeeded()"));
  assert.ok(catalog.includes("Plan.collection.updateOne("));
  assert.ok(catalog.includes("FREE_PLAN_BOOTSTRAP_FAILED"));
  assert.ok(catalog.includes("await ensureFreePlanSeeded()"));
  assert.ok(smokeSeeder.includes('const EXPECTED_DATABASE = "canvas_test"'));
  assert.ok(smokeSeeder.includes("insertMissingPlanRows"));
  assert.ok(smokeSeeder.includes("$setOnInsert"));
  assert.ok(smokeSeeder.includes("Preserve custom plan edits"));
  assert.ok(smokeSeeder.includes('positiveIntEnv("SMOKE_COMPANY_COUNT", 10000, 10000)'));
  assert.ok(smokeSeeder.includes('positiveIntEnv("SMOKE_MEMBERS_PER_COMPANY", 50, 50)'));
  assert.ok(smokeSeeder.includes('databaseName.toLowerCase() !== EXPECTED_DATABASE'));
  assert.ok(smokeSeeder.includes('collection("memberships")'));
  assert.ok(smokeSeeder.includes('collection("subscriptions")'));
  assert.ok(smokeSeeder.includes("SMOKE_SEED_COUNT_MISMATCH"));
  assert.doesNotMatch(smokeSeeder, /\.drop\(|dropDatabase/);
  assert.equal(packageJson.scripts["seed:smoke"], "node --experimental-strip-types scripts/seed-canvas-scale-smoke.mjs");
  assert.ok(envExample.includes("MONGODB_DB_NAME=canvas_test"));
  assert.ok(envGuide.includes("npm run seed:smoke"));
  assert.ok(envGuide.includes("Do not run either seeder against production"));
});

test("runtime and scripts use the environment-selected Mongo database and bootstrap the Free plan", () => {
  const mongo = source("lib/mongodb.ts");
  const envHelper = source("scripts/lib/env.mjs");
  const envExample = source(".env.example");
  const planCatalog = source("lib/plan-catalog.ts");
  const companyRoute = source("app/api/company/route.ts");

  assert.ok(mongo.includes('process.env.MONGODB_DB_NAME?.trim() || "Canvas"'));
  assert.ok(envHelper.includes('process.env.MONGODB_DB_NAME?.trim() || "Canvas"'));
  assert.ok(envExample.includes("MONGODB_DB_NAME=canvas_test"));
  assert.ok(envExample.includes("new deployments default to the Canvas database name"));
  assert.ok(planCatalog.includes("Plan.collection.updateOne("));
  assert.ok(planCatalog.includes("FREE_PLAN_BOOTSTRAP_FAILED"));
  assert.ok(planCatalog.includes('throw new Error("FREE_PLAN_NOT_CONFIGURED")'));
  assert.ok(companyRoute.includes('getManagedPlan("free", { includeArchived: true })'));
});

test("Canvas is the product identity and AlgoQuit is the company and merchant identity", () => {
  const packageJson = JSON.parse(source("package.json"));
  const platform = source("lib/platform.ts");
  const metadata = source("app/layout.tsx");
  const settings = source("models/platform-settings.ts");
  const payment = source("models/payment.ts");
  const checkout = source("app/api/billing/checkout/route.ts");
  const cloudBuild = source("cloudbuild.yaml");
  const legal = source("lib/legal.ts");
  const migration = source("scripts/migrate-brand-data.mjs");

  assert.equal(packageJson.name, "canvas");
  assert.ok(platform.includes('process.env.NEXT_PUBLIC_APP_NAME?.trim() || "Canvas"'));
  assert.ok(platform.includes('process.env.NEXT_PUBLIC_COMPANY_NAME?.trim() || "AlgoQuit"'));
  assert.ok(metadata.includes("Canvas by AlgoQuit"));
  assert.ok(settings.includes('default: "https://algoquit.com"'));
  assert.ok(platform.includes('|| "https://algoquit.com"'));
  assert.ok(cloudBuild.includes("_NEXT_PUBLIC_COMPANY_URL: https://algoquit.com"));
  assert.ok(payment.includes('enum: ["ALGOQUIT"]'));
  assert.ok(checkout.includes('merchant: { ...PLATFORM_BRAND, name: PLATFORM_COMPANY_NAME }'));
  assert.ok(cloudBuild.includes("_NEXT_PUBLIC_APP_URL: https://canvas.algoquit.com"));
  assert.ok(migration.includes("MONGODB_DB_NAME_REQUIRED_FOR_BRAND_MIGRATION"));
  assert.ok(legal.includes('companyName: "AlgoQuit"'));
  assert.ok(legal.includes("registered legal entity name before launch"));
});


test("large directories use five-row cursor pages and keep refreshes data-only", () => {
  const pagination = source("lib/list-pagination.ts");
  const admin = source("lib/admin.ts");
  const adminUsers = source("components/admin-users.tsx");
  const adminAccess = source("components/admin-access.tsx");
  const adminCompanies = source("components/admin-companies.tsx");
  const employeeRoute = source("app/api/company/employees/route.ts");
  const workspace = source("components/workspace-dashboard.tsx");
  const taskDashboard = source("features/task-management/components/task-management-dashboard.tsx");
  const taskPagination = source("features/task-management/server/task-pagination.ts");
  const vault = source("app/api/vault/route.ts");
  const sidebar = source("components/workspace-sidebar.tsx");
  const profile = source("components/company-profile.tsx");

  assert.ok(pagination.includes("DEFAULT_LIST_PAGE_SIZE = 5"));
  assert.ok(admin.includes(".limit(safeLimit + 1)"));
  assert.ok(admin.includes("MAX_CANDIDATES_PER_REQUEST = 100"));
  assert.ok(admin.includes("customerId: { $in: candidates.map((user) => user._id) }"));
  assert.ok(admin.includes("nextCursor: hasMore"));
  assert.ok(adminUsers.includes("Load 5 more users"));
  assert.ok(adminAccess.includes("Load 5 more accounts"));
  assert.ok(adminCompanies.includes("Load 5 more companies"));
  assert.ok(employeeRoute.includes(".limit(limit + 1)"));
  assert.ok(employeeRoute.includes("nextCursor: hasMore"));
  const activeRequestsRoute = source("app/api/employee/requests/route.ts");
  assert.ok(activeRequestsRoute.includes('searchParams.get("paginated") === "true"'));
  assert.ok(activeRequestsRoute.includes("encodeHistoryCursor(last.requestedStartAt"));
  assert.ok(activeRequestsRoute.includes("limit + 1"));
  assert.ok(workspace.includes('api<EmployeePage>("/api/company/employees?limit=5")'));
  assert.ok(workspace.includes("Load 5 more members"));
  assert.ok(taskDashboard.includes('"/api/tasks?limit=5"'));
  assert.ok(taskDashboard.includes("Load 5 more tasks"));
  assert.ok(taskDashboard.includes('api<EmployeePage>("/api/company/employees?limit=5")'));
  assert.ok(taskDashboard.includes("Load 5 more employees"));
  assert.ok(taskDashboard.includes("void load(false)"));
  assert.ok(taskPagination.includes("TASK_PAGE_SIZE_DEFAULT = 5"));
  assert.ok(vault.includes("const PAGE_SIZE = 5"));
  assert.ok(sidebar.includes('aria-label="Workspace Tools"'));
  assert.ok(sidebar.includes('data-sidebar-key="meetings"'));
  assert.ok(sidebar.includes("labels.meetings"));
  assert.ok(sidebar.includes("taskCanvasEnabled &&"));
  assert.ok(profile.includes("taskCanvasEnabled={taskCanvasEnabled}"));
  assert.doesNotMatch(workspace, /window\.location\.reload\(/);
  assert.doesNotMatch(taskDashboard, /window\.location\.reload\(/);
});


test("admin company details reports tenant-scoped Task Canvas limits and compact storage metrics", () => {
  const admin = source("lib/admin.ts");
  const route = source("app/api/task-canvas/[canvasId]/route.ts");
  const model = source("models/task-canvas.ts");
  const view = source("components/admin-company-details.tsx");

  assert.ok(admin.includes("TaskCanvas.aggregate"));
  assert.ok(admin.includes('{ $match: { companyId } }'));
  assert.ok(admin.includes('$binarySize: "$sceneGzip"'));
  assert.ok(admin.includes('$bsonSize: "$$ROOT"'));
  assert.ok(admin.includes("TASK_CANVAS_ADMIN_ROWS_LIMIT = 100"));
  assert.ok(admin.includes("maxCollaboratorsPerCanvas"));
  assert.ok(route.includes("sceneRawBytes,"));
  assert.ok(route.includes("sceneStoredBytes: compressedScene.byteLength"));
  assert.ok(route.includes("sceneElementCount,"));
  assert.ok(route.includes("scenePointCount,"));
  assert.ok(model.includes("sceneElementCount: { type: Number"));
  assert.ok(model.includes("sceneStoredBytes: { type: Number"));
  assert.ok(view.includes("Company canvas usage and MongoDB storage"));
  assert.ok(view.includes("MongoDB document footprint"));
});

test("Task Canvas read, write and delete operations retain company and workspace isolation", () => {
  const route = source("app/api/task-canvas/[canvasId]/route.ts");
  const auth = source("lib/task-canvas-authorization.ts");

  assert.ok(route.includes("companyId: new Types.ObjectId(scope.companyId)"));
  assert.ok(route.includes("workspaceId: new Types.ObjectId(scope.workspaceId)"));
  assert.ok(route.includes("requireTaskCanvasScope()"));
  assert.ok(route.includes("canReadTaskCanvas(scope, canvas)"));
  assert.ok(route.includes("canManageTaskCanvas(scope, canvas)"));
  assert.ok(auth.includes('requireCompanyMember(["COMPANY_ADMIN", "EMPLOYEE", "PLATFORM_ADMIN"])'));
});


test("admin company details reports plan usage, Live Chat quotas, and company-scoped public logins", () => {
  const admin = source("lib/admin.ts");
  const user = source("models/user.ts");
  const callback = source("app/api/auth/google/callback/route.ts");
  const view = source("components/admin-company-details.tsx");

  assert.ok(admin.includes("TaskDailyUsage.findOne"));
  assert.ok(admin.includes("getTodayIso(workspace.timezone"));
  assert.ok(admin.includes("LiveChatMonthlyUsage.findOne"));
  assert.ok(admin.includes("LiveChatConversation.countDocuments"));
  assert.ok(admin.includes("LiveChatSettings.findOne"));
  assert.ok(admin.includes('cond: { $eq: ["$$login.companyId", companyId] }'));
  assert.ok(admin.includes("ADMIN_PUBLIC_LOGIN_ROWS_LIMIT = 100"));
  assert.ok(admin.includes("eligibleAgents: Math.min(liveChatEmployeeCount"));
  assert.ok(user.includes("publicCompanyLogins: { type: [publicCompanyLoginSchema], default: [] }"));
  assert.ok(user.includes('userSchema.index({ "publicCompanyLogins.companyId": 1 }'));
  assert.ok(callback.includes("recordPublicCompanyLogin"));
  assert.ok(callback.includes('"publicCompanyLogins.companyId": { $ne: companyId }'));
  assert.ok(callback.includes("Failed to record public company login"));
  assert.ok(view.includes("Company task usage and plan allowance"));
  assert.ok(view.includes("Customer sign-ins"));
  assert.ok(view.includes("Plan features and usage"));
  assert.ok(view.includes('<UserAvatar name={user.name} email={user.email} image={user.image} size={42}'));
});

test("public-page login telemetry updates existing user documents without creating a separate model", () => {
  const user = source("models/user.ts");
  const callback = source("app/api/auth/google/callback/route.ts");

  assert.doesNotMatch(user, /model\(["']PublicCompanyLogin/);
  assert.doesNotMatch(callback, /PublicCompanyLogin\.create|new PublicCompanyLogin/);
  assert.ok(callback.includes('$inc: { "publicCompanyLogins.$.loginCount": 1 }'));
  assert.ok(callback.includes('await createSession({'));
});
