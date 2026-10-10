import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

test("Live Chat is disabled by default and its limits are included in admin-managed plan entitlements", () => {
  const schema = source("models/plan.ts");
  const rules = source("lib/plan-rules.ts");
  const catalog = source("lib/plan-catalog.ts");
  const adminCreate = source("app/api/admin/plans/route.ts");
  const adminUpdate = source("app/api/admin/plans/[identifier]/route.ts");
  const planUi = source("components/admin-plans.tsx");
  const entitlementService = source("lib/plans-server.ts");

  assert.match(schema, /liveChatEnabled:[\s\S]*default: false/);
  assert.match(rules, /liveChatMessageCooldownSeconds[\s\S]*15, 600/);
  assert.match(rules, /liveChatRetentionDays[\s\S]*1, 3650/);
  assert.match(catalog, /liveChatMonthlyLimit/);
  assert.match(adminCreate, /liveChatEnabled: draft\.liveChatEnabled/);
  assert.match(adminUpdate, /liveChatEnabled: draft\.liveChatEnabled/);
  assert.match(adminUpdate, /"liveChatEnabled"/);
  assert.match(planUi, /Live Chat widget & customer conversations/);
  assert.match(planUi, /Allow formatted PDF chat exports/);
  assert.match(planUi, /Allow company members to delete chats/);
  assert.match(entitlementService, /liveChatEnabled: Boolean\(currentPlan\.liveChatEnabled\)/);
});

test("every authenticated Live Chat query and mutation scopes records to the session company and workspace", () => {
  const scope = source("lib/live-chat.ts");
  const inbox = source("app/api/live-chat/route.ts");
  const settings = source("app/api/live-chat/settings/route.ts");
  const messages = source("app/api/live-chat/conversations/[conversationId]/messages/route.ts");
  const deletion = source("app/api/live-chat/conversations/[conversationId]/route.ts");
  const exportRoute = source("app/api/live-chat/conversations/[conversationId]/export/route.ts");

  assert.match(scope, /requireCompanyMember\(\)/);
  assert.match(scope, /liveChatEnabled/);
  assert.match(inbox, /companyId:[\s\S]*workspaceId:/);
  assert.match(messages, /companyId:[\s\S]*workspaceId:/);
  assert.match(deletion, /companyId:[\s\S]*workspaceId:/);
  assert.match(exportRoute, /companyId:[\s\S]*workspaceId:/);
  assert.match(settings, /scope\.session\.role !== "COMPANY_ADMIN"/);
});

test("public chat checks company domain allowlists, hashes visitor identity, and keeps spam cooldown on the server", () => {
  const validation = source("features/live-chat/shared/validation.ts");
  const context = source("lib/live-chat.ts");
  const create = source("app/api/public/live-chat/[companySlug]/conversations/route.ts");
  const messages = source("app/api/public/live-chat/[companySlug]/conversations/[conversationId]/messages/route.ts");
  const widget = source("components/live-chat-widget.tsx");
  const loader = source("public/live-chat.js");

  assert.match(validation, /isAllowedOrigin/);
  assert.match(validation, /LIVE_CHAT_MESSAGE_INVALID/);
  assert.match(context, /visitorHash/);
  assert.match(context, /LIVE_CHAT_ORIGIN_NOT_ALLOWED/);
  assert.match(create, /LiveChatMonthlyUsage/);
  assert.match(create, /LiveChatMonthlyCustomer/);
  assert.match(messages, /findOneAndUpdate/);
  assert.match(messages, /nextCustomerMessageAt/);
  assert.match(messages, /LIVE_CHAT_MESSAGE_COOLDOWN/);
  assert.match(widget, /localStorage/);
  assert.match(widget, /cooldownSeconds/);
  assert.match(loader, /event\.source !== frame\.contentWindow/);
  assert.match(loader, /event\.origin !== scriptUrl\.origin/);
});

test("chat retention removes expired conversations and customer messages in a bounded authenticated job", () => {
  const conversation = source("models/live-chat-conversation.ts");
  const message = source("models/live-chat-message.ts");
  const usage = source("models/live-chat-monthly-usage.ts");
  const customerUsage = source("models/live-chat-monthly-customer.ts");
  const job = source("app/api/jobs/live-chat-retention/route.ts");
  const config = source("vercel.json");
  const docs = source("docs/LIVE_CHAT.md");

  assert.match(conversation, /index\(\{ expiresAt: 1 \}, \{ expireAfterSeconds: 0 \}\)/);
  assert.match(message, /index\(\{ expiresAt: 1 \}, \{ expireAfterSeconds: 0 \}\)/);
  assert.match(usage, /unique: true/);
  assert.match(customerUsage, /unique: true/);
  assert.match(job, /RETENTION_BATCH_LIMIT/);
  assert.match(job, /authorization/i);
  assert.match(job, /LiveChatMessage\.deleteMany/);
  assert.match(job, /LiveChatConversation\.deleteMany/);
  assert.match(config, /\/api\/jobs\/live-chat-retention/);
  assert.match(docs, /backup\/PITR retention/);
});

