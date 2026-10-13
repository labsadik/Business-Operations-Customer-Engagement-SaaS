"use client";

import dynamic from "next/dynamic";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, CheckCircle2, Clock3, FilePlus2, LoaderCircle, PanelLeftClose, PanelLeftOpen, Pencil, Plus, Trash2, UsersRound, X } from "lucide-react";
import WorkspaceSidebar from "@/components/workspace-sidebar";
import UserAvatar from "@/components/user-avatar";
import { useWorkspaceSidebarState } from "@/components/use-workspace-sidebar-state";

const Excalidraw = dynamic(async () => (await import("@excalidraw/excalidraw")).Excalidraw, {
  ssr: false,
  loading: () => <div className="grid h-full min-h-[560px] place-items-center text-sm text-slate-500"><LoaderCircle className="mr-2 inline size-4 animate-spin" /> Loading drawing tools…</div>
});

type Scene = { elements: unknown[]; appState: Record<string, unknown>; files: Record<string, unknown> };
type CanvasItem = { id: string; name: string; version: number; createdByUserId: string; memberUserIds: string[]; memberCount: number; updatedAt: string; lastEditorUserId?: string | null };
type Person = { id: string; name: string; email: string; image: string | null; role: string };
type ConfirmationPrompt = { title: string; description: string; confirmLabel: string; destructive?: boolean };
type Envelope<T> = { ok: boolean; data?: T; error?: string };
type CanvasBridge = {
  updateScene: (scene: { elements?: unknown[]; appState?: Record<string, unknown> }) => void;
  addFiles?: (files: unknown[]) => void;
  getAppState?: () => Record<string, unknown>;
  setCursor?: (cursor: string) => void;
  resetCursor?: () => void;
};
const EMPTY_SCENE: Scene = { elements: [], appState: {}, files: {} };
const imageCompressionCache = new WeakMap<object, Promise<unknown>>();

async function compressImageFile(file: unknown): Promise<unknown> {
  if (!file || typeof file !== "object" || typeof window === "undefined" || typeof createImageBitmap !== "function") return file;
  const record = file as Record<string, unknown>;
  const dataURL = typeof record.dataURL === "string" ? record.dataURL : "";
  if (!dataURL.startsWith("data:image/") || dataURL.startsWith("data:image/svg") || dataURL.length < 160_000) return file;

  const cached = imageCompressionCache.get(file);
  if (cached) return cached;

  const work = (async () => {
    let bitmap: ImageBitmap | null = null;
    let canvas: HTMLCanvasElement | null = null;
    try {
      const response = await fetch(dataURL);
      const source = await response.blob();
      if (source.size < 120_000) return file;
      bitmap = await createImageBitmap(source);
      const scale = Math.min(1, 1440 / Math.max(bitmap.width, bitmap.height));
      if (scale === 1 && source.size < 280_000) return file;

      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return file;
      context.drawImage(bitmap, 0, 0, width, height);
      const optimized = await new Promise<Blob | null>((resolve) => {
        if (!canvas) return resolve(null);
        canvas.toBlob(resolve, "image/webp", 0.78);
      });
      if (!optimized || optimized.size >= source.size * 0.94) return file;

      const optimizedDataURL = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("IMAGE_COMPRESSION_FAILED"));
        reader.onerror = () => reject(reader.error ?? new Error("IMAGE_COMPRESSION_FAILED"));
        reader.readAsDataURL(optimized);
      });
      return { ...record, dataURL: optimizedDataURL, mimeType: "image/webp" };
    } catch {
      return file;
    } finally {
      bitmap?.close();
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
    }
  })();

  imageCompressionCache.set(file, work);
  return work;
}

async function compressSceneImages(scene: Scene): Promise<Scene> {
  const entries = Object.entries(scene.files);
  if (!entries.length) return scene;
  const files: Record<string, unknown> = {};
  // Decode one image at a time to limit browser memory pressure.
  for (const [id, file] of entries) files[id] = await compressImageFile(file);
  return { ...scene, files };
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) }
  });
  const body = await response.json().catch(() => ({})) as Envelope<T>;
  if (!response.ok || body.ok !== true || body.data === undefined) {
    throw new Error(typeof body.error === "string" ? body.error : "TASK_CANVAS_REQUEST_FAILED");
  }
  return body.data;
}

function toScene(value: unknown): Scene {
  if (!value || typeof value !== "object") return EMPTY_SCENE;
  const scene = value as Partial<Scene>;
  return {
    elements: Array.isArray(scene.elements) ? scene.elements : [],
    appState: scene.appState && typeof scene.appState === "object" ? scene.appState : {},
    files: scene.files && typeof scene.files === "object" ? scene.files : {}
  };
}

