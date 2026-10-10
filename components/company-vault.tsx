"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowDownToLine,
  ChevronRight,
  Eye,
  X,
  CloudUpload,
  File as FileIcon,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  FolderPlus,
  HardDrive,
  LoaderCircle,
  Pencil,
  ShieldCheck,
  Trash2,
  Upload,
  RefreshCw,
  Search,
  Grid2X2,
  List,
  LockKeyhole,
  CheckCircle2,
  Files,
  Clock3,
  SearchX,
  FileUp,
  Shield
} from "lucide-react";
import WorkspaceSidebar from "@/components/workspace-sidebar";
import { useWorkspaceSidebarState } from "@/components/use-workspace-sidebar-state";
import ConfirmDialog from "@/components/confirm-dialog";

type FolderItem = { id: string; name: string; createdAt: string; updatedAt: string };
type FileItem = { id: string; name: string; mimeType: string; sizeBytes: number; createdAt: string; updatedAt: string };
type Usage = {
  usedBytes: number;
  quotaBytes: number;
  availableBytes: number;
  usedItems: number;
  maxItems: number;
  maxFileBytes: number;
};
type VaultSnapshot = {
  companyName: string;
  currentFolder: { id: string; name: string } | null;
  breadcrumbs: { id: string; name: string }[];
  folders: FolderItem[];
  files: FileItem[];
  nextFolderCursor?: string | null;
  nextFileCursor?: string | null;
  usage: Usage;
};
type ApiEnvelope<T> = { ok: boolean; data?: T; error?: string };
type UploadStart = { uploadId: string; chunkSizeBytes: number; expectedChunks: number; expiresAt: string };
type FolderDialog = { mode: "create" | "rename"; name: string; folderId?: string; originalName?: string };
type ConfirmationTarget = { kind: "folder" | "file"; id: string; name: string };

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | null;
  if (!response.ok || !payload?.ok || payload.data === undefined) {
    throw new Error(payload?.error || "VAULT_REQUEST_FAILED");
  }
  return payload.data;
}

function explainError(code: string) {
  const messages: Record<string, string> = {
    BUNNY_STORAGE_NOT_CONFIGURED: "Vault storage is not configured yet. Add the Bunny Storage Zone name and password to the server environment.",
    BUNNY_STORAGE_CONFIGURATION_INVALID: "The Bunny Storage endpoint must be a valid HTTPS URL.",
    BUNNY_STORAGE_REQUEST_FAILED: "Private storage could not complete this operation. Your company data has not been shared. Please retry.",
    VAULT_USAGE_UNAVAILABLE: "Storage usage could not be updated safely. Refresh the vault and retry.",
    VAULT_FILE_DELETE_FAILED: "The file could not be deleted. Refresh the vault and retry.",
    VAULT_STORAGE_LIMIT_REACHED: "This upload would exceed your company's plan storage quota.",
    VAULT_ITEM_LIMIT_REACHED: "Your plan's maximum stored item count has been reached. Delete an item or contact your administrator.",
    VAULT_FEATURE_NOT_INCLUDED: "Cloud vault is not included in this company's current plan. Ask your platform administrator to enable it on the plan.",
    VAULT_FILE_TOO_LARGE: "This file exceeds the maximum file size for your company's plan.",
    FOLDER_ALREADY_EXISTS: "A folder with that name already exists here.",
    FOLDER_NOT_FOUND: "That folder no longer exists. Refresh the vault and try again.",
    FILE_NOT_FOUND: "That file no longer exists. Refresh the vault and try again.",
    UPLOAD_CHUNKS_INCOMPLETE: "The upload did not finish completely. Please try again.",
    VAULT_REQUEST_FAILED: "The vault request failed. Please try again."
  };
  return messages[code] || code.replaceAll("_", " ").toLowerCase();
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0 B";
  if (value < 1024) return Math.round(value) + " B";
  const units = ["KB", "MB", "GB", "TB"];
  let scaled = value / 1024;
  let index = 0;
  while (scaled >= 1024 && index < units.length - 1) {
    scaled /= 1024;
    index += 1;
  }
  return (scaled >= 100 ? scaled.toFixed(0) : scaled >= 10 ? scaled.toFixed(1) : scaled.toFixed(2)) + " " + units[index];
}

function fileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return FileImage;
  if (mimeType.startsWith("video/")) return FileVideo;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("csv")) return FileSpreadsheet;
  if (mimeType.includes("pdf") || mimeType.startsWith("text/") || mimeType.includes("word") || mimeType.includes("presentation")) return FileText;
  return FileIcon;
}

function displayFileName(name: string) {
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  const knownExtensions = new Set(["jpg", "jpeg", "png", "gif", "webp", "avif", "bmp", "mp4", "webm", "mov", "m4v", "ogg", "pdf", "doc", "docx", "rtf", "odt", "xls", "xlsx", "xlsm", "ods", "csv", "ppt", "pptx", "odp", "txt", "md", "json", "xml"]);
  return dot > 0 && knownExtensions.has(extension) ? name.slice(0, dot) : name;
}

function fileTypeLabel(file: Pick<FileItem, "name" | "mimeType">) {
  const mime = file.mimeType.toLowerCase();
  const dot = file.name.lastIndexOf(".");
  const extension = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : "";
  if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "avif", "bmp"].includes(extension)) return "Image";
  if (mime.startsWith("video/") || ["mp4", "webm", "mov", "m4v", "ogg"].includes(extension)) return "Video";
  if (mime.includes("pdf") || extension === "pdf") return "PDF";
  if (mime.includes("spreadsheet") || mime.includes("excel") || mime.includes("csv") || ["xls", "xlsx", "xlsm", "ods", "csv"].includes(extension)) return "Spreadsheet";
  if (mime.includes("word") || ["doc", "docx", "rtf", "odt"].includes(extension)) return "Word";
  if (mime.includes("presentation") || mime.includes("powerpoint") || ["ppt", "pptx", "odp"].includes(extension)) return "Presentation";
  if (mime.startsWith("text/") || ["txt", "md", "json", "xml"].includes(extension)) return "Text";
  return extension && extension.length <= 8 ? extension.toUpperCase() : "File";
}

function fileAccentClass(file: Pick<FileItem, "name" | "mimeType">) {
  const type = fileTypeLabel(file);
  if (type === "PDF") return "border-rose-100 bg-rose-50 text-rose-700";
  if (type === "Spreadsheet") return "border-emerald-100 bg-emerald-50 text-emerald-700";
  if (type === "Image" || type === "Video") return "border-violet-100 bg-violet-50 text-violet-700";
  return "border-blue-100 bg-blue-50 text-blue-700";
}

function imageThumbnailSupported(mimeType: string) {
  return /^image\/(jpeg|png|gif|webp|avif)$/.test(mimeType);
}

