import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  normalizeTaskCanvasScene,
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
  // A 2 MB text/vector scene is valid: plan history limits count canvases,
  // not the complexity/size of a diagram inside a canvas.
  const multiMegabyteVectorText = validateTaskCanvasScene({
    elements: [],
    appState: { memo: "x".repeat(2_000_001) },
    files: {}
  });
  assert.equal((multiMegabyteVectorText.appState.memo as string).length, 2_000_001);

  const largeDiagram = validateTaskCanvasScene({
    elements: Array.from({ length: 6000 }, (_, id) => ({ id: "node-" + id, type: "rectangle" })),
    appState: {},
    files: {}
  });
  assert.equal(largeDiagram.elements.length, 6000);

  // A workspace canvas has no arbitrary 100-file plan quota; byte ceilings
  // remain the safety guard for very large serialized scenes.
  const manyFiles = Object.fromEntries(
    Array.from({ length: 101 }, (_, index) => ["file-" + index, { id: "file-" + index }])
  );
  const canvasWithManyFiles = validateTaskCanvasScene({ elements: [], appState: {}, files: manyFiles });
  assert.equal(Object.keys(canvasWithManyFiles.files).length, 101);
});

test("scene normalization repairs null SVG/canvas tuple data and isolates corrupt elements", () => {
  const normalized = normalizeTaskCanvasScene({
    elements: [
      { id: "image-a", type: "image", x: 5, y: 7, width: 100, height: 50, fileId: "file-a", scale: null },
      { id: "arrow-a", type: "arrow", points: null, width: 40, height: 25 },
      { id: "stroke-bad", type: "freedraw", points: null },
      { id: "stroke-good", type: "freedraw", points: [[0, 0], [12, 18], [null, 3]] },
      null,
      { id: "future-element", type: "unsupported-type" }
    ],
    appState: { viewBackgroundColor: null, currentItemFontFamily: null, theme: null, gridSize: null },
    files: { "file-bad": null, "file-good": { id: "file-good", dataURL: "data:image/svg+xml,%3Csvg/%3E" } }
  });

  assert.deepEqual((normalized.elements[0] as { scale: unknown }).scale, [1, 1]);
  assert.deepEqual((normalized.elements[1] as { points: unknown }).points, [[0, 0], [40, 25]]);
  assert.deepEqual((normalized.elements[2] as { points: unknown }).points, [[0, 0], [12, 18]]);
  assert.deepEqual(Object.keys(normalized.files), ["file-good"]);
  assert.equal(normalized.appState.viewBackgroundColor, "#faf9f1");
  assert.equal("theme" in normalized.appState, false);
  assert.equal("currentItemFontFamily" in normalized.appState, false);
  assert.equal(normalized.elements.length, 3);
});

