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
