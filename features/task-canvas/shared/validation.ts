export const TASK_CANVAS_TITLE_MAX_LENGTH = 80;
export const TASK_CANVAS_SCENE_MAX_BYTES = 2_000_000;
export const TASK_CANVAS_MAX_ELEMENTS = 5_000;

export type TaskCanvasScene = {
  elements: unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
};

export function validateTaskCanvasName(value: unknown) {
  if (typeof value !== "string") throw new Error("CANVAS_NAME_INVALID");
  const name = value.trim();
  if (name.length < 1 || name.length > TASK_CANVAS_TITLE_MAX_LENGTH) {
    throw new Error("CANVAS_NAME_INVALID");
  }
  return name;
}

const SUPPORTED_ELEMENT_TYPES = new Set([
  "text", "freedraw", "image", "line", "draw", "arrow",
  "ellipse", "rectangle", "diamond", "iframe", "embeddable",
  "magicframe", "frame"
]);

function finiteOr(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizePoint(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const x = value[0];
  const y = value[1];
  return typeof x === "number" && Number.isFinite(x) &&
    typeof y === "number" && Number.isFinite(y)
    ? [x, y]
    : null;
}

function normalizePoints(value: unknown): [number, number][] {
  return Array.isArray(value)
    ? value.map(normalizePoint).filter((point): point is [number, number] => point !== null)
    : [];
}

function normalizeBinding(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const binding = value as Record<string, unknown>;
  if (typeof binding.elementId !== "string" || !binding.elementId) return null;
  const result: Record<string, unknown> = {
    ...binding,
    focus: finiteOr(binding.focus, 0),
    gap: finiteOr(binding.gap, 0)
  };
  if ("fixedPoint" in binding) {
    result.fixedPoint = normalizePoint(binding.fixedPoint) ?? [0, 0];
  }
  return result;
}

/**
 * Repairs persisted data before handing it to Excalidraw. Older/imported
 * scenes can contain null tuple fields (for example points or image scale)
 * that renderers index directly.
 */
export function normalizeTaskCanvasScene(value: unknown): TaskCanvasScene {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const rawFiles = source.files && typeof source.files === "object" && !Array.isArray(source.files)
    ? source.files as Record<string, unknown>
    : {};
  const files: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(rawFiles)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const file = value as Record<string, unknown>;
    // Preserve valid data URLs, including SVG images, and exclude malformed file records.
    if (typeof file.dataURL !== "string" || !file.dataURL.startsWith("data:")) continue;
    files[key] = {
      ...file,
      id: typeof file.id === "string" && file.id ? file.id : key
    };
  }

  const rawElements = Array.isArray(source.elements) ? source.elements : [];
  const elements: unknown[] = [];

  for (const value of rawElements) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const element = { ...(value as Record<string, unknown>) };
    if (typeof element.id !== "string" || !element.id ||
        typeof element.type !== "string" ||
        !SUPPORTED_ELEMENT_TYPES.has(element.type)) continue;

    element.x = finiteOr(element.x, 0);
    element.y = finiteOr(element.y, 0);
    element.width = finiteOr(element.width, 0);
    element.height = finiteOr(element.height, 0);
    element.angle = finiteOr(element.angle, 0);

    if (Array.isArray(element.groupIds)) {
      element.groupIds = element.groupIds.filter((id): id is string => typeof id === "string");
    } else {
      element.groupIds = [];
    }

    if (Array.isArray(element.boundElements)) {
      element.boundElements = element.boundElements.filter((binding) =>
        Boolean(binding) &&
        typeof binding === "object" &&
        !Array.isArray(binding) &&
        typeof (binding as Record<string, unknown>).id === "string" &&
        ["text", "arrow"].includes(String((binding as Record<string, unknown>).type))
      );
    } else {
      element.boundElements = [];
    }

    if (element.type === "image") {
      const scale = normalizePoint(element.scale);
      element.scale = scale ?? [1, 1];
      if (typeof element.fileId !== "string") continue;
    }

    if (element.type === "text") {
      const family = element.fontFamily;
      element.fontFamily = typeof family === "number" &&
        Number.isInteger(family) && family >= 1 && family <= 5 ? family : 1;
      element.fontSize = typeof element.fontSize === "number" &&
        Number.isFinite(element.fontSize) && element.fontSize > 0 && element.fontSize <= 500
        ? element.fontSize
        : 20;
      if (typeof element.font !== "string" || !/^\s*\d+(?:\.\d+)?px\s+\S.+$/i.test(element.font)) {
        delete element.font;
      }
    }

    if (["line", "draw", "arrow"].includes(String(element.type))) {
      let points = normalizePoints(element.points);
      if (points.length < 2) points = [[0, 0], [element.width as number, element.height as number]];
      element.points = points;
      element.startBinding = normalizeBinding(element.startBinding);
      element.endBinding = normalizeBinding(element.endBinding);
    } else if (element.type === "freedraw") {
      const points = normalizePoints(element.points);
      // A free-draw path without any usable point cannot be rendered. Skip only that corrupt element.
      if (points.length === 0) continue;
      element.points = points;
      if (Array.isArray(element.pressures)) {
        element.pressures = element.pressures.filter((pressure) =>
          typeof pressure === "number" && Number.isFinite(pressure)
        );
      } else {
        delete element.pressures;
      }
    }

    elements.push(element);
  }

  const sourceAppState = source.appState && typeof source.appState === "object" && !Array.isArray(source.appState)
    ? source.appState as Record<string, unknown>
    : {};
  const appState: Record<string, unknown> = {
    viewBackgroundColor: typeof sourceAppState.viewBackgroundColor === "string" &&
      /^#[\da-f]{3,8}$/i.test(sourceAppState.viewBackgroundColor)
      ? sourceAppState.viewBackgroundColor
      : "#faf9f1"
  };
  if (typeof sourceAppState.gridSize === "number" &&
      Number.isFinite(sourceAppState.gridSize) &&
      sourceAppState.gridSize >= 0 && sourceAppState.gridSize <= 1000) {
    appState.gridSize = sourceAppState.gridSize;
  }
  if (sourceAppState.theme === "light" || sourceAppState.theme === "dark") {
    appState.theme = sourceAppState.theme;
  }
  if (typeof sourceAppState.currentItemFontFamily === "number" &&
      Number.isInteger(sourceAppState.currentItemFontFamily) &&
      sourceAppState.currentItemFontFamily >= 1 &&
      sourceAppState.currentItemFontFamily <= 5) {
    appState.currentItemFontFamily = sourceAppState.currentItemFontFamily;
  }

  return { elements, appState, files };
}

