import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  validateCanvasMembers,
  validateCanvasVersion,
  validateTaskCanvasName,
  validateTaskCanvasScene
} from "../features/task-canvas/shared/validation.ts";

test("canvas names are trimmed and bounded", () => {
  assert.equal(validateTaskCanvasName("  Architecture  "), "Architecture");
  assert.throws(() => validateTaskCanvasName(""), /CANVAS_NAME_INVALID/);
  assert.throws(() => validateTaskCanvasName("x".repeat(81)), /CANVAS_NAME_INVALID/);
  assert.throws(() => validateTaskCanvasName(23), /CANVAS_NAME_INVALID/);
});

test("canvas scenes require bounded elements and plain app/file maps", () => {
  const valid = { elements: [{ id: "shape-a", type: "rectangle" }], appState: { gridSize: 20 }, files: {} };
  assert.deepEqual(validateTaskCanvasScene(valid), valid);
  assert.throws(() => validateTaskCanvasScene(null), /CANVAS_SCENE_INVALID/);
  assert.throws(() => validateTaskCanvasScene({ elements: {}, appState: {}, files: {} }), /CANVAS_SCENE_INVALID/);
  assert.throws(() => validateTaskCanvasScene({ elements: [], appState: [], files: {} }), /CANVAS_SCENE_INVALID/);
  assert.throws(() => validateTaskCanvasScene({ elements: [], appState: {}, files: [] }), /CANVAS_SCENE_INVALID/);
  assert.throws(() => validateTaskCanvasScene({
    elements: [],
    appState: { memo: "x".repeat(2_000_001) },
    files: {}
  }), /CANVAS_SCENE_TOO_LARGE/);
  assert.throws(() => validateTaskCanvasScene({
    elements: Array.from({ length: 5001 }, (_, id) => ({ id })),
    appState: {},
    files: {}
  }), /CANVAS_SCENE_INVALID/);
});

test("optimistic versions and member lists are validated and de-duplicated", () => {
  assert.equal(validateCanvasVersion(4), 4);
  assert.throws(() => validateCanvasVersion(0), /CANVAS_VERSION_INVALID/);
  assert.throws(() => validateCanvasVersion("2"), /CANVAS_VERSION_INVALID/);
  assert.deepEqual(validateCanvasMembers(["user-a", "user-b", "user-a"]), ["user-a", "user-b"]);
  assert.throws(() => validateCanvasMembers("user-a"), /CANVAS_MEMBERS_INVALID/);
  assert.throws(() => validateCanvasMembers(["user-a", 4]), /CANVAS_MEMBERS_INVALID/);
});


