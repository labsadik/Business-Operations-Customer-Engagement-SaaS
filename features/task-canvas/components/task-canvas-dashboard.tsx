"use client";

import dynamic from "next/dynamic";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, CheckCircle2, Clock3, FilePlus2, History, LoaderCircle, Pencil, Plus, Save, ShieldCheck, Trash2, UsersRound, X } from "lucide-react";
import WorkspaceSidebar from "@/components/workspace-sidebar";
import { useWorkspaceSidebarState } from "@/components/use-workspace-sidebar-state";

const Excalidraw = dynamic(async () => (await import("@excalidraw/excalidraw")).Excalidraw, {
  ssr: false,
  loading: () => <div className="grid h-full min-h-[560px] place-items-center text-sm text-slate-500"><LoaderCircle className="mr-2 inline size-4 animate-spin" /> Loading drawing tools…</div>
});

type Scene = { elements: unknown[]; appState: Record<string, unknown>; files: Record<string, unknown> };
type CanvasItem = { id: string; name: string; version: number; createdByUserId: string; memberUserIds: string[]; memberCount: number; updatedAt: string; lastEditorUserId?: string | null };
type Person = { id: string; name: string; email: string; image: string | null; role: string };
type Revision = { id: string; version: number; name: string; createdAt: string; createdByUserId: string };
type Envelope<T> = { ok: boolean; data?: T; error?: string };
type CanvasBridge = { updateScene: (scene: unknown) => void };
const EMPTY_SCENE: Scene = { elements: [], appState: {}, files: {} };

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
    CANVAS_SCENE_TOO_LARGE: "This drawing is too large to save. Remove oversized images or unused elements.",
    CANVAS_CREATION_LIMIT: "This workspace has reached its canvas limit."
  };
  return messages[code] ?? code.replaceAll("_", " ").toLocaleLowerCase();
}