export function validateTaskCanvasScene(value: unknown): TaskCanvasScene {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("CANVAS_SCENE_INVALID");
  }
  const scene = value as Record<string, unknown>;
  if (
    !Array.isArray(scene.elements) ||
    scene.elements.length > TASK_CANVAS_MAX_ELEMENTS ||
    !scene.appState ||
    typeof scene.appState !== "object" ||
    Array.isArray(scene.appState) ||
    (scene.files !== undefined && (!scene.files || typeof scene.files !== "object" || Array.isArray(scene.files)))
  ) {
    throw new Error("CANVAS_SCENE_INVALID");
  }
  for (const element of scene.elements) {
    if (!element || typeof element !== "object" || Array.isArray(element)) throw new Error("CANVAS_SCENE_INVALID");
    const record = element as Record<string, unknown>;
    if (
      typeof record.id !== "string" || record.id.length < 1 || record.id.length > 256 ||
      typeof record.type !== "string" || record.type.length < 1 || record.type.length > 48
    ) throw new Error("CANVAS_SCENE_INVALID");

    // Catch the null tuple shapes that can crash Excalidraw during rendering.
    if (record.type === "image" && "scale" in record) {
      if (!Array.isArray(record.scale) || record.scale.length < 2 ||
          typeof record.scale[0] !== "number" || !Number.isFinite(record.scale[0]) ||
          typeof record.scale[1] !== "number" || !Number.isFinite(record.scale[1])) {
        throw new Error("CANVAS_SCENE_INVALID");
      }
    }
    if (["line", "draw", "arrow", "freedraw"].includes(record.type) && "points" in record) {
      if (!Array.isArray(record.points) || record.points.some((point) =>
        !Array.isArray(point) || point.length < 2 ||
        typeof point[0] !== "number" || !Number.isFinite(point[0]) ||
        typeof point[1] !== "number" || !Number.isFinite(point[1])
      )) {
        throw new Error("CANVAS_SCENE_INVALID");
      }
    }
    if (record.type === "freedraw" && !Array.isArray(record.points)) {
      throw new Error("CANVAS_SCENE_INVALID");
    }
  }
  const fileEntries = Object.entries((scene.files ?? {}) as Record<string, unknown>);
  if (fileEntries.length > 100) throw new Error("CANVAS_SCENE_INVALID");
  for (const [fileId, file] of fileEntries) {
    if (!fileId || fileId.length > 256 || !file || typeof file !== "object" || Array.isArray(file)) {
      throw new Error("CANVAS_SCENE_INVALID");
    }
  }

  let serialized: string;
  try {
    serialized = JSON.stringify({
      elements: scene.elements,
      appState: scene.appState,
      files: scene.files ?? {}
    });
  } catch {
    throw new Error("CANVAS_SCENE_INVALID");
  }
  if (new TextEncoder().encode(serialized).byteLength > TASK_CANVAS_SCENE_MAX_BYTES) {
    throw new Error("CANVAS_SCENE_TOO_LARGE");
  }

  return {
    elements: scene.elements,
    appState: scene.appState as Record<string, unknown>,
    files: (scene.files ?? {}) as Record<string, unknown>
  };
}

export function validateCanvasVersion(value: unknown) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error("CANVAS_VERSION_INVALID");
  }
  return value;
}

export function validateCanvasMembers(value: unknown) {
  if (!Array.isArray(value) || value.length > 200 || value.some((id) => typeof id !== "string")) {
    throw new Error("CANVAS_MEMBERS_INVALID");
  }
  return [...new Set(value.map((id) => (id as string).trim()).filter(Boolean))];
}