test("Task Canvas editor avoids the Excalidraw onChange state feedback loop", async () => {
  const component = await readFile(
    new URL("../features/task-canvas/components/task-canvas-dashboard.tsx", import.meta.url),
    "utf8"
  );
  const scheduleStart = component.indexOf("const scheduleSave = useCallback");
  const scheduleEnd = component.indexOf("const handleExcalidrawAPI", scheduleStart);
  assert.ok(scheduleStart >= 0 && scheduleEnd > scheduleStart);

  const scheduleSave = component.slice(scheduleStart, scheduleEnd);
  const immediateSchedule = scheduleSave.slice(0, scheduleSave.indexOf("timerRef.current = setTimeout"));
  assert.doesNotMatch(immediateSchedule, /setScene\(next\)/);
  assert.doesNotMatch(immediateSchedule, /setSaveState\(/);
  assert.match(scheduleSave, /setTimeout/);
  assert.match(component, /excalidrawAPI=\{handleExcalidrawAPI\}/);
  assert.match(component, /onChange=\{handleEditorChange\}/);
});

test("Task Canvas uses a crosshair cursor only for the selection tool", async () => {
  const component = await readFile(
    new URL("../features/task-canvas/components/task-canvas-dashboard.tsx", import.meta.url),
    "utf8"
  );
  assert.match(component, /activeTool\?\.type === "selection"/);
  assert.match(component, /setCursor\?\.\("crosshair"\)/);
  assert.match(component, /onMouseLeave=\{handleCanvasMouseLeave\}/);
});


test("Task Canvas list, scene and history queries are scoped to both company and workspace", async () => {
  const [listRoute, canvasRoute, historyRoute, auth] = await Promise.all([
    readFile(new URL("../app/api/task-canvas/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/task-canvas/[canvasId]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/task-canvas/[canvasId]/history/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/task-canvas-authorization.ts", import.meta.url), "utf8")
  ]);

  assert.match(listRoute, /TaskCanvas\.find\(\{ companyId, workspaceId/);
  assert.match(listRoute, /companyId, workspaceId, active: true/);
  assert.match(listRoute, /companyId,\s*workspaceId,\s*name,/);
  assert.match(canvasRoute, /companyId: new Types\.ObjectId\(scope\.companyId\)/);
  assert.match(canvasRoute, /workspaceId: new Types\.ObjectId\(scope\.workspaceId\)/);
  assert.match(historyRoute, /canvasId: canvas\.\_id,[\s\S]*?companyId: filter\.companyId,[\s\S]*?workspaceId: filter\.workspaceId/);
  assert.match(auth, /const companyId = session\.companyId/);
  assert.match(auth, /const workspaceId = session\.workspaceId/);
  assert.match(auth, /String\(canvas\.createdByUserId\) === userId/);
});

test("history preview, rename and delete operations keep revision IDs tenant scoped", async () => {
  const historyRoute = await readFile(
    new URL("../app/api/task-canvas/[canvasId]/history/route.ts", import.meta.url),
    "utf8"
  );
  assert.match(historyRoute, /searchParams\.get\("revisionId"\)/);
  assert.match(historyRoute, /findOneAndUpdate\([\s\S]*?canvasId: canvas\.\_id,[\s\S]*?companyId: filter\.companyId,[\s\S]*?workspaceId: filter\.workspaceId/);
  assert.match(historyRoute, /deleteOne\([\s\S]*?canvasId: canvas\.\_id,[\s\S]*?companyId: filter\.companyId,[\s\S]*?workspaceId: filter\.workspaceId/);
});

test("Task Canvas keeps the canvas unselected on first load and uses in-app confirmation", async () => {
  const component = await readFile(
    new URL("../features/task-canvas/components/task-canvas-dashboard.tsx", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(component, /if \(!selectedIdRef\.current && data\.items\.length\) void openCanvas/);
  assert.doesNotMatch(component, /window\.confirm\(/);
  assert.match(component, /canvasRailOpen/);
  assert.match(component, /overflow-y-auto overscroll-contain/);
});


test("large embedded images are compressed client-side before bounded scene writes", async () => {
  const [component, validation] = await Promise.all([
    readFile(new URL("../features/task-canvas/components/task-canvas-dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/task-canvas/shared/validation.ts", import.meta.url), "utf8")
  ]);
  assert.match(component, /compressSceneImages\(nextScene\)/);
  assert.match(component, /createImageBitmap\(source\)/);
  assert.match(component, /canvas\.toBlob\(resolve, "image\/webp", 0\.78\)/);
  assert.match(component, /code === "CANVAS_SCENE_TOO_LARGE" \? ""/);
  assert.match(validation, /TASK_CANVAS_SCENE_MAX_BYTES = 2_000_000/);
});


test("Task Canvas history retention is company-wide and safely prunes legacy per-canvas overages", async () => {
  const [historyHelper, revisionModel, listRoute, canvasRoute, historyRoute, adminPlans, dashboard] = await Promise.all([
    readFile(new URL("../lib/task-canvas-history.ts", import.meta.url), "utf8"),
    readFile(new URL("../models/task-canvas-revision.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/task-canvas/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/task-canvas/[canvasId]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/task-canvas/[canvasId]/history/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/admin-plans.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/task-canvas/components/task-canvas-dashboard.tsx", import.meta.url), "utf8")
  ]);

  assert.match(historyHelper, /TaskCanvasRevision\.find\(\{ companyId: tenantId \}\)/);
  assert.match(historyHelper, /\.limit\(safeLimit\)/);
  assert.match(historyHelper, /const oldestKept = keep\[keep\.length - 1\]/);
  assert.match(historyHelper, /createdAt: \{ \$lt: oldestKept\.createdAt \}/);
  assert.match(historyHelper, /_id: \{ \$lt: oldestKept\._id \}/);
  assert.match(revisionModel, /index\(\{ companyId: 1, createdAt: -1, _id: -1 \}\)/);
  assert.match(listRoute, /pruneCompanyTaskCanvasHistory\(companyId, scope\.historyLimit\)/);
  assert.match(listRoute, /TaskCanvasRevision\.countDocuments\(\{ companyId \}\)/);
  assert.match(historyRoute, /historyUsed/);
  assert.match(canvasRoute, /pruneCompanyTaskCanvasHistory\(filter\.companyId, scope\.historyLimit\)/);
  assert.doesNotMatch(canvasRoute, /\bnew:\s*true\b/);
  assert.doesNotMatch(historyRoute, /\bnew:\s*true\b/);
  assert.match(canvasRoute, /returnDocument: "after"/);
  assert.match(historyRoute, /returnDocument: "after"/);
  assert.match(adminPlans, /Saved history versions per company/);
  assert.match(dashboard, /Company-wide history/);
});

test("Task Canvas collaborator profiles render Google avatars and legacy member duplicates are hidden", async () => {
  const [dashboard, listRoute, canvasRoute] = await Promise.all([
    readFile(new URL("../features/task-canvas/components/task-canvas-dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/task-canvas/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/task-canvas/[canvasId]/route.ts", import.meta.url), "utf8")
  ]);

  assert.match(dashboard, /<UserAvatar name=\{person\.name\} email=\{person\.email\} image=\{person\.image\}/);
  assert.match(listRoute, /\[\.\.\.new Set\(\(canvas\.memberUserIds \?\? \[\]\)\.map\(String\)\)\]/);
  assert.match(canvasRoute, /\[\.\.\.new Set\(\(canvas\.memberUserIds \?\? \[\]\)\.map\(String\)\)\]/);
});
