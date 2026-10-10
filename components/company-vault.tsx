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
  RefreshCw
} from "lucide-react";
import WorkspaceSidebar from "@/components/workspace-sidebar";
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

function imageThumbnailSupported(mimeType: string) {
  return /^image\/(jpeg|png|gif|webp|avif)$/.test(mimeType);
}

function videoThumbnailSupported(mimeType: string) {
  return /^video\/(mp4|webm|ogg)$/.test(mimeType);
}

export default function CompanyVault({ companyName, currentRole }: { companyName: string; currentRole: string }) {
  const [folderId, setFolderId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<VaultSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [uploadPercent, setUploadPercent] = useState(0);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [folderDialog, setFolderDialog] = useState<FolderDialog | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationTarget | null>(null);
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
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

  const refresh = () => {
    setLoading(true);
    setError("");
    setReloadVersion((version) => version + 1);
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
        setProgress("Preparing " + file.name + " (" + (fileIndex + 1) + " of " + selected.length + ")");
        let uploadId: string | null = null;
        try {
          const upload = await apiRequest<UploadStart>("/api/vault/uploads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: file.name,
              size: file.size,
              mimeType: file.type,
              folderId
            })
          });
          uploadId = upload.uploadId;

          for (let index = 0; index < upload.expectedChunks; index += 1) {
            const chunkStart = index * upload.chunkSizeBytes;
            const chunk = file.slice(chunkStart, Math.min(file.size, chunkStart + upload.chunkSizeBytes));
            const percentage = Math.round(((fileIndex + (index + 1) / upload.expectedChunks) / selected.length) * 100);
            setUploadPercent(percentage);
            setProgress("Uploading " + file.name + " — " + percentage + "%");
            await apiRequest("/api/vault/uploads/" + upload.uploadId + "/chunks/" + index, {
              method: "PUT",
              headers: { "Content-Type": "application/octet-stream" },
              body: chunk
            });
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
      setProgress("Upload complete");
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
  const usedFiles = (snapshot?.folders.length ?? 0) + (snapshot?.files.length ?? 0);
  const uploadBlocked = Boolean(snapshot && (
    snapshot.usage.usedBytes >= snapshot.usage.quotaBytes ||
    snapshot.usage.usedItems >= snapshot.usage.maxItems
  ));

  return (
    <>
      <WorkspaceSidebar
        companyName={companyName}
        vaultEnabled
        canManage={canManage}
        adminManaged={currentRole === "PLATFORM_ADMIN"}
      />
      <main className="min-h-screen bg-slate-50 lg:pl-72">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-4 sm:px-7 lg:px-10">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <Link href="/dashboard" className="hover:text-blue-700">Workspace</Link>
                <ChevronRight className="size-3.5" />
                <span className="text-slate-800">Company vault</span>
              </div>
              <h1 className="mt-1 truncate text-xl font-semibold tracking-tight text-slate-950">{companyName} vault</h1>
            </div>
            <Link href="/dashboard" className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
              <ArrowLeft className="size-4" />
              <span className="hidden sm:inline">Overview</span>
            </Link>
          </div>
        </header>

        <div className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 sm:px-7 lg:px-10 lg:py-8">
          {error && (
            <div role="alert" className="flex items-start justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              <span>{error}</span>
              <button type="button" onClick={refresh} className="shrink-0 font-semibold underline">Retry</button>
            </div>
          )}

          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
              <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
                <div className="flex items-start gap-3">
                  <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-700">
                    <HardDrive className="size-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-950">Private company vault</h2>
                    <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                      Store documents, spreadsheets, PDFs, presentations, images, and videos in your company’s isolated storage.
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" disabled={busy || loading} onClick={createFolder} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
                    <FolderPlus className="size-4" />
                    New folder
                  </button>
                  <button type="button" disabled={busy || loading || uploadBlocked} onClick={() => inputRef.current?.click()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-3.5 py-2.5 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                    {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />}
                    Upload files
                  </button>
                  <input ref={inputRef} type="file" multiple className="hidden" onChange={uploadFiles} aria-label="Choose files to upload" />
                </div>
              </div>

              <div
                onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
                onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  void startUploads(Array.from(event.dataTransfer.files));
                }}
                className={"mt-5 rounded-2xl border border-dashed px-4 py-4 text-center transition " + (dragging ? "border-blue-500 bg-blue-50" : uploadBlocked ? "border-slate-200 bg-slate-50" : "border-slate-300 bg-slate-50/70")}
              >
                <CloudUpload className={"mx-auto size-5 " + (dragging ? "text-blue-600" : "text-slate-400")} />
                <p className="mt-2 text-xs font-semibold text-slate-700">{uploadBlocked ? "Upload limit reached" : dragging ? "Drop files to upload" : "Drag and drop files here"}</p>
                <p className="mt-1 text-[11px] leading-5 text-slate-500">{snapshot ? formatBytes(snapshot.usage.maxFileBytes) + " maximum per file · " + Math.max(0, snapshot.usage.maxItems - snapshot.usage.usedItems).toLocaleString("en-IN") + " item slots available" : "Choose files from this device or drop them here"}</p>
                {!uploadBlocked && <button type="button" disabled={busy || loading} onClick={() => inputRef.current?.click()} className="mt-2 text-xs font-semibold text-blue-700 underline underline-offset-2 disabled:opacity-50">Browse device</button>}
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 text-sm">
                <button type="button" onClick={() => navigateToFolder(null)} className="font-semibold text-blue-700 hover:text-blue-900">Vault</button>
                {(snapshot?.breadcrumbs ?? []).map((item, index) => (
                  <span key={item.id} className="inline-flex items-center gap-2">
                    <ChevronRight className="size-3.5 text-slate-400" />
                    <button
                      type="button"
                      onClick={() => navigateToFolder(item.id)}
                      className={index === (snapshot?.breadcrumbs.length ?? 0) - 1 ? "max-w-48 truncate font-semibold text-slate-900" : "max-w-48 truncate text-slate-500 hover:text-blue-700"}
                    >
                      {item.name}
                    </button>
                  </span>
                ))}
                <button type="button" onClick={refresh} disabled={busy} className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 disabled:opacity-50" title="Refresh vault">
                  <RefreshCw className="size-3.5" />
                  Refresh
                </button>
              </div>

              {progress && <p role="status" className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-xs font-medium text-blue-800">{progress}</p>}
              {busy && (
                <div className="mt-2" aria-label={"Upload progress " + uploadPercent + "%"} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={uploadPercent}>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-blue-600 transition-[width] duration-200" style={{ width: uploadPercent + "%" }} />
                  </div>
                  <p className="mt-1 text-right text-[11px] tabular-nums text-slate-500">{uploadPercent}%</p>
                </div>
              )}

              <div className="mt-4">
                {loading ? (
                  <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-14 text-sm text-slate-500">
                    <LoaderCircle className="size-4 animate-spin" />
                    Loading private files…
                  </div>
                ) : !snapshot ? (
                  <div className="rounded-2xl border border-slate-200 bg-white px-5 py-12 text-center text-sm text-slate-500">The vault could not be loaded.</div>
                ) : usedFiles === 0 ? (
                  <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center">
                    <div className="grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-500">
                      <CloudUpload className="size-6" />
                    </div>
                    <p className="mt-3 text-sm font-semibold text-slate-900">This folder is empty</p>
                    <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">Create a folder or upload files. New folders and uploads stay inside the folder currently open. Items are visible only to authorized members of {companyName}.</p>
                    <div className="mt-4 flex gap-2">
                      <button type="button" onClick={createFolder} disabled={busy} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Create folder</button>
                      <button type="button" onClick={() => inputRef.current?.click()} disabled={busy || uploadBlocked} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">Upload files</button>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {snapshot.folders.map((folder) => (
                      <article key={folder.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:border-blue-300 hover:shadow-sm">
                        <button type="button" onClick={() => navigateToFolder(folder.id)} className="block w-full p-3 text-left">
                          <div className="grid h-32 place-items-center rounded-xl bg-amber-50 text-amber-600">
                            <Folder className="size-12 stroke-[1.4]" />
                          </div>
                          <div className="mt-3 flex items-start justify-between gap-2">
                            <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-800">
                              <Folder className="size-4 shrink-0 text-amber-600" />
                              <span className="truncate">{folder.name}</span>
                            </span>
                            <span className="shrink-0 rounded-md bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">Folder</span>
                          </div>
                          <p className="mt-1 text-[11px] text-slate-400">Updated {new Date(folder.updatedAt).toLocaleDateString()}</p>
                        </button>
                        <div className="flex justify-end gap-1 border-t border-slate-100 px-3 py-2">
                          <button type="button" disabled={busy} onClick={() => void renameFolder(folder)} title="Rename folder" aria-label={"Rename " + folder.name} className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40"><Pencil className="size-3.5" /></button>
                          <button type="button" disabled={busy} onClick={() => void deleteFolder(folder)} title="Delete folder and contents" aria-label={"Delete " + folder.name} className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"><Trash2 className="size-3.5" /></button>
                        </div>
                      </article>
                    ))}
                    {snapshot.files.map((file) => {
                      const Icon = fileIcon(file.mimeType);
                      const label = fileTypeLabel(file);
                      const previewUrl = "/api/vault/files/" + encodeURIComponent(file.id) + "?inline=1";
                      const isImage = imageThumbnailSupported(file.mimeType) && !file.mimeType.includes("svg");
                      const isVideo = videoThumbnailSupported(file.mimeType);
                      return (
                        <article key={file.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:border-blue-300 hover:shadow-sm">
                          <button type="button" draggable={false} onDragStart={(event) => event.preventDefault()} onContextMenu={(event) => event.preventDefault()} onClick={() => setPreviewFile(file)} className="block w-full select-none p-3 text-left" title={"Preview " + file.name}>
                            <div className="relative grid h-32 place-items-center overflow-hidden rounded-xl bg-slate-100">
                              {isImage ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={previewUrl} alt="" draggable={false} referrerPolicy="no-referrer" loading="lazy" decoding="async" onDragStart={(event) => event.preventDefault()} onContextMenu={(event) => event.preventDefault()} className="pointer-events-none size-full select-none object-cover" />
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
                                  referrerPolicy="no-referrer"
                                  tabIndex={-1}
                                  aria-hidden="true"
                                  onLoadedData={(event) => {
                                    const video = event.currentTarget;
                                    if (Number.isFinite(video.duration) && video.duration > 0.5) video.currentTime = Math.min(1, video.duration / 2);
                                  }}
                                  className="pointer-events-none size-full select-none object-cover"
                                />
                              ) : (
                                <div className="grid size-16 place-items-center rounded-2xl bg-white text-blue-700 shadow-sm">
                                  <Icon className="size-9 stroke-[1.5]" />
                                </div>
                              )}
                              {isVideo && <div className="pointer-events-none absolute inset-0 grid place-items-center"><span className="grid size-9 place-items-center rounded-full bg-slate-950/65 text-white"><FileVideo className="size-4" /></span></div>}
                              <span className="absolute left-2 top-2 rounded-md bg-white/95 px-2 py-1 text-[10px] font-bold text-slate-700 shadow-sm">{label}</span>
                            </div>
                            <div className="mt-3 flex items-start justify-between gap-2">
                              <span className="min-w-0 truncate text-sm font-semibold text-slate-800" title={file.name}>{displayFileName(file.name)}</span>
                              <span className="shrink-0 text-[11px] tabular-nums text-slate-500">{formatBytes(file.sizeBytes)}</span>
                            </div>
                            <p className="mt-1 truncate text-[11px] text-slate-400">Updated {new Date(file.updatedAt).toLocaleDateString()}</p>
                          </button>
                          <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2">
                            <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">{label}</span>
                            <div className="flex gap-1">
                              <a href={"/api/vault/files/" + encodeURIComponent(file.id)} title="Download file" aria-label={"Download " + file.name} className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-700"><ArrowDownToLine className="size-3.5" /></a>
                              <button type="button" disabled={busy} onClick={() => void deleteFile(file)} title="Delete file" aria-label={"Delete " + file.name} className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"><Trash2 className="size-3.5" /></button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-400">Files download through an authenticated server route; Bunny storage credentials never reach the browser.</p>
            </div>

            <aside className="space-y-4">
              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900"><HardDrive className="size-4 text-slate-500" /> Storage usage</div>
                {snapshot ? (
                  <>
                    <p className="mt-5 text-2xl font-semibold tracking-tight text-slate-950">{formatBytes(snapshot.usage.usedBytes)}</p>
                    <p className="mt-1 text-xs text-slate-500">of {formatBytes(snapshot.usage.quotaBytes)} used</p>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: usedPercent + "%" }} />
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                      <span className="text-slate-500">Available storage</span>
                      <span className="font-semibold tabular-nums text-slate-800">{formatBytes(snapshot.usage.availableBytes)}</span>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                      <span className="text-slate-500">Stored items</span>
                      <span className="font-semibold tabular-nums text-slate-800">{snapshot.usage.usedItems.toLocaleString("en-IN")} / {snapshot.usage.maxItems.toLocaleString("en-IN")}</span>
                    </div>
                  </>
                ) : (
                  <p className="mt-4 text-xs leading-5 text-slate-500">Usage is available when the vault connects to storage.</p>
                )}
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900"><ShieldCheck className="size-4 text-emerald-600" /> Company isolation</div>
                <p className="mt-2 text-xs leading-5 text-slate-500">Every vault operation is checked against your authenticated company and workspace. Files are stored under a company-specific Bunny Storage path and served only after server-side authorization.</p>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-semibold text-slate-900">Supported content</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {["PDF", "Word", "Excel", "PowerPoint", "Images", "Videos", "Other files"].map((label) => (
                    <span key={label} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-medium text-slate-600">{label}</span>
                  ))}
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-500">Uploads are sequential 3 MiB chunks and are streamed into private Bunny storage without assembling the entire file in application memory. Image, video, PDF and plain-text previews load through the authenticated file route. Office files are downloadable and remain private.</p>
              </section>
            </aside>
          </section>
        </div>
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
        <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="vault-folder-dialog-title" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setFolderDialog(null); }}>
          <form onSubmit={(event) => void saveFolderDialog(event)} className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-5">
              <div>
                <h2 id="vault-folder-dialog-title" className="text-base font-semibold text-slate-950">{folderDialog.mode === "create" ? "Create folder" : "Rename folder"}</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">Folders are stored as private metadata. Creating a folder does not write placeholder files to Bunny Storage.</p>
              </div>
              <button type="button" aria-label="Close folder dialog" disabled={busy} onClick={() => setFolderDialog(null)} className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-50"><X className="size-4" /></button>
            </div>
            <div className="p-5">
              <label className="block text-xs font-semibold text-slate-700">
                Folder name
                <input autoFocus autoComplete="off" maxLength={100} value={folderDialog.name} onChange={(event) => setFolderDialog((current) => current ? { ...current, name: event.target.value } : current)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10" placeholder="e.g. Contracts" />
              </label>
              {error && <p role="alert" className="mt-3 text-xs text-rose-700">{error}</p>}
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setFolderDialog(null)} disabled={busy} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={busy || !folderDialog.name.trim()} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{busy ? "Saving…" : folderDialog.mode === "create" ? "Create folder" : "Save name"}</button>
            </div>
          </form>
        </div>
      )}

      {previewFile && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-labelledby="vault-preview-title" onContextMenu={(event) => event.preventDefault()} onDragStart={(event) => event.preventDefault()} onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewFile(null); }}>
          <section className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/15 bg-white shadow-2xl">
            <header className="flex items-center justify-between gap-4 border-b border-slate-200 px-4 py-3 sm:px-6">
              <div className="min-w-0">
                <h2 id="vault-preview-title" className="truncate text-sm font-semibold text-slate-950" title={previewFile.name}>{displayFileName(previewFile.name)}</h2>
                <p className="mt-1 text-[11px] text-slate-500">{formatBytes(previewFile.sizeBytes)} · Preview uses your authenticated company session</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <a href={"/api/vault/files/" + encodeURIComponent(previewFile.id)} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"><ArrowDownToLine className="size-3.5" /> Download</a>
                <button type="button" aria-label="Close preview" onClick={() => setPreviewFile(null)} className="grid size-9 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"><X className="size-4" /></button>
              </div>
            </header>
            <div className="min-h-[45vh] flex-1 overflow-auto bg-slate-100 p-3 sm:p-5">
              {previewFile.mimeType.startsWith("image/") && !previewFile.mimeType.includes("svg") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={"/api/vault/files/" + encodeURIComponent(previewFile.id) + "?inline=1"} alt={previewFile.name} draggable={false} referrerPolicy="no-referrer" onDragStart={(event) => event.preventDefault()} onContextMenu={(event) => event.preventDefault()} className="mx-auto max-h-[74vh] max-w-full select-none rounded-xl object-contain" />
              ) : previewFile.mimeType.startsWith("video/") && /^(video\/(mp4|webm|ogg))$/.test(previewFile.mimeType) ? (
                <video controls controlsList="nodownload noremoteplayback" disablePictureInPicture disableRemotePlayback draggable={false} referrerPolicy="no-referrer" onDragStart={(event) => event.preventDefault()} onContextMenu={(event) => event.preventDefault()} preload="metadata" src={"/api/vault/files/" + encodeURIComponent(previewFile.id) + "?inline=1"} className="mx-auto max-h-[74vh] max-w-full rounded-xl" />
              ) : /^(application\/pdf|text\/(plain|csv)|application\/json)$/.test(previewFile.mimeType) ? (
                <iframe title={"Preview " + previewFile.name} sandbox="" referrerPolicy="no-referrer" src={"/api/vault/files/" + encodeURIComponent(previewFile.id) + "?inline=1"} className="h-[72vh] w-full rounded-xl border border-slate-200 bg-white" />
              ) : (
                <div className="grid min-h-[45vh] place-items-center">
                  <div className="max-w-md text-center">
                    <FileText className="mx-auto size-10 text-slate-400" />
                    <p className="mt-3 text-sm font-semibold text-slate-800">Preview is not available for this file type yet</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">The original file is still stored privately. Download it to open it in Word, Excel, PowerPoint, or the appropriate local app.</p>
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
