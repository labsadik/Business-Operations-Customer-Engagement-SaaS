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
    appState: { memo: "x".repeat(1_000_001) },
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