function videoThumbnailSupported(mimeType: string) {
  return /^video\/(mp4|webm|ogg)$/.test(mimeType);
}

type PreparedUpload = { blob: Blob; contentEncoding: "identity" | "gzip" };

function shouldTryLosslessCompression(file: File) {
  // Gzip helps text/data formats; already-compressed media (JPEG, WebP, MP4, PDF,
  // Office ZIP containers) are left byte-for-byte intact to preserve quality and seeking.
  if (file.size < 256 * 1024 || file.size > 64 * 1024 * 1024) return false;
  const mime = file.type.toLowerCase();
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return mime.startsWith("text/") ||
    ["application/json", "application/xml", "application/javascript", "application/x-ndjson"].includes(mime) ||
    ["txt", "md", "csv", "json", "xml", "html", "css", "js", "ts", "log", "sql", "yaml", "yml"].includes(extension);
}

async function prepareLosslessUpload(file: File): Promise<PreparedUpload> {
  if (!shouldTryLosslessCompression(file) || typeof CompressionStream === "undefined") {
    return { blob: file, contentEncoding: "identity" };
  }
  try {
    const compressed = await new Response(
      file.stream().pipeThrough(new CompressionStream("gzip"))
    ).blob();
    // Keep compression only when savings exceed the small gzip framing overhead.
    if (compressed.size + 128 < file.size) return { blob: compressed, contentEncoding: "gzip" };
  } catch {
    // Compression is an optimization only; retain the original bytes on any failure.
  }
  return { blob: file, contentEncoding: "identity" };
}