function getPersistedScene(elements: unknown[], appState: Record<string, unknown>, files: Record<string, unknown>): Scene {
  return {
    elements,
    appState: {
      viewBackgroundColor: appState.viewBackgroundColor,
      gridSize: appState.gridSize,
      theme: appState.theme,
      currentItemFontFamily: appState.currentItemFontFamily
    },
    files
  };
}

function mergeScenes(local: Scene, remote: Scene): Scene {
  const chosen = new Map<string, unknown>();
  const orderedIds: string[] = [];
  const versionOf = (element: unknown) => {
    if (!element || typeof element !== "object") return 0;
    const version = (element as { version?: unknown }).version;
    return typeof version === "number" && Number.isFinite(version) ? version : 0;
  };
  const add = (element: unknown) => {
    if (!element || typeof element !== "object") return;
    const id = (element as { id?: unknown }).id;
    if (typeof id !== "string" || !id) return;
    if (!chosen.has(id)) orderedIds.push(id);
    const existing = chosen.get(id);
    if (!existing || versionOf(element) >= versionOf(existing)) chosen.set(id, element);
  };
  remote.elements.forEach(add);
  local.elements.forEach(add);
  return {
    elements: orderedIds.map((id) => chosen.get(id)).filter((element) => element !== undefined),
    appState: local.appState,
    files: { ...remote.files, ...local.files }
  };
}

function applySceneToEditor(api: CanvasBridge | null, scene: Scene) {
  if (!api) return;
  const files = Object.values(scene.files);
  if (files.length) api.addFiles?.(files);
  api.updateScene({ elements: scene.elements, appState: scene.appState });
}

