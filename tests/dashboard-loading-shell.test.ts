import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path: string) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("dashboard and route loading share the same workspace shell", async () => {
  const [dashboard, routeLoading] = await Promise.all([
    read("components/workspace-dashboard.tsx"),
    read("components/route-loading.tsx")
  ]);

  assert.match(dashboard, /WorkspaceLoading/);
  assert.match(dashboard, /WorkspaceLoadError/);
  assert.match(routeLoading, /SidebarSkeleton/);
  assert.match(routeLoading, /MobileWorkspaceNavSkeleton/);
  assert.match(routeLoading, /export function WorkspaceLoading/);
  assert.match(routeLoading, /export function WorkspaceLoadError/);
});

test("dashboard recognizes every panel supported by the sidebar", async () => {
  const [dashboard, sidebar] = await Promise.all([
    read("components/workspace-dashboard.tsx"),
    read("components/workspace-sidebar.tsx")
  ]);

  for (const panel of ["meetings", "team", "settings", "billing", "feedback", "support-tickets"]) {
    assert.match(dashboard, new RegExp("panel === \"" + panel + "\""));
    assert.match(sidebar, new RegExp("open\\(\"" + panel + "\"\\)"));
  }
});

test("company profile failure state does not leave a sidebar-less endless skeleton", async () => {
  const profile = await read("components/company-profile.tsx");
  assert.match(profile, /CompanyProfileLoading/);
  assert.match(profile, /WorkspaceLoadError/);
  assert.match(profile, /loadFailed/);
});