export default function CompanyVault({ companyName, currentRole, taskManagementEnabled, initialSnapshot }: { companyName: string; currentRole: string; taskManagementEnabled: boolean; initialSnapshot: VaultSnapshot }) {
  const { collapsed: sidebarCollapsed, toggle: toggleSidebar } = useWorkspaceSidebarState();
  const [folderId, setFolderId] = useState<string | null>(initialSnapshot.currentFolder?.id ?? null);
  const [snapshot, setSnapshot] = useState<VaultSnapshot | null>(initialSnapshot);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [uploadPercent, setUploadPercent] = useState(0);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [folderDialog, setFolderDialog] = useState<FolderDialog | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationTarget | null>(null);
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "documents" | "spreadsheets" | "images" | "videos">("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const newMenuRef = useRef<HTMLDivElement>(null);
  const lastLoadedRequestRef = useRef({ folderId: initialSnapshot.currentFolder?.id ?? null, reloadVersion: 0 });

  useEffect(() => {
    if (lastLoadedRequestRef.current.folderId === folderId &&
        lastLoadedRequestRef.current.reloadVersion === reloadVersion) return;
    lastLoadedRequestRef.current = { folderId, reloadVersion };
    let active = true;
    const load = async () => {
      const url = folderId ? "/api/vault?folderId=" + encodeURIComponent(folderId) : "/api/vault";
      try {
        const result = await apiRequest<VaultSnapshot>(url);
        if (!active) return;
        setSnapshot(result);
      } catch (reason) {
        if (!active) return;
        setError(explainError(reason instanceof Error ? reason.message : "VAULT_REQUEST_FAILED"));
        setSnapshot(null);
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [folderId, reloadVersion]);

  useEffect(() => {
    if (!newMenuOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!newMenuRef.current?.contains(event.target as Node)) setNewMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [newMenuOpen]);

  useEffect(() => {
    if (!newMenuOpen && !folderDialog && !previewFile) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (previewFile) setPreviewFile(null);
      else if (folderDialog && !busy) setFolderDialog(null);
      else setNewMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [newMenuOpen, folderDialog, previewFile, busy]);

  const refresh = () => {
    setLoading(true);
    setLoadingMore(false);
    setError("");
    setReloadVersion((version) => version + 1);
  };

  const loadMoreItems = async () => {
    if (!snapshot || loadingMore || (!snapshot.nextFolderCursor && !snapshot.nextFileCursor)) return;
    setLoadingMore(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (folderId) params.set("folderId", folderId);
      params.set("loadMore", "1");
      if (snapshot.nextFolderCursor) params.set("folderCursor", snapshot.nextFolderCursor);
      if (snapshot.nextFileCursor) params.set("fileCursor", snapshot.nextFileCursor);
      const page = await apiRequest<VaultSnapshot>("/api/vault?" + params.toString());
      setSnapshot((current) => {
        if (!current) return page;
        const folderIds = new Set(current.folders.map((folder) => folder.id));
        const fileIds = new Set(current.files.map((file) => file.id));
        return {
          ...current,
          folders: [...current.folders, ...page.folders.filter((folder) => !folderIds.has(folder.id))],
          files: [...current.files, ...page.files.filter((file) => !fileIds.has(file.id))],
          nextFolderCursor: page.nextFolderCursor ?? null,
          nextFileCursor: page.nextFileCursor ?? null,
          usage: page.usage
        };
      });
    } catch (reason) {
      setError(explainError(reason instanceof Error ? reason.message : "VAULT_LIST_FAILED"));
    } finally {
      setLoadingMore(false);
    }
  };

  const navigateToFolder = (nextFolderId: string | null) => {
    if (nextFolderId === folderId) {
      refresh();
      return;
    }
    setLoading(true);
    setError("");
    setFolderId(nextFolderId);
  };

  const createFolder = () => {
    setFolderDialog({ mode: "create", name: "" });
    setError("");
  };

  const renameFolder = (folder: FolderItem) => {
    setFolderDialog({ mode: "rename", folderId: folder.id, name: folder.name, originalName: folder.name });
    setError("");
  };

  const saveFolderDialog = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!folderDialog || busy) return;
    const name = folderDialog.name.trim();
    if (!name) {
      setError("Enter a folder name.");
      return;
    }
    if (folderDialog.mode === "rename" && name === folderDialog.originalName) {
      setFolderDialog(null);
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (folderDialog.mode === "create") {
        await apiRequest("/api/vault/folders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, parentFolderId: folderId })
        });
      } else {
        await apiRequest("/api/vault/folders/" + encodeURIComponent(folderDialog.folderId || ""), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name })
        });
      }
      setFolderDialog(null);
      refresh();
    } catch (reason) {
      setError(explainError(reason instanceof Error ? reason.message : "VAULT_FOLDER_SAVE_FAILED"));
    } finally {
      setBusy(false);
    }
  };

  const deleteFolder = (folder: FolderItem) => {
    setConfirmation({ kind: "folder", id: folder.id, name: folder.name });
  };

  const deleteFile = (file: FileItem) => {
    setConfirmation({ kind: "file", id: file.id, name: file.name });
  };

  const executeConfirmation = async () => {
    if (!confirmation || busy) return;
    const target = confirmation;
    setBusy(true);
    setError("");
    try {
      if (target.kind === "folder") {
        await apiRequest("/api/vault/folders/" + encodeURIComponent(target.id), { method: "DELETE" });
      } else {
        await apiRequest("/api/vault/files/" + encodeURIComponent(target.id), { method: "DELETE" });
      }
      setConfirmation(null);
      if (previewFile?.id === target.id) setPreviewFile(null);
      refresh();
    } catch (reason) {
      setError(explainError(reason instanceof Error ? reason.message : "VAULT_DELETE_FAILED"));
    } finally {
      setBusy(false);
    }
  };

  const startUploads = async (selected: File[]) => {
    if (!selected.length) return;
    if (selected.length > 25) {
      setError("Upload up to 25 files at a time. You can start another batch immediately afterward.");
      return;
    }
    if (snapshot && (snapshot.usage.usedBytes >= snapshot.usage.quotaBytes ||
        snapshot.usage.usedItems >= snapshot.usage.maxItems)) {
      setError(snapshot.usage.usedBytes >= snapshot.usage.quotaBytes
        ? "Your company's storage quota is full. Delete files or ask your administrator to increase the plan's quota."
        : "Your plan's maximum stored item count has been reached. Delete an item or ask your administrator to increase the plan limit.");
      return;
    }

    setBusy(true);
    setError("");
    setUploadPercent(0);
    try {
      for (let fileIndex = 0; fileIndex < selected.length; fileIndex += 1) {
        const file = selected[fileIndex];
        const mayCompress = shouldTryLosslessCompression(file) && typeof CompressionStream !== "undefined";
        setProgress((mayCompress ? "Optimizing text/data locally" : "Preparing upload") +
          " · " + file.name + " (" + (fileIndex + 1) + " of " + selected.length + ")");
        let uploadId: string | null = null;
        try {
          const prepared = await prepareLosslessUpload(file);
          const payload = prepared.blob;
          if (prepared.contentEncoding === "gzip") {
            setProgress("Lossless compression ready · " + file.name + " · " + formatBytes(file.size) + " → " + formatBytes(payload.size));
          } else if (mayCompress) {
            setProgress("Compression not beneficial; uploading original bytes · " + file.name);
          }
          const upload = await apiRequest<UploadStart>("/api/vault/uploads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: file.name,
              size: payload.size,
              originalSize: file.size,
              contentEncoding: prepared.contentEncoding,
              mimeType: file.type,
              folderId
            })
          });
          uploadId = upload.uploadId;

          for (let index = 0; index < upload.expectedChunks; index += 1) {
            const chunkStart = index * upload.chunkSizeBytes;
            const chunk = payload.slice(chunkStart, Math.min(payload.size, chunkStart + upload.chunkSizeBytes));
            const percentage = Math.min(99, Math.floor(
              ((fileIndex + (index + 1) / upload.expectedChunks) / selected.length) * 100
            ));
            setProgress("Uploading " + file.name + " · waiting for Bunny confirmation");
            await apiRequest("/api/vault/uploads/" + upload.uploadId + "/chunks/" + index, {
              method: "PUT",
              headers: { "Content-Type": "application/octet-stream" },
              body: chunk
            });
            // A chunk counts as uploaded only after Bunny returned success. Reserve
            // 100% for final-object confirmation and the committed VaultFile record.
            setUploadPercent(percentage);
            setProgress("Bunny confirmed " + percentage + "% · " + file.name);
          }

          setProgress("Finalizing " + file.name + " in private storage");
          await apiRequest("/api/vault/uploads/" + upload.uploadId + "/complete", { method: "POST" });
          uploadId = null;
        } catch (reason) {
          if (uploadId) {
            await fetch("/api/vault/uploads/" + encodeURIComponent(uploadId), { method: "DELETE" }).catch(() => undefined);
          }
          throw reason;
        }
      }
      setUploadPercent(100);
      setProgress("Upload complete · Bunny confirmed all files");
      setReloadVersion((version) => version + 1);
    } catch (reason) {
      setError(explainError(reason instanceof Error ? reason.message : "VAULT_UPLOAD_FAILED"));
      setReloadVersion((version) => version + 1);
    } finally {
      setBusy(false);
      window.setTimeout(() => setProgress(""), 1200);
    }
  };

  const uploadFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    void startUploads(selected);
  };

  const usedPercent = snapshot?.usage.quotaBytes
    ? Math.min(100, (snapshot.usage.usedBytes / snapshot.usage.quotaBytes) * 100)
    : 0;
  const canManage = currentRole === "COMPANY_ADMIN" || currentRole === "PLATFORM_ADMIN";
  const searchTerm = searchQuery.trim().toLowerCase();
  const visibleFolders = typeFilter === "all"
    ? (snapshot?.folders ?? []).filter((folder) => folder.name.toLowerCase().includes(searchTerm))
    : [];
  const visibleFiles = (snapshot?.files ?? []).filter((file) => {
    const matchesName = file.name.toLowerCase().includes(searchTerm);
    const label = fileTypeLabel(file);
    const matchesType = typeFilter === "all" ||
      (typeFilter === "images" && label === "Image") ||
      (typeFilter === "videos" && label === "Video") ||
      (typeFilter === "spreadsheets" && label === "Spreadsheet") ||
      (typeFilter === "documents" && !["Image", "Video", "Spreadsheet"].includes(label));
    return matchesName && matchesType;
  });
  const visibleCount = visibleFolders.length + visibleFiles.length;
  const folderHasMore = Boolean(snapshot?.nextFolderCursor);
  const fileHasMore = Boolean(snapshot?.nextFileCursor);
  const uploadBlocked = Boolean(snapshot && (
    snapshot.usage.usedBytes >= snapshot.usage.quotaBytes ||
    snapshot.usage.usedItems >= snapshot.usage.maxItems
  ));

  return (
    <>
      <WorkspaceSidebar
        companyName={companyName}
        taskManagementEnabled={taskManagementEnabled}
        vaultEnabled
        canManage={canManage}
        adminManaged={currentRole === "PLATFORM_ADMIN"}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={toggleSidebar}
      />

      <main
        className={`relative min-h-screen bg-slate-50 text-slate-900 ${sidebarCollapsed ? "lg:pl-20" : "lg:pl-72"}`}
        onDragOver={(event) => {
          if (!busy && !uploadBlocked && Array.from(event.dataTransfer.types).includes("Files")) {
            event.preventDefault();
            setDragging(true);
          }
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(event) => {
          if (!Array.from(event.dataTransfer.types).includes("Files")) return;
          event.preventDefault();
          setDragging(false);
          if (!busy && !uploadBlocked) void startUploads(Array.from(event.dataTransfer.files));
        }}
      >
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white">
          <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-3.5 sm:px-7 lg:px-10">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                <Link href="/dashboard" className="transition hover:text-blue-700">Workspace</Link>
                <ChevronRight className="size-3" />
                <span className="text-slate-600">Cloud Vault</span>
              </div>
              <p className="mt-1 truncate text-sm font-semibold text-slate-900">{companyName}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
                          <div className="flex shrink-0 items-center gap-2">
              <div className="relative" ref={newMenuRef}>
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={newMenuOpen}
                  onClick={() => setNewMenuOpen((open) => !open)}
                  disabled={busy || loading}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="text-base leading-none">+</span> New
                </button>
                {newMenuOpen && (
                  <div role="menu" aria-label="Create or upload" className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl shadow-slate-900/10">
                    <button role="menuitem" type="button" onClick={() => { setNewMenuOpen(false); createFolder(); }} className="flex w-full items-center gap-3 px-3 py-3 text-left text-sm text-slate-700 transition hover:bg-slate-50 focus-visible:bg-slate-50">
                      <FolderPlus className="size-4 text-amber-600" /> New folder
                    </button>
                    <button role="menuitem" type="button" disabled={uploadBlocked} onClick={() => { setNewMenuOpen(false); inputRef.current?.click(); }} className="flex w-full items-center gap-3 px-3 py-3 text-left text-sm text-slate-700 transition hover:bg-slate-50 focus-visible:bg-slate-50 disabled:opacity-50">
                      <Upload className="size-4 text-blue-600" /> Upload files
                    </button>
                  </div>
                )}
              </div>
              <input ref={inputRef} type="file" multiple className="hidden" onChange={uploadFiles} aria-label="Choose files to upload" />
            </div>
              <span className="hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-800 sm:inline-flex">
                <LockKeyhole className="size-3.5" />
                Private workspace
              </span>
              <button
                type="button"
                onClick={refresh}
                disabled={busy || loading}
                className="inline-flex size-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
                title="Refresh vault"
                aria-label="Refresh vault"
              >
                <RefreshCw className={"size-4 " + (loading ? "animate-spin" : "")} />
              </button>
              <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50">
                <ArrowLeft className="size-3.5" />
                <span className="hidden md:inline">Workspace</span>
              </Link>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-6 sm:px-7 lg:px-10 lg:py-8">
          <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-blue-700">
                <Shield className="size-3.5" />
                Company file management
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Cloud Vault<span className="text-blue-600">.</span></h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 sm:text-[15px]">
                One organized place for your team’s documents and media. Browse folders, preview supported files, and upload directly to your company’s private storage.
              </p>
            </div>

          </section>

          {error && (
            <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3.5 text-sm text-rose-800 shadow-sm">
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-rose-100 text-xs font-bold">!</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">This action couldn’t be completed</p>
                <p className="mt-0.5 text-xs leading-5 text-rose-700">{error}</p>
              </div>
              <button type="button" onClick={refresh} className="shrink-0 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-800 transition hover:bg-rose-100">Retry</button>
            </div>
          )}

          <section aria-label="Vault storage limits" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-500">Storage used</p>
                <span className="grid size-8 place-items-center rounded-xl bg-blue-50 text-blue-700"><HardDrive className="size-4" /></span>
              </div>
              {snapshot ? (
                <>
                  <p className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">{formatBytes(snapshot.usage.usedBytes)}</p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className={"h-full rounded-full transition-all duration-500 " + (usedPercent >= 95 ? "bg-rose-500" : usedPercent >= 80 ? "bg-amber-500" : "bg-blue-600")} style={{ width: usedPercent + "%" }} />
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500">{Math.round(usedPercent)}% of {formatBytes(snapshot.usage.quotaBytes)}</p>
                </>
              ) : <div className="mt-4 h-10 animate-pulse rounded-lg bg-slate-100" />}
            </article>
            <article className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-500">Available storage</p>
                <span className="grid size-8 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><CheckCircle2 className="size-4" /></span>
              </div>
              {snapshot ? (
                <>
                  <p className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">{formatBytes(snapshot.usage.availableBytes)}</p>
                  <p className="mt-2 text-[11px] text-slate-500">Remaining in your company quota</p>
                </>
              ) : <div className="mt-4 h-10 animate-pulse rounded-lg bg-slate-100" />}
            </article>
            <article className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-500">Stored items</p>
                <span className="grid size-8 place-items-center rounded-xl bg-violet-50 text-violet-700"><Files className="size-4" /></span>
              </div>
              {snapshot ? (
                <>
                  <p className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">{snapshot.usage.usedItems.toLocaleString("en-IN")}</p>
                  <p className="mt-2 text-[11px] text-slate-500">{Math.max(0, snapshot.usage.maxItems - snapshot.usage.usedItems).toLocaleString("en-IN")} item slots remaining</p>
                </>
              ) : <div className="mt-4 h-10 animate-pulse rounded-lg bg-slate-100" />}
            </article>
            <article className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-500">Maximum file size</p>
                <span className="grid size-8 place-items-center rounded-xl bg-amber-50 text-amber-700"><FileUp className="size-4" /></span>
              </div>
              {snapshot ? (
                <>
                  <p className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">{formatBytes(snapshot.usage.maxFileBytes)}</p>
                  <p className="mt-2 text-[11px] text-slate-500">Per file, based on your plan</p>
                </>
              ) : <div className="mt-4 h-10 animate-pulse rounded-lg bg-slate-100" />}
            </article>
          </section>

          {progress && (
            <section className="rounded-2xl border border-blue-200 bg-blue-50/80 p-4 shadow-sm sm:p-5" aria-live="polite">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-blue-700 shadow-sm">
                    {busy ? <LoaderCircle className="size-5 animate-spin" /> : <CheckCircle2 className="size-5" />}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{busy ? "Upload in progress" : "Upload status"}</p>
                    <p className="mt-1 break-words text-xs leading-5 text-slate-600">{progress}</p>
                    <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-blue-700">{busy ? "Waiting for server confirmation" : "Status updated"}</p>
                  </div>
                </div>
                <span className="shrink-0 text-2xl font-semibold tabular-nums tracking-tight text-blue-800">{uploadPercent}%</span>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-blue-100" role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={uploadPercent}>
                <div className="h-full rounded-full bg-blue-600 transition-[width] duration-300 ease-out" style={{ width: uploadPercent + "%" }} />
              </div>
              {busy && <p className="mt-2 text-[11px] text-slate-500">Progress advances after each chunk is accepted. 100% is reserved for completed finalization.</p>}
            </section>
          )}

          <section className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 overflow-hidden rounded-[26px] border border-slate-200/80 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-4 py-5 sm:px-6">
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="grid size-9 place-items-center rounded-xl bg-slate-100 text-slate-700"><Files className="size-4.5" /></span>
                      <div>
                        <h2 className="text-base font-semibold tracking-tight text-slate-950">{snapshot?.currentFolder?.name ?? "All files"}</h2>
                        <p className="mt-0.5 text-xs text-slate-500">Browse the contents of your current folder</p>
                      </div>
                    </div>
                    <nav aria-label="Folder breadcrumbs" className="mt-4 flex max-w-full flex-nowrap items-center gap-1.5 overflow-x-auto whitespace-nowrap text-xs [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      <button type="button" onClick={() => navigateToFolder(null)} className="rounded-lg px-2 py-1.5 font-semibold text-blue-700 transition hover:bg-blue-50">Vault home</button>
                      {(snapshot?.breadcrumbs ?? []).map((item, index) => (
                        <span key={item.id} className="inline-flex min-w-0 items-center gap-1.5">
                          <ChevronRight className="size-3 shrink-0 text-slate-300" />
                          <button
                            type="button"
                            onClick={() => navigateToFolder(item.id)}
                            aria-current={index === (snapshot?.breadcrumbs.length ?? 0) - 1 ? "page" : undefined}
                            className={"max-w-40 truncate rounded-lg px-2 py-1.5 transition hover:bg-slate-100 " + (index === (snapshot?.breadcrumbs.length ?? 0) - 1 ? "font-semibold text-slate-900" : "text-slate-500")}
                          >
                            {item.name}
                          </button>
                        </span>
                      ))}
                    </nav>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1" aria-label="View mode">
                      <button type="button" aria-label="Grid view" aria-pressed={viewMode === "grid"} onClick={() => setViewMode("grid")} className={"grid size-8 place-items-center rounded-lg transition " + (viewMode === "grid" ? "bg-white text-blue-700 shadow-sm ring-1 ring-slate-200" : "text-slate-400 hover:text-slate-700")}>
                        <Grid2X2 className="size-4" />
                      </button>
                      <button type="button" aria-label="List view" aria-pressed={viewMode === "list"} onClick={() => setViewMode("list")} className={"grid size-8 place-items-center rounded-lg transition " + (viewMode === "list" ? "bg-white text-blue-700 shadow-sm ring-1 ring-slate-200" : "text-slate-400 hover:text-slate-700")}>
                        <List className="size-4" />
                      </button>
                    </div>
                    <button type="button" onClick={refresh} disabled={busy || loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">
                      <RefreshCw className={"size-3.5 " + (loading ? "animate-spin" : "")} />
                      Refresh
                    </button>
                  </div>
                </div>

                <div className="mt-5 grid gap-4">
                  <label className="relative block min-w-0">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search files and folders…"
                      aria-label="Search loaded vault items by name"
                      className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-10 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
                    />
                    {searchQuery && (
                      <button type="button" aria-label="Clear search" onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                        <X className="size-3.5" />
                      </button>
                    )}
                  </label>
                  <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter files by type">
                    {([
                      ["all", "All"],
                      ["documents", "Documents"],
                      ["spreadsheets", "Spreadsheets"],
                      ["images", "Images"],
                      ["videos", "Videos"]
                    ] as const).map(([value, label]) => (
                      <button key={value} type="button" aria-pressed={typeFilter === value} onClick={() => setTypeFilter(value)} className={"rounded-full border px-3.5 py-2 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 " + (typeFilter === value ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700")}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="px-4 py-4 sm:px-6 sm:py-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <p className="text-xs font-medium text-slate-500">
                    {loading ? "Refreshing contents…" : visibleCount.toLocaleString("en-IN") + " visible item" + (visibleCount === 1 ? "" : "s")}
                    {searchTerm ? " matching your search" : ""}
                  </p>
                  {snapshot && (snapshot.nextFolderCursor || snapshot.nextFileCursor) && (
                    <p className="text-[10px] text-slate-400">Showing loaded items only</p>
                  )}
                </div>

                {loading ? (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 6 }, (_, index) => (
                      <div key={index} className="rounded-2xl border border-slate-200 p-3">
                        <div className="h-28 animate-pulse rounded-xl bg-slate-100" />
                        <div className="mt-4 h-3 w-3/5 animate-pulse rounded bg-slate-100" />
                        <div className="mt-2 h-2.5 w-2/5 animate-pulse rounded bg-slate-100" />
                      </div>
                    ))}
                  </div>
                ) : !snapshot ? (
                  <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                    <div>
                      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-white text-slate-400 shadow-sm"><HardDrive className="size-6" /></span>
                      <p className="mt-3 text-sm font-semibold text-slate-900">Your vault couldn’t be loaded</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">Check your connection and try refreshing the folder.</p>
                      <button type="button" onClick={refresh} className="mt-4 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-blue-700">Try again</button>
                    </div>
                  </div>
                ) : visibleCount === 0 && (searchTerm || typeFilter !== "all") ? (
                  <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                    <div>
                      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-white text-slate-400 shadow-sm"><SearchX className="size-6" /></span>
                      <p className="mt-3 text-sm font-semibold text-slate-900">No matching items</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">Try a different name or clear the selected filters. Search covers items loaded in this folder so far.</p>
                      <button type="button" onClick={() => { setSearchQuery(""); setTypeFilter("all"); }} className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100">Clear filters</button>
                    </div>
                  </div>
                ) : visibleCount === 0 ? (
                  <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-8 text-center">
                    <div className="max-w-sm">
                      <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-white text-blue-700 shadow-sm"><FolderPlus className="size-7" /></span>
                      <p className="mt-4 text-base font-semibold text-slate-950">{snapshot.currentFolder ? "This folder is ready for its first item" : "Start building your company vault"}</p>
                      <p className="mt-2 text-xs leading-6 text-slate-500">Create a folder to keep work organized, or upload documents and media. New items are added to the folder currently open.</p>
                      <div className="mt-5 flex flex-wrap justify-center gap-2">
                        <button type="button" onClick={createFolder} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"><FolderPlus className="size-3.5" /> Create folder</button>
                        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy || uploadBlocked} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"><Upload className="size-3.5" /> Upload files</button>
                      </div>
                    </div>
                  </div>
                ) : viewMode === "grid" ? (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {visibleFolders.length > 0 && <h3 className="col-span-full border-b border-slate-100 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Folders</h3>}
                    {visibleFolders.map((folder) => (
                      <article key={folder.id} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-slate-900/5">
                        <button type="button" onClick={() => navigateToFolder(folder.id)} className="block w-full p-3 text-left" aria-label={"Open folder " + folder.name}>
                          <div className="relative grid h-28 place-items-center overflow-hidden rounded-xl border border-amber-100 bg-amber-50">
                            <Folder className="relative size-12 fill-amber-400/20 text-amber-600 stroke-[1.4] transition duration-200 group-hover:scale-105" />
                            <span className="absolute bottom-2 left-2 rounded-md border border-amber-200/70 bg-white/80 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-amber-800">Folder</span>
                          </div>
                          <div className="mt-3 flex items-start justify-between gap-2">
                            <span className="min-w-0 truncate text-sm font-semibold text-slate-800" title={folder.name}>{folder.name}</span>
                            <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-500" />
                          </div>
                          <p className="mt-1 inline-flex items-center gap-1.5 text-[10px] text-slate-400"><Clock3 className="size-3" /> Updated {new Date(folder.updatedAt).toLocaleDateString()}</p>
                        </button>
                        <div className="flex justify-end gap-1 border-t border-slate-100 bg-slate-50/60 px-3 py-2">
                          <button type="button" disabled={busy} onClick={() => renameFolder(folder)} title="Rename folder" aria-label={"Rename " + folder.name} className="grid size-8 place-items-center rounded-lg text-slate-400 transition hover:bg-white hover:text-slate-800 disabled:opacity-40"><Pencil className="size-3.5" /></button>
                          <button type="button" disabled={busy} onClick={() => deleteFolder(folder)} title="Delete folder and contents" aria-label={"Delete " + folder.name} className="grid size-8 place-items-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"><Trash2 className="size-3.5" /></button>
                        </div>
                      </article>
                    ))}
                    {visibleFiles.length > 0 && <h3 className="col-span-full border-b border-slate-100 pb-2 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Files</h3>}
                    {visibleFiles.map((file) => {
                      const Icon = fileIcon(file.mimeType);
                      const label = fileTypeLabel(file);
                      const previewUrl = "/api/vault/files/" + encodeURIComponent(file.id) + "?inline=1";
                      const isImage = imageThumbnailSupported(file.mimeType) && !file.mimeType.includes("svg");
                      const isVideo = videoThumbnailSupported(file.mimeType);
                      return (
                        <article key={file.id} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-slate-900/5">
                          <button type="button" draggable={false} onDragStart={(event) => event.preventDefault()} onContextMenu={(event) => event.preventDefault()} onClick={() => setPreviewFile(file)} className="block w-full select-none p-3 text-left" title={"Preview " + file.name}>
                            <div className="relative grid h-28 place-items-center overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                              {isImage ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={previewUrl} alt="" draggable={false} referrerPolicy="no-referrer" loading="lazy" decoding="async" onDragStart={(event) => event.preventDefault()} onContextMenu={(event) => event.preventDefault()} className="pointer-events-none size-full select-none object-cover transition duration-300 group-hover:scale-[1.03]" />
                              ) : isVideo ? (
                                <video
                                  src={previewUrl}
                                  muted
                                  playsInline
                                  preload="metadata"
                                  draggable={false}
                                  controlsList="nodownload noremoteplayback"
                                  disablePictureInPicture
                                  disableRemotePlayback
                                  onDragStart={(event) => event.preventDefault()}
                                  onContextMenu={(event) => event.preventDefault()}
                                  tabIndex={-1}
                                  aria-hidden="true"
                                  onLoadedData={(event) => {
                                    const video = event.currentTarget;
                                    if (Number.isFinite(video.duration) && video.duration > 0.5) video.currentTime = Math.min(1, video.duration / 2);
                                  }}
                                  className="pointer-events-none size-full select-none object-cover"
                                />
                              ) : (
                                <div className={"grid size-16 place-items-center rounded-2xl border shadow-sm transition duration-200 group-hover:scale-105 " + fileAccentClass(file)}>
                                  <Icon className="size-8 stroke-[1.5]" />
                                </div>
                              )}
                              {isVideo && <div className="pointer-events-none absolute inset-0 grid place-items-center"><span className="grid size-9 place-items-center rounded-full bg-white/90 text-slate-700"><FileVideo className="size-4" /></span></div>}
                              <span className="absolute left-2 top-2 rounded-md border border-white/80 bg-white/90 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-slate-600 shadow-sm">{label}</span>
                            </div>
                            <div className="mt-3 flex items-start justify-between gap-2">
                              <span className="min-w-0 truncate text-sm font-semibold text-slate-800" title={file.name}>{displayFileName(file.name)}</span>
                              <span className="shrink-0 whitespace-nowrap text-[10px] tabular-nums text-slate-400">{formatBytes(file.sizeBytes)}</span>
                            </div>
                            <p className="mt-1 truncate text-[10px] text-slate-400">{file.name}</p>
                            <p className="mt-2 inline-flex items-center gap-1.5 text-[10px] text-slate-400"><Clock3 className="size-3" /> {new Date(file.updatedAt).toLocaleDateString()}</p>
                          </button>
                          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-3 py-2">
                            <span className="inline-flex max-w-[70%] items-center gap-1.5 truncate text-[10px] font-medium text-slate-500"><LockKeyhole className="size-3 shrink-0 text-emerald-600" /> Private file</span>
                            <div className="flex gap-1">
                              <button type="button" disabled={busy} onClick={() => setPreviewFile(file)} title="Preview file" aria-label={"Preview " + file.name} className="grid size-8 place-items-center rounded-lg text-slate-400 transition hover:bg-violet-50 hover:text-violet-700 disabled:opacity-40"><Eye className="size-3.5" /></button>
                               <a href={"/api/vault/files/" + encodeURIComponent(file.id)} title="Download file" aria-label={"Download " + file.name} className="grid size-8 place-items-center rounded-lg text-slate-400 transition hover:bg-blue-50 hover:text-blue-700"><ArrowDownToLine className="size-3.5" /></a>
                              <button type="button" disabled={busy} onClick={() => deleteFile(file)} title="Delete file" aria-label={"Delete " + file.name} className="grid size-8 place-items-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"><Trash2 className="size-3.5" /></button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-slate-200">
                    <div className="hidden grid-cols-[minmax(0,1fr)_120px_100px_140px_104px] gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500 lg:grid">
                      <span>Name</span><span>Type</span><span>File size</span><span>Last modified</span><span className="text-right">Actions</span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {visibleFolders.length > 0 && <div className="bg-slate-50/80 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Folders</div>}
                      {visibleFolders.map((folder) => (
                        <div key={folder.id} className="grid grid-cols-1 gap-2 px-3 py-3 transition hover:bg-slate-50 lg:grid-cols-[minmax(0,1fr)_120px_100px_140px_104px] lg:items-center lg:gap-4 lg:px-4">
                          <button type="button" onClick={() => navigateToFolder(folder.id)} className="flex min-w-0 items-center gap-3 text-left">
                            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600"><Folder className="size-5" /></span>
                            <span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-800">{folder.name}</span><span className="mt-1 block text-[10px] text-slate-400">Folder</span></span>
                          </button>
                          <span className="hidden text-xs text-slate-500 lg:block">Folder</span>
                          <span className="hidden text-xs text-slate-400 lg:block">—</span>
                          <span className="hidden text-xs text-slate-500 lg:block">{new Date(folder.updatedAt).toLocaleDateString()}</span>
                          <div className="flex justify-end gap-1">
                            <button type="button" disabled={busy} onClick={() => renameFolder(folder)} title="Rename folder" aria-label={"Rename " + folder.name} className="grid size-8 place-items-center rounded-lg text-slate-400 transition hover:bg-white hover:text-slate-800 disabled:opacity-40"><Pencil className="size-3.5" /></button>
                            <button type="button" disabled={busy} onClick={() => deleteFolder(folder)} title="Delete folder and contents" aria-label={"Delete " + folder.name} className="grid size-8 place-items-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"><Trash2 className="size-3.5" /></button>
                          </div>
                        </div>
                      ))}
                      {visibleFiles.length > 0 && <div className="bg-slate-50/80 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Files</div>}
                      {visibleFiles.map((file) => {
                        const Icon = fileIcon(file.mimeType);
                        const label = fileTypeLabel(file);
                        return (
                          <div key={file.id} className="grid grid-cols-1 gap-2 px-3 py-3 transition hover:bg-slate-50 lg:grid-cols-[minmax(0,1fr)_120px_100px_140px_104px] lg:items-center lg:gap-4 lg:px-4">
                            <button type="button" onClick={() => setPreviewFile(file)} className="flex min-w-0 items-center gap-3 text-left">
                              <span className={"grid size-10 shrink-0 place-items-center rounded-xl border " + fileAccentClass(file)}><Icon className="size-5" /></span>
                              <span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-800">{file.name}</span><span className="mt-1 block truncate text-[10px] text-slate-400 lg:hidden">{formatBytes(file.sizeBytes)} · {label}</span></span>
                            </button>
                            <span className="hidden text-xs text-slate-500 lg:block">{label}</span>
                            <span className="hidden text-xs text-slate-600 lg:block">{formatBytes(file.sizeBytes)}</span>
                            <span className="hidden text-xs text-slate-500 lg:block">{new Date(file.updatedAt).toLocaleDateString()}</span>
                            <div className="flex justify-end gap-1">
                              <button type="button" disabled={busy} onClick={() => setPreviewFile(file)} title="Preview file" aria-label={"Preview " + file.name} className="grid size-8 place-items-center rounded-lg text-slate-400 transition hover:bg-violet-50 hover:text-violet-700 disabled:opacity-40"><Eye className="size-3.5" /></button>
                              <a href={"/api/vault/files/" + encodeURIComponent(file.id)} title="Download file" aria-label={"Download " + file.name} className="grid size-8 place-items-center rounded-lg text-slate-400 transition hover:bg-blue-50 hover:text-blue-700"><ArrowDownToLine className="size-3.5" /></a>
                              <button type="button" disabled={busy} onClick={() => deleteFile(file)} title="Delete file" aria-label={"Delete " + file.name} className="grid size-8 place-items-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"><Trash2 className="size-3.5" /></button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {(folderHasMore || fileHasMore) && !loading && (
                  <div className="mt-5 flex flex-col items-center gap-2 border-t border-slate-100 pt-5">
                    <button
                      type="button"
                      onClick={() => void loadMoreItems()}
                      disabled={loadingMore || busy}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loadingMore && <LoaderCircle className="size-4 animate-spin" />}
                      {loadingMore ? "Loading more items…" : searchTerm ? "Load more items to extend search" : "Load more items"}
                    </button>
                    <p className="text-[10px] text-slate-400">Items load in small pages to keep the vault responsive.</p>
                  </div>
                )}
              </div>
            </div>

            <aside className="space-y-4">
              <section className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Storage overview</p>
                    <h3 className="mt-1 text-base font-semibold text-slate-950">Your quota</h3>
                  </div>
                  <span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><HardDrive className="size-5" /></span>
                </div>
                {snapshot ? (
                  <>
                    <div className="mt-6 flex items-end justify-between gap-3">
                      <p className="text-2xl font-semibold tracking-tight text-slate-950">{formatBytes(snapshot.usage.usedBytes)}</p>
                      <p className="pb-1 text-[11px] font-medium text-slate-500">of {formatBytes(snapshot.usage.quotaBytes)}</p>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className={"h-full rounded-full transition-all duration-500 " + (usedPercent >= 95 ? "bg-rose-500" : usedPercent >= 80 ? "bg-amber-500" : "bg-blue-600")} style={{ width: usedPercent + "%" }} />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px]">
                      <span className="text-slate-500">{Math.round(usedPercent)}% used</span>
                      <span className="font-semibold text-slate-700">{formatBytes(snapshot.usage.availableBytes)} free</span>
                    </div>
                    <div className="my-5 border-t border-slate-100" />
                    <div className="space-y-3 text-xs">
                      <div className="flex items-center justify-between gap-3"><span className="text-slate-500">Items stored</span><span className="font-semibold tabular-nums text-slate-800">{snapshot.usage.usedItems.toLocaleString("en-IN")} / {snapshot.usage.maxItems.toLocaleString("en-IN")}</span></div>
                      <div className="flex items-center justify-between gap-3"><span className="text-slate-500">Max file size</span><span className="font-semibold text-slate-800">{formatBytes(snapshot.usage.maxFileBytes)}</span></div>
                    </div>
                    {uploadBlocked && (
                      <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                        <p className="font-semibold">Upload capacity reached</p>
                        <p className="mt-1">Delete unneeded items or ask your administrator about your plan’s limits.</p>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="mt-5 rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-500">Storage usage will appear when the vault connects.</p>
                )}
              </section>

              <section className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex items-center gap-2">
                  <span className="grid size-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><ShieldCheck className="size-4.5" /></span>
                  <h3 className="text-sm font-semibold text-slate-900">Private by access</h3>
                </div>
                <p className="mt-3 text-xs leading-6 text-slate-500">Vault actions are checked against your signed-in company and workspace. File transfers use the authenticated app route; storage credentials are kept on the server.</p>
                <div className="mt-4 flex items-start gap-2 rounded-xl bg-slate-50 p-3">
                  <LockKeyhole className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                  <p className="text-[10px] leading-5 text-slate-500">Only share your account with people who should have access to this workspace.</p>
                </div>
              </section>

              <section className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Supported content</p>
                <h3 className="mt-1 text-sm font-semibold text-slate-900">Work with your files</h3>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {[
                    ["PDF & text", FileText],
                    ["Images", FileImage],
                    ["Spreadsheets", FileSpreadsheet],
                    ["Video", FileVideo]
                  ].map(([label, Icon]) => {
                    const ContentIcon = Icon as typeof FileText;
                    return (
                      <div key={label as string} className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-2.5 py-2.5">
                        <ContentIcon className="size-4 shrink-0 text-slate-500" />
                        <span className="text-[10px] font-medium text-slate-600">{label as string}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-4 text-[10px] leading-5 text-slate-400">Office documents remain available to download even when an in-browser preview is not supported.</p>
              </section>
            </aside>
          </section>
        </div>
        {dragging && (
          <div aria-live="polite" className="pointer-events-none absolute inset-0 z-40 grid place-items-center bg-white/90 p-6">
            <div className="flex max-w-lg flex-col items-center rounded-2xl border-2 border-dashed border-blue-400 bg-blue-50/90 px-8 py-12 text-center shadow-sm">
              <span className="grid size-14 place-items-center rounded-2xl bg-white text-blue-700"><CloudUpload className="size-7" /></span>
              <p className="mt-4 text-lg font-semibold text-slate-950">Drop files to upload</p>
              <p className="mt-1 text-sm text-slate-600">Files will be added to {snapshot?.currentFolder?.name ?? "Vault"} using your company’s private storage.</p>
            </div>
          </div>
        )}
      </main>

      <ConfirmDialog
        open={Boolean(confirmation)}
        title={confirmation?.kind === "folder" ? "Delete folder and its contents?" : "Delete this file?"}
        description={confirmation?.kind === "folder"
          ? "This permanently removes “" + (confirmation?.name || "") + "”, all nested folders, and their files from the company's vault."
          : "This permanently deletes “" + (confirmation?.name || "") + "” from the company's vault."}
        confirmLabel={confirmation?.kind === "folder" ? "Delete folder" : "Delete file"}
        destructive
        busy={busy}
        onCancel={() => { if (!busy) setConfirmation(null); }}
        onConfirm={() => void executeConfirmation()}
      />

      {folderDialog && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-900/25 p-4" role="dialog" aria-modal="true" aria-labelledby="vault-folder-dialog-title" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setFolderDialog(null); }}>
          <form onSubmit={(event) => void saveFolderDialog(event)} className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10">
            <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><FolderPlus className="size-5" /></span>
                <button type="button" aria-label="Close folder dialog" disabled={busy} onClick={() => setFolderDialog(null)} className="grid size-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 disabled:opacity-50"><X className="size-4" /></button>
              </div>
              <h2 id="vault-folder-dialog-title" className="mt-4 text-lg font-semibold text-slate-950">{folderDialog.mode === "create" ? "Create a folder" : "Rename folder"}</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">{folderDialog.mode === "create" ? "Keep related files together in the folder you’re currently viewing." : "Choose a clear name. Renaming keeps the folder’s existing files in place."}</p>
            </div>
            <div className="p-5">
              <label className="block text-xs font-semibold text-slate-700">
                Folder name
                <input autoFocus autoComplete="off" maxLength={100} value={folderDialog.name} onChange={(event) => setFolderDialog((current) => current ? { ...current, name: event.target.value } : current)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10" placeholder="e.g. Contracts, Projects, Invoices" />
              </label>
              <p className="mt-2 text-right text-[10px] text-slate-400">{folderDialog.name.length}/100 characters</p>
              {error && <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setFolderDialog(null)} disabled={busy} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={busy || !folderDialog.name.trim()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50">
                {busy && <LoaderCircle className="size-3.5 animate-spin" />}
                {busy ? "Saving…" : folderDialog.mode === "create" ? "Create folder" : "Save changes"}
              </button>
            </div>
          </form>
        </div>
      )}

      {previewFile && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-900/30 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="vault-preview-title" onContextMenu={(event) => event.preventDefault()} onDragStart={(event) => event.preventDefault()} onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewFile(null); }}>
          <section className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-[26px] border border-white/15 bg-white shadow-xl shadow-slate-900/10">
            <header className="flex items-center justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <span className={"grid size-10 shrink-0 place-items-center rounded-xl border " + fileAccentClass(previewFile)}>{(() => { const PreviewIcon = fileIcon(previewFile.mimeType); return <PreviewIcon className="size-5" />; })()}</span>
                <div className="min-w-0">
                  <h2 id="vault-preview-title" className="truncate text-sm font-semibold text-slate-950" title={previewFile.name}>{previewFile.name}</h2>
                  <p className="mt-1 truncate text-[11px] text-slate-500">{fileTypeLabel(previewFile)} · {formatBytes(previewFile.sizeBytes)} · Access checked by your company session</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <a href={"/api/vault/files/" + encodeURIComponent(previewFile.id)} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3.5 py-2.5 text-xs font-semibold text-white transition hover:bg-blue-700">
                  <ArrowDownToLine className="size-3.5" /><span className="hidden sm:inline">Download file</span><span className="sm:hidden">Download</span>
                </a>
                <button type="button" aria-label="Close preview" onClick={() => setPreviewFile(null)} className="grid size-9 place-items-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"><X className="size-4" /></button>
              </div>
            </header>
            <div className="flex min-h-[45vh] flex-1 items-center justify-center overflow-auto bg-slate-100 p-3 sm:p-6">
              {previewFile.mimeType.startsWith("image/") && !previewFile.mimeType.includes("svg") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={"/api/vault/files/" + encodeURIComponent(previewFile.id) + "?inline=1"} alt={previewFile.name} draggable={false} referrerPolicy="no-referrer" onDragStart={(event) => event.preventDefault()} onContextMenu={(event) => event.preventDefault()} className="mx-auto max-h-[76vh] max-w-full rounded-xl object-contain shadow-sm" />
              ) : previewFile.mimeType.startsWith("video/") && /^(video\/(mp4|webm|ogg))$/.test(previewFile.mimeType) ? (
                <video controls controlsList="nodownload noremoteplayback" disablePictureInPicture disableRemotePlayback draggable={false} onDragStart={(event) => event.preventDefault()} onContextMenu={(event) => event.preventDefault()} preload="metadata" src={"/api/vault/files/" + encodeURIComponent(previewFile.id) + "?inline=1"} className="mx-auto max-h-[76vh] max-w-full rounded-xl bg-slate-200 shadow-sm" />
              ) : /^(application\/pdf|text\/(plain|csv)|application\/json)$/.test(previewFile.mimeType) ? (
                <iframe title={"Preview " + previewFile.name} sandbox="" referrerPolicy="no-referrer" src={"/api/vault/files/" + encodeURIComponent(previewFile.id) + "?inline=1"} className="h-[76vh] w-full rounded-xl border border-slate-200 bg-white shadow-sm" />
              ) : (
                <div className="grid min-h-[45vh] place-items-center p-5">
                  <div className="max-w-md text-center">
                    <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-white text-blue-700 shadow-sm"><FileText className="size-7" /></span>
                    <p className="mt-4 text-base font-semibold text-slate-900">Preview isn’t available for this format</p>
                    <p className="mt-2 text-xs leading-6 text-slate-500">Your file remains in private storage. Download the original to open it with a compatible application.</p>
                    <a href={"/api/vault/files/" + encodeURIComponent(previewFile.id)} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-blue-700"><ArrowDownToLine className="size-3.5" /> Download original</a>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
