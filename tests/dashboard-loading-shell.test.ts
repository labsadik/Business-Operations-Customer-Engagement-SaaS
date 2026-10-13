import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path: string) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("dashboard and route loading share the same workspace shell", async () => {
  const [dashboard, routeLoading, routeEntry] = await Promise.all([
    read("components/workspace-dashboard.tsx"),
    read("components/route-loading.tsx"),
    read("app/dashboard/loading.tsx")
  ]);

  assert.match(dashboard, /WorkspaceLoading/);
  assert.match(dashboard, /WorkspaceLoadError/);
  assert.match(dashboard, /onNavigateOverview=\{closeFeedbackModal\}/);
  assert.match(routeLoading, /SidebarSkeleton/);
  assert.match(routeLoading, /MobileWorkspaceNavSkeleton/);
  assert.match(routeLoading, /export function WorkspaceLoading/);
  assert.match(routeLoading, /export function WorkspaceLoadError/);
  assert.match(routeEntry, /WorkspaceLoading/);
});

test("workspace navigation opens page panels and keeps platform support tickets in the sidebar", async () => {
  const [dashboard, sidebar] = await Promise.all([
    read("components/workspace-dashboard.tsx"),
    read("components/workspace-sidebar.tsx")
  ]);

  for (const panel of ["meetings", "team", "settings", "billing", "feedback"]) {
    assert.ok(dashboard.includes(`panel === "${panel}"`));
    assert.ok(sidebar.includes(`open("${panel}")`));
  }

  assert.ok(sidebar.includes('open("support-tickets")'));
  assert.match(sidebar, /Support tickets/);
  assert.doesNotMatch(sidebar, /Platform Support|External|Raise a ticket/);
  assert.match(dashboard, /asPage/);
  const supportTicketSection = dashboard.slice(
    dashboard.indexOf("<WorkspaceSupportTickets"),
    dashboard.indexOf("/>", dashboard.indexOf("<WorkspaceSupportTickets")) + 2
  );
  assert.match(supportTicketSection, /asPage/);
});

test("company profile failure state does not leave a sidebar-less endless skeleton", async () => {
  const profile = await read("components/company-profile.tsx");
  assert.match(profile, /CompanyProfileLoading/);
  assert.match(profile, /WorkspaceLoadError/);
  assert.match(profile, /loadFailed/);
});


test("workspace and profile boot reads start immediately and use shared request deduplication", async () => {
  const [dashboard, profile, clientApi] = await Promise.all([
    read("components/workspace-dashboard.tsx"),
    read("components/company-profile.tsx"),
    read("lib/client-api.ts")
  ]);

  assert.match(dashboard, /const initialLoad = window\.setTimeout\(\(\) => void refreshAll\(\), 0\)/);
  assert.match(profile, /const initialLoad = window\.setTimeout\(\(\) => void load\(\), 0\)/);
  assert.match(dashboard, /clientApi<T>\(url, init\)/);
  assert.match(dashboard, /void refreshAll\(\)/);
  assert.match(profile, /void load\(\)/);
  assert.match(clientApi, /pendingApiReads/);
});


test("Live Chat remains in the shared sidebar across workspace routes", async () => {
  const [taskPage, taskDashboard, vaultPage, vault, profile] = await Promise.all([
    read("app/dashboard/tasks/page.tsx"),
    read("features/task-management/components/task-management-dashboard.tsx"),
    read("app/dashboard/vault/page.tsx"),
    read("components/company-vault.tsx"),
    read("components/company-profile.tsx")
  ]);

  assert.match(taskPage, /liveChatEnabled=\{Boolean\(plan\.liveChatEnabled\)\}/);
  assert.match(taskDashboard, /liveChatEnabled=\{liveChatEnabled\}/);
  assert.match(vaultPage, /liveChatEnabled=\{Boolean\(entitlements\.liveChatEnabled\)\}/);
  assert.match(vault, /liveChatEnabled=\{liveChatEnabled\}/);
  assert.match(profile, /setLiveChatEnabled\(Boolean\(data\.currentPlan\?\.liveChatEnabled\)\)/);
  assert.match(profile, /liveChatEnabled=\{liveChatEnabled\}/);
});


test("every company workspace feature route has its own loading fallback", async () => {
  const paths = [
    ["app/dashboard/tasks/loading.tsx", /WorkspaceSectionLoading section="tasks"/],
    ["app/dashboard/task-canvas/loading.tsx", /WorkspaceSectionLoading section="task-canvas"/],
    ["app/dashboard/vault/loading.tsx", /WorkspaceSectionLoading section="vault"/],
    ["app/dashboard/live-chat/loading.tsx", /WorkspaceSectionLoading section="live-chat"/],
    ["app/dashboard/company-profile/loading.tsx", /CompanyProfileLoading/]
  ] as const;
  const [routeLoading, ...entries] = await Promise.all([
    read("components/route-loading.tsx"),
    ...paths.map(([path]) => read(path))
  ]);
  assert.match(routeLoading, /export function WorkspaceSectionLoading/);
  for (const [index, [, expected]] of paths.entries()) {
    assert.match(entries[index], expected);
  }
});

test("company workspace long lists load five records at a time with explicit progress feedback", async () => {
  const paths = [
    "app/api/task-canvas/route.ts",
    "features/task-canvas/components/task-canvas-dashboard.tsx",
    "app/api/live-chat/route.ts",
    "app/api/live-chat/conversations/[conversationId]/messages/route.ts",
    "components/live-chat-dashboard.tsx",
    "app/api/company/announcement/route.ts",
    "app/api/company/invitations/route.ts",
    "app/api/billing/invoices/route.ts",
    "components/workspace-dashboard.tsx",
    "app/dashboard/vault/page.tsx",
    "app/api/company/support-tickets/route.ts",
    "components/workspace-support-tickets.tsx",
    "app/api/company/feedback/route.ts",
    "components/workspace-feedback.tsx"
  ];
  const [canvasApi, canvasUi, chatApi, messagesApi, chatUi, announcements, invitations, invoices, workspace, vaultPage, supportApi, supportUi, feedbackApi, feedbackUi] = await Promise.all(paths.map(read));
  assert.match(canvasApi, /parseListLimit/);
  assert.match(canvasApi, /nextCursor: hasMoreCanvases/);
  assert.match(canvasUi, /Load 5 more canvases/);
  assert.match(canvasUi, /Load 5 more members/);
  assert.match(chatApi, /nextCursor:/);
  assert.match(chatApi, /\.limit\(limit \+ 1\)/);
  assert.match(messagesApi, /nextCursor:/);
  assert.match(chatUi, /Load 5 more conversations/);
  assert.match(chatUi, /Load 5 older messages/);
  assert.match(announcements, /encodeListCursor/);
  assert.match(invitations, /encodeListCursor/);
  assert.match(invoices, /encodeListCursor/);
  assert.match(workspace, /Load 5 more announcements/);
  assert.match(workspace, /Load 5 more invitations/);
  assert.match(workspace, /Load 5 more invoices/);
  assert.match(vaultPage, /const PAGE_SIZE = 5/);
  assert.match(supportApi, /\.limit\(limit \+ 1\)/);
  assert.match(supportUi, /limit=5/);
  assert.match(supportUi, /Load 5 more tickets/);
  assert.match(feedbackApi, /customerHasNext/);
  assert.match(feedbackApi, /companyHasNext/);
  assert.match(feedbackUi, /Load 5 more reviews/);
  assert.match(feedbackUi, /Load 5 more feedback items/);
});
