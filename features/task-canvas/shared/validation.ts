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