function setSuppressionWindow(target: { current: number }, milliseconds: number) {
  target.current = Date.now() + milliseconds;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function errorText(code: string) {
  const messages: Record<string, string> = {
    UNAUTHENTICATED: "Your session has expired. Sign in again.",
    FORBIDDEN: "You do not have permission to change this canvas.",
    FEATURE_NOT_IN_PLAN: "Task Canvas is not included in your company's plan.",
    TASK_CANVAS_NOT_FOUND: "This canvas is no longer available to your account.",
    CANVAS_VERSION_CONFLICT: "A teammate saved a newer version. Load the latest version before continuing.",
    CANVAS_COLLABORATOR_LIMIT: "This plan's people-per-canvas limit has been reached.",
    CANVAS_MEMBER_INVALID: "Every collaborator must be an active member of this company workspace.",
    CANVAS_CREATION_LIMIT: "Your company has reached its canvas limit. Ask a company administrator to increase the plan allowance or remove an unused canvas."
  };
  return messages[code] ?? code.replaceAll("_", " ").toLocaleLowerCase();
}

export default function TaskCanvasDashboard({
  companyName,
  currentRole,
  currentUserId,
  taskCanvasEnabled,
  taskManagementEnabled,
  vaultEnabled,
  liveChatEnabled,
  maxCollaborators,
  canvasLimit
}: {
  companyName: string;
  currentRole: string;
  currentUserId: string;
  taskCanvasEnabled: boolean;
  taskManagementEnabled: boolean;
  vaultEnabled: boolean;
  liveChatEnabled: boolean;
  maxCollaborators: number;
  canvasLimit: number;
}) {
  const { collapsed: sidebarCollapsed, toggle: toggleSidebar } = useWorkspaceSidebarState();
  const [items, setItems] = useState<CanvasItem[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [peopleNextCursor, setPeopleNextCursor] = useState<string | null>(null);
  const [loadingMoreCanvases, setLoadingMoreCanvases] = useState(false);
  const [loadingMorePeople, setLoadingMorePeople] = useState(false);
  const [limits, setLimits] = useState({ maxCollaborators, canvasLimit, canvasesUsed: 0 });
  const [selectedId, setSelectedId] = useState("");
  const [scene, setScene] = useState<Scene>(EMPTY_SCENE);
  const [loadingIndex, setLoadingIndex] = useState(true);
  const [loadingCanvas, setLoadingCanvas] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [canvasRailOpen, setCanvasRailOpen] = useState(true);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [confirmation, setConfirmation] = useState<ConfirmationPrompt | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "loading" | "saving" | "saved" | "conflict" | "error">("idle");
  const [error, setError] = useState("");
  const apiRef = useRef<CanvasBridge | null>(null);
  const sceneRef = useRef<Scene>(EMPTY_SCENE);
  const confirmationResolveRef = useRef<((confirmed: boolean) => void) | null>(null);
  const selectedIdRef = useRef("");
  const versionRef = useRef(1);
  const editSerialRef = useRef(0);
  const suppressUntilRef = useRef(0);
  const dirtyRef = useRef(false);
  const conflictRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const queuedSceneRef = useRef<{ canvasId: string; scene: Scene } | null>(null);
  const loadTokenRef = useRef(0);
  const persistRef = useRef<(next: Scene) => Promise<void>>(async () => undefined);
  const mergeRetriesRef = useRef(0);
  const selected = useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId]);
  const canManage = currentRole === "COMPANY_ADMIN" || currentRole === "PLATFORM_ADMIN";
  const canManageSelected = canManage || Boolean(selected && selected.createdByUserId === currentUserId);

  const askConfirmation = useCallback((prompt: ConfirmationPrompt) => new Promise<boolean>((resolve) => {
    confirmationResolveRef.current = resolve;
    setConfirmation(prompt);
  }), []);

  const resolveConfirmation = useCallback((confirmed: boolean) => {
    setConfirmation(null);
    const resolve = confirmationResolveRef.current;
    confirmationResolveRef.current = null;
    resolve?.(confirmed);
  }, []);

  const openCanvas = useCallback(async (id: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    queuedSceneRef.current = null;
    // Release the previous editor instance while loading another board.
    apiRef.current = null;
    const token = ++loadTokenRef.current;
    selectedIdRef.current = id;
    setSelectedId(id);
    setLoadingCanvas(true);
    setSaveState("loading");
    dirtyRef.current = false;
    conflictRef.current = false;
    try {
      const data = await api<{ item: CanvasItem; scene: unknown; limits: { maxCollaborators: number; canvasLimit: number; canvasesUsed: number } }>("/api/task-canvas/" + id);
      if (token !== loadTokenRef.current) return;
      const next = toScene(data.scene);
      versionRef.current = data.item.version;
      sceneRef.current = next;
      setScene(next);
      setSuppressionWindow(suppressUntilRef, 1400);
      setItems((current) => current.map((item) => item.id === id ? { ...item, ...data.item } : item));
      setSelectedMembers(data.item.memberUserIds ?? []);
      setLimits(data.limits);
      setSaveState("saved");
      setError("");
    } catch (cause) {
      if (token === loadTokenRef.current) {
        setError(errorText((cause as Error).message));
        setSaveState("error");
      }
    } finally {
      if (token === loadTokenRef.current) setLoadingCanvas(false);
    }
  }, []);

  const refreshIndex = useCallback(async () => {
    try {
      const data = await api<{ items: CanvasItem[]; people: Person[]; nextCursor: string | null; peopleNextCursor: string | null; limits: { maxCollaborators: number; canvasLimit: number; canvasesUsed: number } }>("/api/task-canvas?limit=5");
      setItems(data.items);
      setPeople(data.people);
      setNextCursor(data.nextCursor);
      setPeopleNextCursor(data.peopleNextCursor);
      setLimits(data.limits);
      setError("");
    } catch (cause) {
      setError(errorText((cause as Error).message));
    } finally {
      setLoadingIndex(false);
    }
  }, []);

  const loadMoreCanvases = async () => {
    if (!nextCursor || loadingMoreCanvases) return;
    setLoadingMoreCanvases(true);
    try {
      const data = await api<{ items: CanvasItem[]; nextCursor: string | null; limits: { maxCollaborators: number; canvasLimit: number; canvasesUsed: number } }>("/api/task-canvas?list=canvases&limit=5&cursor=" + encodeURIComponent(nextCursor));
      setItems((current) => {
        const known = new Set(current.map((item) => item.id));
        return [...current, ...data.items.filter((item) => !known.has(item.id))];
      });
      setNextCursor(data.nextCursor);
      setLimits(data.limits);
      setError("");
    } catch (cause) {
      setError(errorText((cause as Error).message));
    } finally {
      setLoadingMoreCanvases(false);
    }
  };

  const loadMorePeople = async () => {
    if (!peopleNextCursor || loadingMorePeople) return;
    setLoadingMorePeople(true);
    try {
      const data = await api<{ people: Person[]; peopleNextCursor: string | null; limits: { maxCollaborators: number; canvasLimit: number; canvasesUsed: number } }>("/api/task-canvas?list=people&limit=5&peopleCursor=" + encodeURIComponent(peopleNextCursor));
      setPeople((current) => {
        const known = new Set(current.map((person) => person.id));
        return [...current, ...data.people.filter((person) => !known.has(person.id))];
      });
      setPeopleNextCursor(data.peopleNextCursor);
      setLimits(data.limits);
      setError("");
    } catch (cause) {
      setError(errorText((cause as Error).message));
    } finally {
      setLoadingMorePeople(false);
    }
  };

  const persistScene = useCallback(async (nextScene: Scene) => {
    const canvasId = selectedIdRef.current;
    if (!canvasId) return;
    if (inFlightRef.current) {
      queuedSceneRef.current = { canvasId: selectedIdRef.current, scene: nextScene };
      return;
    }
    inFlightRef.current = true;
    const editSerial = editSerialRef.current;
    setSaveState("saving");
    try {
      const saveScene = await compressSceneImages(nextScene);
      const result = await api<{ version: number; updatedAt: string }>("/api/task-canvas/" + canvasId, {
        method: "PATCH",
        body: JSON.stringify({ action: "save", expectedVersion: versionRef.current, scene: saveScene })
      });
      if (selectedIdRef.current !== canvasId) return;
      versionRef.current = result.version;
      setItems((current) => current.map((item) => item.id === canvasId ? { ...item, version: result.version, updatedAt: result.updatedAt } : item));
      if (editSerial === editSerialRef.current) {
        dirtyRef.current = false;
        setSaveState("saved");
      } else {
        setSaveState("saving");
      }
      conflictRef.current = false;
      mergeRetriesRef.current = 0;
      setError("");
    } catch (cause) {
      if (selectedIdRef.current !== canvasId) return;
      const code = (cause as Error).message;
      if (code === "CANVAS_VERSION_CONFLICT" && mergeRetriesRef.current < 2) {
        try {
          const latest = await api<{ item: CanvasItem; scene: unknown }>("/api/task-canvas/" + canvasId);
          if (selectedIdRef.current === canvasId) {
            const merged = mergeScenes(sceneRef.current, toScene(latest.scene));
            versionRef.current = latest.item.version;
            sceneRef.current = merged;
            setScene(merged);
            setSuppressionWindow(suppressUntilRef, 1200);
            applySceneToEditor(apiRef.current, merged);
            mergeRetriesRef.current += 1;
            editSerialRef.current += 1;
            dirtyRef.current = true;
            queuedSceneRef.current = { canvasId, scene: merged };
            conflictRef.current = false;
            setSaveState("saving");
            setError("");
          }
        } catch {
          conflictRef.current = true;
          setSaveState("conflict");
          dirtyRef.current = true;
          setError(errorText(code));
          queuedSceneRef.current = null;
        }
      } else {
        setSaveState(code === "CANVAS_VERSION_CONFLICT" ? "conflict" : "error");
        conflictRef.current = code === "CANVAS_VERSION_CONFLICT";
        dirtyRef.current = true;
        setError(code === "CANVAS_SCENE_TOO_LARGE" ? "" : errorText(code));
        queuedSceneRef.current = null;
      }
    } finally {
      inFlightRef.current = false;
      const queued = queuedSceneRef.current;
      queuedSceneRef.current = null;
      if (queued && queued.canvasId === selectedIdRef.current && !conflictRef.current) {
        void persistRef.current(queued.scene);
      }
    }
  }, []);
  useEffect(() => { persistRef.current = persistScene; }, [persistScene]);

  const scheduleSave = useCallback((next: Scene) => {
    if (Date.now() < suppressUntilRef.current) return;
    sceneRef.current = next;
    dirtyRef.current = true;
    editSerialRef.current += 1;

    // Excalidraw can emit onChange from its own update lifecycle. Keep this
    // callback ref-only; updating parent state here can feed back into the
    // editor and cause a Maximum update depth exceeded loop.
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setSaveState("saving");
      void persistRef.current(sceneRef.current);
    }, 850);
  }, []);

  const handleExcalidrawAPI = useCallback((api: unknown) => {
    apiRef.current = api as CanvasBridge | null;
  }, []);

  const handleEditorChange = useCallback((
    elements: readonly unknown[],
    appState: unknown,
    files: unknown
  ) => {
    if (Date.now() < suppressUntilRef.current) return;
    scheduleSave(getPersistedScene(
      elements as unknown as unknown[],
      appState as Record<string, unknown>,
      files as Record<string, unknown>
    ));
  }, [scheduleSave]);

  const handleCanvasMouseEnter = useCallback(() => {
    const activeTool = apiRef.current?.getAppState?.().activeTool as { type?: string } | undefined;
    if (activeTool?.type === "selection") {
      // A crosshair is easier to track on a large whiteboard while selecting
      // and positioning objects. Excalidraw continues to manage other tools.
      apiRef.current?.setCursor?.("crosshair");
    }
  }, []);

  const handleCanvasMouseLeave = useCallback(() => {
    apiRef.current?.resetCursor?.();
  }, []);

  const saveNow = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (dirtyRef.current) await persistRef.current(sceneRef.current);
  }, []);

  const prepareCanvasSwitch = useCallback(async () => {
    if (!dirtyRef.current) return true;
    await saveNow();
    if (!dirtyRef.current && !conflictRef.current) return true;
    const discard = await askConfirmation({
      title: "Discard unsaved edits?",
      description: "Some edits could not be saved. Load another canvas and discard those local edits?",
      confirmLabel: "Discard edits",
      destructive: true
    });
    if (!discard) return false;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    queuedSceneRef.current = null;
    dirtyRef.current = false;
    conflictRef.current = false;
    return true;
  }, [askConfirmation, saveNow]);

  const switchCanvas = useCallback(async (id: string) => {
    if (id === selectedIdRef.current) return;
    if (!(await prepareCanvasSwitch())) return;
    await openCanvas(id);
  }, [openCanvas, prepareCanvasSwitch]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => { void refreshIndex(); }, 0);
    return () => {
      window.clearTimeout(loadTimer);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [refreshIndex]);

  useEffect(() => {
    if (!selectedId || loadingCanvas) return;
    const poll = async () => {
      if (document.visibilityState !== "visible" || dirtyRef.current || inFlightRef.current) return;
      try {
        const meta = await api<{ item: CanvasItem }>("/api/task-canvas/" + selectedId + "?meta=1");
        if (meta.item.version <= versionRef.current || dirtyRef.current || inFlightRef.current) return;
        const latest = await api<{ item: CanvasItem; scene: unknown }>("/api/task-canvas/" + selectedId);
        if (selectedIdRef.current !== selectedId || dirtyRef.current || inFlightRef.current) return;
        const next = toScene(latest.scene);
        versionRef.current = latest.item.version;
        sceneRef.current = next;
        setScene(next);
        setItems((current) => current.map((item) => item.id === selectedId ? { ...item, ...latest.item } : item));
        setSuppressionWindow(suppressUntilRef, 1400);
        applySceneToEditor(apiRef.current, next);
        setSaveState("saved");
      } catch {
        // Polling is best effort. The next visible refresh can retry without blocking editing.
      }
    };
    const timer = window.setInterval(() => { void poll(); }, 10_000);
    const visibility = () => { if (document.visibilityState === "visible") void poll(); };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [selectedId, loadingCanvas]);

  const createCanvas = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (limits.canvasesUsed >= limits.canvasLimit) {
      setError("CANVAS_CREATION_LIMIT");
      return;
    }
    if (!(await prepareCanvasSwitch())) return;
    setCreating(true);
    setError("");
    try {
      const data = await api<{ item: CanvasItem; limits: { maxCollaborators: number; canvasLimit: number; canvasesUsed: number } }>("/api/task-canvas", { method: "POST", body: JSON.stringify({ name: newName }) });
      setItems((current) => [data.item, ...current.filter((item) => item.id !== data.item.id)]);
      setLimits(data.limits);
      setNewName("");
      await openCanvas(data.item.id);
    } catch (cause) {
      setError(errorText((cause as Error).message));
    } finally {
      setCreating(false);
    }
  };

  const renameCanvas = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    try {
      const data = await api<{ item: { id: string; name: string; version: number } }>("/api/task-canvas/" + selected.id, {
        method: "PATCH", body: JSON.stringify({ action: "rename", name: renameDraft })
      });
      setItems((current) => current.map((item) => item.id === selected.id ? { ...item, name: data.item.name } : item));
      setRenameOpen(false);
      setError("");
    } catch (cause) {
      setError(errorText((cause as Error).message));
    }
  };

  const deleteCanvas = async () => {
    if (!selected) return;
    const confirmed = await askConfirmation({
      title: "Delete canvas?",
      description: "Delete " + selected.name + "? This cannot be undone.",
      confirmLabel: "Delete canvas",
      destructive: true
    });
    if (!confirmed) return;
    try {
      const result = await api<{ deleted: boolean; limits: { maxCollaborators: number; canvasLimit: number; canvasesUsed: number } }>("/api/task-canvas/" + selected.id, { method: "DELETE" });
      setLimits(result.limits);
      selectedIdRef.current = "";
      apiRef.current = null;
      setSelectedId("");
      setItems((current) => current.filter((item) => item.id !== selected.id));
      setScene(EMPTY_SCENE);
      sceneRef.current = EMPTY_SCENE;
      setSaveState("idle");
    } catch (cause) {
      setError(errorText((cause as Error).message));
    }
  };

  const toggleMember = (id: string, checked: boolean) => {
    setSelectedMembers((current) => checked ? Array.from(new Set([...current, id])) : current.filter((member) => member !== id));
  };

  const saveMembers = async () => {
    if (!selected) return;
    try {
      const data = await api<{ memberUserIds: string[]; memberCount: number }>("/api/task-canvas/" + selected.id, {
        method: "PATCH", body: JSON.stringify({ action: "members", memberUserIds: selectedMembers })
      });
      setSelectedMembers(data.memberUserIds);
      setItems((current) => current.map((item) => item.id === selected.id ? { ...item, memberUserIds: data.memberUserIds, memberCount: data.memberCount } : item));
      setPeopleOpen(false);
      setError("");
    } catch (cause) {
      setError(errorText((cause as Error).message));
    }
  };

  const savingLabel = loadingCanvas || saveState === "loading" ? "Loading" :
    saveState === "saving" ? "Saving…" :
    saveState === "saved" ? "Saved" :
    saveState === "conflict" ? "Version conflict" :
    saveState === "error" ? "Save failed" : "Ready";

  return (
    <>
      <WorkspaceSidebar companyName={companyName} taskManagementEnabled={taskManagementEnabled} taskCanvasEnabled={taskCanvasEnabled} vaultEnabled={vaultEnabled} liveChatEnabled={liveChatEnabled} canManage={canManage} adminManaged={currentRole === "PLATFORM_ADMIN"} collapsed={sidebarCollapsed} onToggleCollapsed={toggleSidebar} />
      <main className={"flex h-dvh min-h-0 flex-col overflow-hidden bg-[#f8f9fc] text-slate-950 " + (sidebarCollapsed ? "lg:pl-20" : "lg:pl-72")}>
        <header className="z-30 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-white/95 px-3 py-2.5 backdrop-blur-xl sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button type="button" onClick={() => setCanvasRailOpen((open) => !open)} aria-label={canvasRailOpen ? "Hide canvas list" : "Show canvas list"} title={canvasRailOpen ? "Hide canvas list" : "Show canvas list"} className="grid size-9 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50">{canvasRailOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}</button>
            <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-600">Workspace / Collaboration</p><h1 className="truncate text-lg font-semibold tracking-tight">Task Canvas <span className="ml-1 text-xs font-normal text-slate-400">· {companyName}</span></h1></div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-600">{saveState === "saving" || loadingCanvas ? <LoaderCircle className="size-3.5 animate-spin" /> : saveState === "saved" ? <CheckCircle2 className="size-3.5 text-emerald-600" /> : <Clock3 className="size-3.5" />}{savingLabel}</span>
                        <button type="button" onClick={() => { setSelectedMembers(selected ? selected.memberUserIds : []); setPeopleOpen(true); }} disabled={!selected} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><UsersRound className="size-3.5" /> Collaborators</button>
          </div>
        </header>

        <div className={"grid min-h-0 flex-1 grid-cols-1 " + (canvasRailOpen ? "grid-rows-[minmax(0,0.38fr)_minmax(0,1fr)] lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:grid-rows-1" : "grid-rows-1 lg:grid-cols-[minmax(0,1fr)]")}>
          {canvasRailOpen && <aside className="flex min-h-0 max-h-[38dvh] flex-col overflow-hidden border-b border-slate-200 bg-white lg:max-h-none lg:border-b-0 lg:border-r">
            <div className="shrink-0 border-b border-slate-100 p-3">
              <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Company canvas allowance</p>
                <p className="mt-1 text-xs font-semibold text-slate-800">{limits.canvasesUsed} of {limits.canvasLimit} canvases used</p>
                <p className="mt-1 text-[10px] leading-4 text-slate-500">Shared by every employee and workspace in {companyName}. Deleting a canvas frees a slot.</p>
              </div>
              <form onSubmit={createCanvas} className="flex gap-1.5">
                <input value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={80} required placeholder="New canvas name" aria-label="New canvas name" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-2.5 py-2 text-xs outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
                <button disabled={creating || newName.trim().length === 0 || limits.canvasesUsed >= limits.canvasLimit} type="submit" title={limits.canvasesUsed >= limits.canvasLimit ? "Company canvas limit reached" : "Create canvas"} className="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-950 text-white hover:bg-indigo-700 disabled:opacity-50"><Plus className="size-4" /></button>
              </form>
              {limits.canvasesUsed >= limits.canvasLimit && <p className="mt-2 text-[10px] leading-4 text-amber-700">Limit reached. Ask a company administrator to change the plan allowance or delete an unused canvas.</p>}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
              {loadingIndex && items.length === 0 && <p className="px-2 py-4 text-xs text-slate-500">Loading canvases…</p>}
              {!loadingIndex && items.length === 0 && <div className="px-2 py-5 text-center"><FilePlus2 className="mx-auto size-6 text-slate-300" /><p className="mt-2 text-xs font-semibold text-slate-700">No canvases available</p><p className="mt-1 text-[11px] text-slate-500">Create a canvas to start planning, designing, or documenting your work.</p></div>}
              {items.map((item) => <button key={item.id} type="button" onClick={() => { if (item.id !== selectedId) void switchCanvas(item.id); }} className={"mb-1.5 w-full rounded-xl border p-3 text-left transition-colors " + (item.id === selectedId ? "border-indigo-200 bg-indigo-50/70" : "border-transparent bg-white hover:border-slate-200 hover:bg-slate-50")}>
                <span className="block truncate text-xs font-semibold text-slate-800">{item.name}</span><span className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-slate-500"><span className="inline-flex items-center gap-1"><UsersRound className="size-3" />{item.memberCount}/{limits.maxCollaborators} collaborators</span></span><span className="mt-1 block truncate text-[10px] text-slate-400">{formatDate(item.updatedAt)}</span>
              </button>)}
              {nextCursor && <button type="button" onClick={() => void loadMoreCanvases()} disabled={loadingMoreCanvases} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">{loadingMoreCanvases && <LoaderCircle className="size-3.5 animate-spin" />}{loadingMoreCanvases ? "Loading 5 more canvases…" : "Load 5 more canvases"}</button>}
            </div>
            <div className="shrink-0 border-t border-slate-100 px-3 py-2.5"><p className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500"><UsersRound className="size-3.5 text-emerald-600" /> Company workspace: {companyName}</p><p className="mt-1 text-[10px] leading-4 text-slate-400">Up to {limits.maxCollaborators} collaborators per canvas · {limits.canvasLimit} canvases for the whole company.</p></div>
          </aside>}

          <section className="flex min-h-0 min-w-0 flex-col overflow-hidden p-2 sm:p-3">
            {error && <div role="alert" className="mb-2 flex shrink-0 flex-wrap items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-800"><AlertCircle className="mt-0.5 size-4 shrink-0" /><span className="min-w-0 flex-1">{error}</span>{saveState === "conflict" && selected && <button type="button" onClick={() => void askConfirmation({ title: "Load latest version?", description: "Discard your unsaved local changes and load the latest saved canvas.", confirmLabel: "Load latest", destructive: true }).then((confirmed) => { if (confirmed) void openCanvas(selected.id); })} className="shrink-0 rounded-lg border border-rose-300 bg-white px-2 py-1 font-semibold hover:bg-rose-100">Load latest</button>}<button type="button" aria-label="Dismiss error" onClick={() => setError("")}><X className="size-4" /></button></div>}
            {selected ? <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5 sm:px-4">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {renameOpen && canManageSelected ? <form onSubmit={renameCanvas} className="flex min-w-0 flex-1 gap-2"><input value={renameDraft} onChange={(event) => setRenameDraft(event.target.value)} maxLength={80} required aria-label="Canvas title" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-indigo-400" autoFocus /><button type="submit" className="rounded-lg bg-slate-950 px-2.5 py-1.5 text-xs font-semibold text-white">Save</button><button type="button" onClick={() => setRenameOpen(false)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs">Cancel</button></form> : <><h2 className="truncate text-sm font-semibold text-slate-900">{selected.name}</h2>{canManageSelected && <button type="button" title="Rename canvas" onClick={() => { setRenameDraft(selected.name); setRenameOpen(true); }} className="grid size-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-800"><Pencil className="size-3.5" /></button>}</>}
                </div>
                {canManageSelected && <button type="button" onClick={() => void deleteCanvas()} title="Delete canvas" className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="size-4" /></button>}
              </div>
              <div
                className="min-h-0 flex-1 w-full bg-white"
                onMouseEnter={handleCanvasMouseEnter}
                onMouseLeave={handleCanvasMouseLeave}
              >
                {loadingCanvas ? <div className="grid h-full place-items-center text-sm text-slate-500"><LoaderCircle className="mr-2 inline size-4 animate-spin" /> Opening canvas…</div> : <Excalidraw
                  key={selectedId}
                  initialData={{ ...scene, appState: { ...scene.appState, showWelcomeScreen: false } } as never}
                  excalidrawAPI={handleExcalidrawAPI}
                  name={selected.name}
                  onChange={handleEditorChange}
                />}
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/70 px-3 py-2 text-[10px] text-slate-500 sm:px-4"><span>Draw, write, connect ideas, add images, and export from the drawing tools.</span><span className="font-semibold text-slate-400">Changes save automatically</span></div>
            </div> : loadingIndex ? <div role="status" className="grid min-h-0 flex-1 place-items-center rounded-2xl border border-slate-200 bg-white px-6 text-center"><div className="max-w-sm"><LoaderCircle className="mx-auto size-6 animate-spin text-indigo-600" /><h2 className="mt-3 text-sm font-semibold text-slate-800">Loading your canvases</h2><p className="mt-1 text-xs text-slate-500">Your boards and workspace members are being loaded.</p></div></div> : <div className="grid min-h-0 flex-1 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 text-center"><div className="max-w-sm"><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-700"><FilePlus2 className="size-5" /></div><h2 className="mt-4 text-base font-semibold">No canvas open</h2><p className="mt-2 text-sm leading-6 text-slate-500">Choose a canvas from the left panel or create one to start drawing. Nothing opens automatically.</p></div></div>}
          </section>
        </div>

        {peopleOpen && selected && <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/35 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setPeopleOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="task-canvas-people-title" className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:rounded-3xl">
            <div className="flex items-start justify-between gap-3"><div><h2 id="task-canvas-people-title" className="text-base font-semibold">Canvas collaborators</h2><p className="mt-1 text-xs text-slate-500">Only active members of {companyName}&apos;s workspace can be added.</p></div><button type="button" onClick={() => setPeopleOpen(false)} aria-label="Close collaborators" className="grid size-8 place-items-center rounded-lg hover:bg-slate-100"><X className="size-4" /></button></div>
            <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">Select up to {limits.maxCollaborators} people, including the canvas owner.</p>{!canManageSelected && <p className="mt-3 text-xs text-slate-500">Only the canvas owner or a company administrator can change access.</p>}
            <div className="mt-3 space-y-1">{people.map((person) => {
              const checked = selectedMembers.includes(person.id);
              const owner = person.id === selected.createdByUserId;
              const blocked = !canManageSelected || owner || (!checked && selectedMembers.length >= limits.maxCollaborators);
              return <label key={person.id} className={"flex items-center gap-3 rounded-xl px-3 py-2.5 " + (blocked ? "opacity-70" : "hover:bg-slate-50")}>
                <input type="checkbox" checked={checked} disabled={blocked} onChange={(event) => toggleMember(person.id, event.target.checked)} className="size-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                <UserAvatar name={person.name} email={person.email} image={person.image} size={32} className="border-indigo-100 bg-indigo-50 text-indigo-700" />
                <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-800">{person.name}{owner ? " · Owner" : ""}</span><span className="block truncate text-[10px] text-slate-500">{person.email}</span></span><span className="text-[10px] text-slate-400">{person.role.replaceAll("_", " ").toLocaleLowerCase()}</span>
              </label>;
            })}{people.length === 0 && <p className="px-3 py-5 text-xs text-slate-500">No active workspace members found.</p>}{peopleNextCursor && <button type="button" onClick={() => void loadMorePeople()} disabled={loadingMorePeople} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">{loadingMorePeople && <LoaderCircle className="size-3.5 animate-spin" />}{loadingMorePeople ? "Loading 5 more members…" : "Load 5 more members"}</button>}</div>
            <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setPeopleOpen(false)} className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700">Cancel</button>{canManageSelected && <button type="button" onClick={() => void saveMembers()} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-3.5 py-2 text-xs font-semibold text-white"><Check className="size-3.5" /> Save access</button>}</div>
          </section>
        </div>}

        {confirmation && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <section role="alertdialog" aria-modal="true" aria-labelledby="task-canvas-confirm-title" aria-describedby="task-canvas-confirm-description" className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <h2 id="task-canvas-confirm-title" className="text-base font-semibold text-slate-950">{confirmation.title}</h2>
            <p id="task-canvas-confirm-description" className="mt-2 text-sm leading-6 text-slate-600">{confirmation.description}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => resolveConfirmation(false)} className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
              <button type="button" onClick={() => resolveConfirmation(true)} className={"rounded-xl px-3.5 py-2.5 text-xs font-semibold text-white " + (confirmation.destructive ? "bg-rose-600 hover:bg-rose-700" : "bg-slate-950 hover:bg-slate-800")}>{confirmation.confirmLabel}</button>
            </div>
          </section>
        </div>}
      </main>
    </>
  );
}