export default function TaskCanvasDashboard({
  companyName,
  currentRole,
  taskCanvasEnabled,
  maxCollaborators,
  historyLimit
}: {
  companyName: string;
  currentRole: string;
  taskCanvasEnabled: boolean;
  maxCollaborators: number;
  historyLimit: number;
}) {
  const { collapsed: sidebarCollapsed, toggle: toggleSidebar } = useWorkspaceSidebarState();
  const [items, setItems] = useState<CanvasItem[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [limits, setLimits] = useState({ maxCollaborators, historyLimit });
  const [selectedId, setSelectedId] = useState("");
  const [scene, setScene] = useState<Scene>(EMPTY_SCENE);
  const [loadingIndex, setLoadingIndex] = useState(true);
  const [loadingCanvas, setLoadingCanvas] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [history, setHistory] = useState<Revision[]>([]);
  const [saveState, setSaveState] = useState<"idle" | "loading" | "saving" | "saved" | "conflict" | "error">("idle");
  const [error, setError] = useState("");
  const apiRef = useRef<CanvasBridge | null>(null);
  const sceneRef = useRef<Scene>(EMPTY_SCENE);
  const selectedIdRef = useRef("");
  const versionRef = useRef(1);
  const editSerialRef = useRef(0);
  const suppressUntilRef = useRef(0);
  const dirtyRef = useRef(false);
  const conflictRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const queuedSceneRef = useRef<Scene | null>(null);
  const loadTokenRef = useRef(0);
  const persistRef = useRef<(next: Scene) => Promise<void>>(async () => undefined);
  const selected = useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId]);
  const canManage = currentRole === "COMPANY_ADMIN" || currentRole === "PLATFORM_ADMIN";

  const openCanvas = useCallback(async (id: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    queuedSceneRef.current = null;
    const token = ++loadTokenRef.current;
    selectedIdRef.current = id;
    setSelectedId(id);
    setLoadingCanvas(true);
    setSaveState("loading");
    dirtyRef.current = false;
    conflictRef.current = false;
    try {
      const data = await api<{ item: CanvasItem; scene: unknown; limits: { maxCollaborators: number; historyLimit: number } }>("/api/task-canvas/" + id);
      if (token !== loadTokenRef.current) return;
      const next = toScene(data.scene);
      versionRef.current = data.item.version;
      sceneRef.current = next;
      setScene(next);
      setItems((current) => current.map((item) => item.id === id ? { ...item, ...data.item } : item));
      setSelectedMembers(data.item.memberUserIds ?? []);
      setLimits(data.limits);
      setSaveState("saved");
      setError("");
      suppressUntilRef.current = Date.now() + 1400;
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
    setLoadingIndex(true);
    try {
      const data = await api<{ items: CanvasItem[]; people: Person[]; limits: { maxCollaborators: number; historyLimit: number } }>("/api/task-canvas");
      setItems(data.items);
      setPeople(data.people);
      setLimits(data.limits);
      setError("");
      if (!selectedIdRef.current && data.items.length) void openCanvas(data.items[0].id);
    } catch (cause) {
      setError(errorText((cause as Error).message));
    } finally {
      setLoadingIndex(false);
    }
  }, [openCanvas]);

  const persistScene = useCallback(async (nextScene: Scene) => {
    const canvasId = selectedIdRef.current;
    if (!canvasId) return;
    if (inFlightRef.current) {
      queuedSceneRef.current = nextScene;
      return;
    }
    inFlightRef.current = true;
    const editSerial = editSerialRef.current;
    try {
      const result = await api<{ version: number; updatedAt: string }>("/api/task-canvas/" + canvasId, {
        method: "PATCH",
        body: JSON.stringify({ action: "save", expectedVersion: versionRef.current, scene: nextScene })
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
      setError("");
    } catch (cause) {
      if (selectedIdRef.current !== canvasId) return;
      const code = (cause as Error).message;
      setSaveState(code === "CANVAS_VERSION_CONFLICT" ? "conflict" : "error");
      conflictRef.current = code === "CANVAS_VERSION_CONFLICT";
      dirtyRef.current = true;
      setError(errorText(code));
      queuedSceneRef.current = null;
    } finally {
      inFlightRef.current = false;
      const queued = queuedSceneRef.current;
      queuedSceneRef.current = null;
      if (queued && selectedIdRef.current === canvasId && !conflictRef.current) void persistRef.current(queued);
    }
  }, []);
  useEffect(() => { persistRef.current = persistScene; }, [persistScene]);

  const scheduleSave = useCallback((next: Scene) => {
    if (Date.now() < suppressUntilRef.current) return;
    sceneRef.current = next;
    dirtyRef.current = true;
    editSerialRef.current += 1;
    setScene(next);
    setSaveState("saving");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void persistRef.current(sceneRef.current);
    }, 850);
  }, []);

  const saveNow = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (dirtyRef.current) await persistRef.current(sceneRef.current);
  }, []);

  useEffect(() => {
    void refreshIndex();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
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
        suppressUntilRef.current = Date.now() + 1400;
        apiRef.current?.updateScene(next);
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
    setCreating(true);
    setError("");
    try {
      const data = await api<{ item: CanvasItem }>("/api/task-canvas", { method: "POST", body: JSON.stringify({ name: newName }) });
      setItems((current) => [data.item, ...current.filter((item) => item.id !== data.item.id)]);
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
    if (!selected || !window.confirm("Delete " + selected.name + " and its saved history? This cannot be undone.")) return;
    try {
      await api<{ deleted: boolean }>("/api/task-canvas/" + selected.id, { method: "DELETE" });
      const remaining = items.filter((item) => item.id !== selected.id);
      selectedIdRef.current = "";
      setSelectedId("");
      setItems(remaining);
      if (remaining.length) await openCanvas(remaining[0].id);
      else {
        setScene(EMPTY_SCENE);
        sceneRef.current = EMPTY_SCENE;
        setSaveState("idle");
      }
    } catch (cause) {
      setError(errorText((cause as Error).message));
    }
  };

  const openHistory = async () => {
    if (!selected) return;
    try {
      const data = await api<{ items: Revision[]; historyLimit: number }>("/api/task-canvas/" + selected.id + "/history");
      setHistory(data.items);
      setLimits((current) => ({ ...current, historyLimit: data.historyLimit }));
      setHistoryOpen(true);
    } catch (cause) {
      setError(errorText((cause as Error).message));
    }
  };

  const checkpoint = async () => {
    if (!selected) return;
    await saveNow();
    if (dirtyRef.current || conflictRef.current) return;
    try {
      const data = await api<{ revision: Revision }>("/api/task-canvas/" + selected.id, {
        method: "PATCH", body: JSON.stringify({ action: "checkpoint", expectedVersion: versionRef.current })
      });
      setHistory((current) => [data.revision, ...current.filter((entry) => entry.id !== data.revision.id)].slice(0, limits.historyLimit));
      setError("");
    } catch (cause) {
      setError(errorText((cause as Error).message));
    }
  };

  const restoreRevision = async (revisionId: string) => {
    if (!selected || !window.confirm("Restore this version? The current drawing will be saved to history first.")) return;
    await saveNow();
    if (dirtyRef.current || conflictRef.current) return;
    try {
      const result = await api<{ version: number; scene: unknown }>("/api/task-canvas/" + selected.id + "/history", {
        method: "POST", body: JSON.stringify({ revisionId, expectedVersion: versionRef.current })
      });
      const next = toScene(result.scene);
      versionRef.current = result.version;
      sceneRef.current = next;
      setScene(next);
      dirtyRef.current = false;
      setItems((current) => current.map((item) => item.id === selected.id ? { ...item, version: result.version } : item));
      suppressUntilRef.current = Date.now() + 1400;
      apiRef.current?.updateScene(next);
      setHistoryOpen(false);
      setSaveState("saved");
      await openHistory();
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
      <WorkspaceSidebar companyName={companyName} taskCanvasEnabled={taskCanvasEnabled} canManage={canManage} adminManaged={currentRole === "PLATFORM_ADMIN"} collapsed={sidebarCollapsed} onToggleCollapsed={toggleSidebar} />
      <main className={"min-h-screen bg-[#f8f9fc] text-slate-950 " + (sidebarCollapsed ? "lg:pl-20" : "lg:pl-72")}>
        <header className="sticky top-0 z-30 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-white/95 px-4 py-3 backdrop-blur-xl sm:px-6">
          <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-600">Workspace / Collaboration</p><h1 className="truncate text-lg font-semibold tracking-tight">Task Canvas <span className="ml-1 text-xs font-normal text-slate-400">· {companyName}</span></h1></div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-600">{saveState === "saving" || loadingCanvas ? <LoaderCircle className="size-3.5 animate-spin" /> : saveState === "saved" ? <CheckCircle2 className="size-3.5 text-emerald-600" /> : <Clock3 className="size-3.5" />}{savingLabel}</span>
            <button type="button" onClick={() => void checkpoint()} disabled={!selected || loadingCanvas} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Save className="size-3.5" /> Save version</button>
            <button type="button" onClick={() => { setSelectedMembers(selected ? selected.memberUserIds : []); setPeopleOpen(true); }} disabled={!selected} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><UsersRound className="size-3.5" /> People</button>
            <button type="button" onClick={() => void openHistory()} disabled={!selected} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><History className="size-3.5" /> History</button>
          </div>
        </header>

        <div className="grid min-h-[calc(100vh-4rem)] grid-cols-1 lg:grid-cols-[15.5rem_minmax(0,1fr)]">
          <aside className="border-b border-slate-200 bg-white lg:min-h-[calc(100vh-4rem)] lg:border-b-0 lg:border-r">
            <div className="border-b border-slate-100 px-4 py-4">
              <div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold">Your canvases</h2><p className="mt-1 text-[11px] text-slate-500">Private to this company</p></div><span className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">{items.length}/100</span></div>
              <form onSubmit={createCanvas} className="mt-3 flex gap-1.5">
                <input value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={80} required placeholder="New canvas name" aria-label="New canvas name" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-2.5 py-2 text-xs outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
                <button disabled={creating || newName.trim().length === 0} type="submit" title="Create canvas" className="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-950 text-white hover:bg-indigo-700 disabled:opacity-50"><Plus className="size-4" /></button>
              </form>
            </div>
            <div className="flex gap-2 overflow-x-auto p-3 lg:block lg:space-y-1 lg:overflow-visible">
              {loadingIndex && items.length === 0 && <p className="px-2 py-4 text-xs text-slate-500">Loading canvases…</p>}
              {!loadingIndex && items.length === 0 && <div className="min-w-52 px-2 py-5 text-center lg:min-w-0"><FilePlus2 className="mx-auto size-6 text-slate-300" /><p className="mt-2 text-xs font-semibold text-slate-700">Start with a blank canvas</p><p className="mt-1 text-[11px] text-slate-500">Sketch ideas, flows and team plans.</p></div>}
              {items.map((item) => <button key={item.id} type="button" onClick={() => { if (item.id !== selectedId) void openCanvas(item.id); }} className={"min-w-52 rounded-xl border p-3 text-left transition-colors lg:mb-1 lg:min-w-0 lg:w-full " + (item.id === selectedId ? "border-indigo-200 bg-indigo-50/70" : "border-transparent bg-white hover:border-slate-200 hover:bg-slate-50")}>
                <span className="block truncate text-xs font-semibold text-slate-800">{item.name}</span><span className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-slate-500"><span>v{item.version}</span><span className="inline-flex items-center gap-1"><UsersRound className="size-3" />{item.memberCount}/{limits.maxCollaborators}</span></span><span className="mt-1 block truncate text-[10px] text-slate-400">{formatDate(item.updatedAt)}</span>
              </button>)}
            </div>
            <div className="border-t border-slate-100 px-4 py-3"><p className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500"><ShieldCheck className="size-3.5 text-emerald-600" /> Company-isolated workspace</p><p className="mt-1 text-[10px] leading-4 text-slate-400">Up to {limits.maxCollaborators} people per canvas · {limits.historyLimit} saved versions</p></div>
          </aside>

          <section className="min-w-0 p-2 sm:p-3">
            {error && <div role="alert" className="mb-2 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-800"><AlertCircle className="mt-0.5 size-4 shrink-0" /><span className="min-w-0 flex-1">{error}</span><button type="button" aria-label="Dismiss error" onClick={() => setError("")}><X className="size-4" /></button></div>}
            {selected ? <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5 sm:px-4">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {renameOpen && canManage ? <form onSubmit={renameCanvas} className="flex min-w-0 flex-1 gap-2"><input value={renameDraft} onChange={(event) => setRenameDraft(event.target.value)} maxLength={80} required aria-label="Canvas title" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-indigo-400" autoFocus /><button type="submit" className="rounded-lg bg-slate-950 px-2.5 py-1.5 text-xs font-semibold text-white">Save</button><button type="button" onClick={() => setRenameOpen(false)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs">Cancel</button></form> : <><h2 className="truncate text-sm font-semibold text-slate-900">{selected.name}</h2>{canManage && <button type="button" title="Rename canvas" onClick={() => { setRenameDraft(selected.name); setRenameOpen(true); }} className="grid size-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-800"><Pencil className="size-3.5" /></button>}</>}
                </div>
                {canManage && <button type="button" onClick={() => void deleteCanvas()} title="Delete canvas" className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="size-4" /></button>}<span className="shrink-0 text-[10px] text-slate-400">Version {selected.version}</span>
              </div>
              <div className="h-[calc(100vh-11.5rem)] min-h-[560px] w-full bg-white" onBlurCapture={() => { void saveNow(); }}>
                {loadingCanvas ? <div className="grid h-full place-items-center text-sm text-slate-500"><LoaderCircle className="mr-2 inline size-4 animate-spin" /> Opening canvas…</div> : <Excalidraw
                  key={selectedId}
                  initialData={scene as never}
                  excalidrawAPI={(api) => { apiRef.current = api as unknown as CanvasBridge; }}
                  onChange={(elements, appState, files) => {
                    if (Date.now() < suppressUntilRef.current) return;
                    scheduleSave(getPersistedScene(elements, appState as unknown as Record<string, unknown>, files as unknown as Record<string, unknown>));
                  }}
                />}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/70 px-3 py-2 text-[10px] text-slate-500 sm:px-4"><span>Draw, write, connect ideas, add images, and export from Excalidraw's built-in menus.</span><button type="button" onClick={() => void checkpoint()} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-indigo-700 hover:bg-indigo-50"><Save className="size-3" /> Create history point</button></div>
            </div> : <div className="grid min-h-[560px] place-items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 text-center"><div className="max-w-sm"><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-700"><FilePlus2 className="size-5" /></div><h2 className="mt-4 text-base font-semibold">Your team's visual workspace</h2><p className="mt-2 text-sm leading-6 text-slate-500">Create a canvas to map workflows, brainstorm ideas, sketch diagrams, and keep versioned team notes together.</p></div></div>}
          </section>
        </div>

        {peopleOpen && selected && <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/35 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setPeopleOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="task-canvas-people-title" className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:rounded-3xl">
            <div className="flex items-start justify-between gap-3"><div><h2 id="task-canvas-people-title" className="text-base font-semibold">Canvas collaborators</h2><p className="mt-1 text-xs text-slate-500">Only active members of {companyName}'s workspace can be added.</p></div><button type="button" onClick={() => setPeopleOpen(false)} aria-label="Close collaborators" className="grid size-8 place-items-center rounded-lg hover:bg-slate-100"><X className="size-4" /></button></div>
            <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">Select up to {limits.maxCollaborators} people, including the canvas owner.</p>{!canManage && <p className="mt-3 text-xs text-slate-500">Only the canvas owner or a company administrator can change access.</p>}
            <div className="mt-3 space-y-1">{people.map((person) => {
              const checked = selectedMembers.includes(person.id);
              const owner = person.id === selected.createdByUserId;
              const blocked = !canManage || owner || (!checked && selectedMembers.length >= limits.maxCollaborators);
              return <label key={person.id} className={"flex items-center gap-3 rounded-xl px-3 py-2.5 " + (blocked ? "opacity-70" : "hover:bg-slate-50")}>
                <input type="checkbox" checked={checked} disabled={blocked} onChange={(event) => toggleMember(person.id, event.target.checked)} className="size-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-700">{person.name.slice(0,1).toLocaleUpperCase()}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-800">{person.name}{owner ? " · Owner" : ""}</span><span className="block truncate text-[10px] text-slate-500">{person.email}</span></span><span className="text-[10px] text-slate-400">{person.role.replaceAll("_", " ").toLocaleLowerCase()}</span>
              </label>;
            })}{people.length === 0 && <p className="px-3 py-5 text-xs text-slate-500">No active workspace members found.</p>}</div>
            <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setPeopleOpen(false)} className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700">Cancel</button>{canManage && <button type="button" onClick={() => void saveMembers()} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-3.5 py-2 text-xs font-semibold text-white"><Check className="size-3.5" /> Save access</button>}</div>
          </section>
        </div>}

        {historyOpen && selected && <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/35 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setHistoryOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="task-canvas-history-title" className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:rounded-3xl">
            <div className="flex items-start justify-between gap-3"><div><h2 id="task-canvas-history-title" className="text-base font-semibold">Canvas history</h2><p className="mt-1 text-xs text-slate-500">Last {limits.historyLimit} saved versions are retained for this plan.</p></div><button type="button" onClick={() => setHistoryOpen(false)} aria-label="Close history" className="grid size-8 place-items-center rounded-lg hover:bg-slate-100"><X className="size-4" /></button></div>
            <div className="mt-4 space-y-2">{history.map((revision) => <div key={revision.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3"><div className="grid size-9 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-700"><History className="size-4" /></div><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-slate-800">{revision.name}</p><p className="mt-1 text-[10px] text-slate-500">Version {revision.version} · {formatDate(revision.createdAt)}</p></div><button type="button" onClick={() => void restoreRevision(revision.id)} className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50">Restore</button></div>)}{history.length === 0 && <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center"><History className="mx-auto size-5 text-slate-300" /><p className="mt-2 text-xs font-semibold text-slate-700">No versions yet</p><p className="mt-1 text-[10px] text-slate-500">Use Save version to create a restore point.</p></div>}</div>
            <div className="mt-5 flex justify-end border-t border-slate-100 pt-4"><button type="button" onClick={() => setHistoryOpen(false)} className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700">Close</button></div>
          </section>
        </div>}
      </main>
    </>
  );
}