test("save validation rejects null image scales and null linear points", () => {
  assert.throws(() => validateTaskCanvasScene({
    elements: [{ id: "image-a", type: "image", scale: null }],
    appState: {},
    files: {}
  }), /CANVAS_SCENE_INVALID/);
  assert.throws(() => validateTaskCanvasScene({
    elements: [{ id: "arrow-a", type: "arrow", points: null }],
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


test("Task Canvas list, scene, rename and delete queries are scoped to company and workspace", async () => {
  const [listRoute, canvasRoute, auth] = await Promise.all([
    readFile(new URL("../app/api/task-canvas/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/task-canvas/[canvasId]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/task-canvas-authorization.ts", import.meta.url), "utf8")
  ]);

  assert.match(listRoute, /const canvasFilter = \{\s*companyId,\s*workspaceId,\s*\.\.\.memberFilter/);
  assert.match(listRoute, /TaskCanvas\.find\(canvasFilter\)/);
  assert.match(listRoute, /\.limit\(limit \+ 1\)/);
  assert.match(listRoute, /nextCursor: hasMoreCanvases/);
  assert.match(listRoute, /companyId,\s*workspaceId,\s*active: true/);
  assert.match(listRoute, /companyId,\s*workspaceId,\s*name,/);
  assert.match(canvasRoute, /companyId: new Types\.ObjectId\(scope\.companyId\)/);
  assert.match(canvasRoute, /workspaceId: new Types\.ObjectId\(scope\.workspaceId\)/);
  assert.match(canvasRoute, /TaskCanvas\.findOneAndUpdate\(\s*filter/);
  assert.match(canvasRoute, /TaskCanvas\.deleteOne\(filter\)/);
  assert.match(canvasRoute, /releaseTaskCanvasSlot\(scope\.companyId\)/);
  assert.match(auth, /const companyId = session\.companyId/);
  assert.match(auth, /const workspaceId = session\.workspaceId/);
  assert.match(auth, /String\(canvas\.createdByUserId\) === userId/);
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
  assert.match(component, /setError\(errorText\(code\)\)/);
  assert.match(validation, /TASK_CANVAS_SCENE_MAX_BYTES = 32_000_000/);
});


test("Task Canvas creation is limited company-wide while collaborators remain limited per canvas", async () => {
  const [companyModel, canvasModel, listRoute, canvasRoute, adminPlans, dashboard, authorization, page, sidebar] = await Promise.all([
    readFile(new URL("../models/company.ts", import.meta.url), "utf8"),
    readFile(new URL("../models/task-canvas.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/task-canvas/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/task-canvas/[canvasId]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/admin-plans.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/task-canvas/components/task-canvas-dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/task-canvas-authorization.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/dashboard/task-canvas/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/workspace-sidebar.tsx", import.meta.url), "utf8")
  ]);

  assert.match(companyModel, /taskCanvasCount/);
  assert.match(canvasModel, /companyId:[\s\S]*workspaceId:/);
  assert.match(authorization, /reserveTaskCanvasSlot\(companyId: string, limit: number\)/);
  assert.match(authorization, /taskCanvasCount: \{ \$lt: limit \}/);
  assert.match(authorization, /canvasLimit: Math\.min\(100, Math\.max\(1, plan\.taskCanvasHistoryLimit \?\? 10\)\)/);
  assert.match(listRoute, /reserveTaskCanvasSlot\(scope\.companyId, scope\.canvasLimit\)/);
  assert.match(listRoute, /getCompanyTaskCanvasCount\(scope\.companyId\)/);
  assert.match(canvasRoute, /releaseTaskCanvasSlot\(scope\.companyId\)/);
  assert.match(adminPlans, /Canvases per company/);
  assert.match(adminPlans, /canvas creation allowance is shared across every employee and workspace/);
  assert.match(dashboard, /Company canvas allowance/);
  assert.match(dashboard, /limits\.canvasesUsed >= limits\.canvasLimit/);
  assert.doesNotMatch(dashboard, /historyLimit|historyUsed|setHistory|checkpoint\(/);
  assert.doesNotMatch(listRoute, /TaskCanvasRevision|pruneCompanyTaskCanvasHistory/);
  assert.doesNotMatch(canvasRoute, /TaskCanvasRevision|pruneCompanyTaskCanvasHistory|checkpoint/);
  assert.match(page, /canvasLimit=\{canvasLimit\}/);
  assert.match(sidebar, /aria-label="Workspace Tools"/);
  assert.match(sidebar, /data-sidebar-key="meetings"/);
  assert.match(dashboard, /taskManagementEnabled=\{taskManagementEnabled\}/);
  assert.match(dashboard, /vaultEnabled=\{vaultEnabled\}/);
  assert.match(dashboard, /liveChatEnabled=\{liveChatEnabled\}/);
  assert.match(dashboard, /showWelcomeScreen: false/);
  assert.match(dashboard, /min-h-0 flex-1 w-full bg-white flex flex-col/);
});

test("Task Canvas compressed persistence and list APIs keep large scene blobs off metadata reads", async () => {
  const [model, canvasRoute, listRoute, dashboard] = await Promise.all([
    readFile(new URL("../models/task-canvas.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/task-canvas/[canvasId]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/task-canvas/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../features/task-canvas/components/task-canvas-dashboard.tsx", import.meta.url), "utf8")
  ]);

  assert.match(model, /sceneGzip: \{ type: Buffer, required: false \}/);
  assert.match(canvasRoute, /sceneGzip: compressedScene/);
  assert.match(canvasRoute, /\$unset: \{ scene: "" \}/);
  assert.match(canvasRoute, /\.select\("version createdByUserId memberUserIds"\)/);
  assert.match(canvasRoute, /query\.select\("name version createdByUserId memberUserIds updatedAt lastEditorUserId"\)/);
  assert.match(canvasRoute, /scene: readCanvasScene\(canvas\)/);
  assert.match(canvasRoute, /gunzipSync/);
  assert.match(canvasRoute, /gzipSync/);
  assert.match(listRoute, /\.select\("name version createdByUserId memberUserIds updatedAt"\)/);
  assert.match(dashboard, /await encodeSceneForTransport\(saveScene\)/);
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

test("Task Canvas hides Excalidraw branding links and extra tools without changing the default drawing style", async () => {
  const [dashboard, styles] = await Promise.all([
    readFile(new URL("../features/task-canvas/components/task-canvas-dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8")
  ]);

  assert.match(dashboard, /const TaskCanvasMainMenu = dynamic/);
  assert.doesNotMatch(dashboard, /MainMenu\.DefaultItems\.LoadScene/);
  assert.match(dashboard, /MainMenu\.DefaultItems\.Export/);
  assert.match(dashboard, /tools: \{ image: false \}/);
  assert.match(dashboard, /loadScene: false/);
  assert.match(dashboard, /new CompressionStream\("gzip"\)/);
  assert.match(dashboard, /scenePayload: \{ encoding: "gzip-base64", data: btoa\(binary\) \}/);
  assert.match(dashboard, /<TaskCanvasMainMenu \/>/);
  assert.doesNotMatch(dashboard, /MainMenu\.DefaultItems\.(?:Socials|Help)/);
  assert.match(dashboard, /currentItemFontFamily: appState\.currentItemFontFamily/);
  assert.match(dashboard, /showWelcomeScreen: false/);
  assert.match(styles, /\.task-canvas-excalidraw \.App-toolbar__extra-tools-trigger/);
  assert.match(styles, /\.excalidraw-modal-container \.HelpDialog__header/);
  assert.match(styles, /\.task-canvas-excalidraw \.main-menu-trigger/);
  assert.match(styles, /\.task-canvas-excalidraw \.default-sidebar-trigger/);
  assert.match(styles, /\.task-canvas-excalidraw \.default-sidebar/);
  assert.match(styles, /background-color: #faf9f1/);
  assert.match(dashboard, /viewBackgroundColor: "#faf9f1"/);
});



test("compressed Task Canvas reads handle BSON Binary values returned by lean MongoDB queries", async () => {
  const [route, authorization] = await Promise.all([
    readFile(new URL("../app/api/task-canvas/[canvasId]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/task-canvas-authorization.ts", import.meta.url), "utf8")
  ]);

  assert.match(route, /function storedSceneBuffer\(value: unknown\): Buffer/);
  assert.match(route, /binary\.value\(true\)/);
  assert.match(route, /binary\.buffer instanceof Uint8Array/);
  assert.match(route, /Array\.isArray\(\(legacy as Record<string, unknown>\)\.elements\)/);
  assert.doesNotMatch(route, /Buffer\.from\(canvas\.sceneGzip as Uint8Array\)/);
  assert.match(authorization, /code === "CANVAS_SCENE_STORED_INVALID" \? 500 :/);
});

test("Task Canvas offers manual save and protects pending edits during page navigation", async () => {
  const component = await readFile(
    new URL("../features/task-canvas/components/task-canvas-dashboard.tsx", import.meta.url),
    "utf8"
  );

  assert.match(component, /Save now/);
  assert.match(component, /beforeunload/);
  assert.match(component, /handlePendingNavigation/);
  assert.match(component, /confirmLabel: "Save and leave"/);
  assert.match(component, /router\.push\(destination\.pathname \+ destination\.search \+ destination\.hash\)/);
  assert.match(component, /while \(inFlightRef\.current \|\| queuedSceneRef\.current\)/);
  assert.match(component, /mergeRetriesRef\.current < 5/);
  assert.match(component, /versionNonce\?: unknown/);
  assert.match(component, /deleted\(element\) && !deleted\(existing\)/);
  assert.match(component, /nonceOf\(element\) > nonceOf\(existing\)/);
});