test("chat export, workspace settings, and platform usage routes are available without exposing transcripts to platform analytics", () => {
  const dashboard = source("components/live-chat-dashboard.tsx");
  const exportRoute = source("app/api/live-chat/conversations/[conversationId]/export/route.ts");
  const adminUsage = source("app/api/admin/live-chat/usage/route.ts");
  const adminUi = source("components/admin-live-chat-usage.tsx");
  const workspacePage = source("app/dashboard/live-chat/page.tsx");
  const adminPage = source("app/admin/live-chat/page.tsx");
  const config = source("next.config.ts");

  assert.match(dashboard, /Allowed website domains/);
  assert.match(dashboard, /Require email/);
  assert.match(dashboard, /Anonymous visitor/);
  assert.match(dashboard, /exportConversation/);
  assert.match(exportRoute, /application\/pdf/);
  assert.match(exportRoute, /liveChatPdfExportEnabled/);
  assert.match(adminUsage, /requirePlatformAdmin/);
  assert.match(adminUsage, /uniqueCustomers/);
  assert.doesNotMatch(adminUsage, /LiveChatMessage|customerEmail|customerPhone|\.body/);
  assert.match(adminUi, /Company usage and plan configuration/);
  assert.match(workspacePage, /getCompanyEntitlements/);
  assert.match(adminPage, /AdminLiveChatUsage/);
  assert.match(config, /source: "\/embed\/live-chat\/:companySlug"/);
});


test("enterprise Live Chat exposes visitor telemetry, agent identity, status filters, and a persistent workspace sidebar", () => {
  const conversation = source("models/live-chat-conversation.ts");
  const messageApi = source("app/api/public/live-chat/[companySlug]/conversations/[conversationId]/messages/route.ts");
  const agentApi = source("app/api/live-chat/conversations/[conversationId]/messages/route.ts");
  const createApi = source("app/api/public/live-chat/[companySlug]/conversations/route.ts");
  const dashboard = source("components/live-chat-dashboard.tsx");
  const widget = source("components/live-chat-widget.tsx");
  const settings = source("models/live-chat-settings.ts");
  const settingsApi = source("app/api/public/live-chat/[companySlug]/route.ts");
  const monthlyCustomer = source("models/live-chat-monthly-customer.ts");

  for (const field of ["geoCountry", "geoCity", "geoRegion", "ipDisplay", "browser", "os", "deviceType", "referrer", "assignedAgentId"]) {
    assert.match(conversation, new RegExp(field));
  }
  assert.match(createApi, /cf-ipcountry/);
  assert.match(createApi, /Visitor #/);
  assert.match(messageApi, /senderAvatar/);
  assert.match(messageApi, /senderName/);
  assert.match(agentApi, /senderUserId/);
  assert.match(dashboard, /useWorkspaceSidebarState/);
  assert.match(dashboard, /WorkspaceSidebar/);
  assert.match(dashboard, /UNASSIGNED/);
  assert.match(dashboard, /userDetailsOpen/);
  assert.match(dashboard, /optimistic/);
  assert.match(widget, /senderAvatar/);
  assert.match(widget, /Chatting with/);
  assert.match(widget, /document\.hidden/);
  assert.match(settings, /offlineMode/);
  assert.match(settingsApi, /no-store/);
  assert.doesNotMatch(monthlyCustomer, /expiresAt: \{ type: Date, required: true, index: true \}/);
});


test("public Live Chat appearance options have validated defaults and are persisted through settings APIs", () => {
  const schema = source("models/live-chat-settings.ts");
  const validation = source("features/live-chat/shared/validation.ts");
  const settingsApi = source("app/api/live-chat/settings/route.ts");
  const publicApi = source("app/api/public/live-chat/[companySlug]/route.ts");
  const dashboard = source("components/live-chat-dashboard.tsx");
  const widget = source("components/live-chat-widget.tsx");
  const embed = source("public/live-chat.js");

  assert.match(schema, /launcherSize:[\\s\\S]*min: 52, max: 80, default: 60/);
  assert.match(schema, /launcherIconSize:[\\s\\S]*min: 16, max: 40, default: 28/);
  assert.match(schema, /launcherShape:[\\s\\S]*enum: \\["CIRCLE", "ROUNDED"\\]/);
  assert.match(schema, /headerStyle:[\\s\\S]*enum: \\["SOLID", "GRADIENT", "MINIMAL"\\]/);
  assert.match(validation, /numeric\\("launcherSize", 60, 52, 80\\)/);
  assert.match(validation, /numeric\\("launcherIconSize", 28, 16, 40\\)/);
  assert.match(validation, /LIVE_CHAT_SETTINGS_INVALID/);
  assert.match(settingsApi, /launcherSize: updated\\?\\.launcherSize \\?\\? 60/);
  assert.match(publicApi, /launcherIconSize: context\\.settings\\.launcherIconSize \\?\\? 28/);
  assert.match(dashboard, /Desktop preview/);
  assert.match(dashboard, /Mobile preview/);
  assert.match(dashboard, /Unsaved changes/);
  assert.match(dashboard, /Restore defaults/);
  assert.match(widget, /launcherShape/);
  assert.match(widget, /headerBackgroundStyle/);
  assert.match(embed, /lastResizeData/);
  assert.match(embed, /launcherFrameSize/);
});
