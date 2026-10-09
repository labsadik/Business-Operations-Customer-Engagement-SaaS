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
  assert.match(routeLoading, /SidebarSkeleton/);
  assert.match(routeLoading, /MobileWorkspaceNavSkeleton/);
  assert.match(routeLoading, /export function WorkspaceLoading/);
  assert.match(routeLoading, /export function WorkspaceLoadError/);
  assert.match(routeEntry, /WorkspaceLoading/);
});

test("dashboard panels stay connected while company support tickets live outside the sidebar", async () => {
  const [dashboard, sidebar] = await Promise.all([
    read("components/workspace-dashboard.tsx"),
    read("components/workspace-sidebar.tsx")
  ]);

  for (const panel of ["meetings", "team", "settings", "billing", "feedback"]) {
    assert.match(dashboard, new RegExp("panel === \"" + panel + "\""));
    assert.match(sidebar, new RegExp("open\\(\"" + panel + "\"\\)"));
  }

  assert.doesNotMatch(sidebar, /open\("support-tickets"\)|Platform Support|External|Raise a ticket/);
  assert.match(dashboard, /openModal\("support-tickets", undefined, true\)/);
});

test("company profile failure state does not leave a sidebar-less endless skeleton", async () => {
  const profile = await read("components/company-profile.tsx");
  assert.match(profile, /CompanyProfileLoading/);
  assert.match(profile, /WorkspaceLoadError/);
  assert.match(profile, /loadFailed/);
});
