"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  ArrowLeft,
  ChevronRight,
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

type FolderItem = { id: string; name: string; createdAt: string; updatedAt: string };
type FileItem = { id: string; name: string; mimeType: string; sizeBytes: number; createdAt: string; updatedAt: string };
type Usage = { usedBytes: number; quotaBytes: number; availableBytes: number };
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
    BUNNY_STORAGE_REQUEST_FAILED: "Bunny Storage could not complete the request. Please try again.",
    VAULT_STORAGE_LIMIT_REACHED: "This upload would exceed your company's storage limit.",
    VAULT_FILE_TOO_LARGE: "This file is larger than the server-configured per-file upload limit.",
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

export default function CompanyVault({ companyName, currentRole }: { companyName: string; currentRole: string }) {
  const [folderId, setFolderId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<VaultSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);
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

  const createFolder = async () => {
    const value = window.prompt("Folder name");
    if (value === null || !value.trim()) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest("/api/vault/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: value, parentFolderId: folderId })
      });
      refresh();
    } catch (reason) {
      setError(explainError(reason instanceof Error ? reason.message : "VAULT_FOLDER_CREATE_FAILED"));
    } finally {
      setBusy(false);
    }
  };

  const renameFolder = async (folder: FolderItem) => {
    const value = window.prompt("Rename folder", folder.name);
    if (value === null || !value.trim() || value.trim() === folder.name) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest("/api/vault/folders/" + encodeURIComponent(folder.id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: value })
      });
      refresh();
    } catch (reason) {
      setError(explainError(reason instanceof Error ? reason.message : "VAULT_FOLDER_RENAME_FAILED"));
    } finally {
      setBusy(false);
    }
  };

  const deleteFolder = async (folder: FolderItem) => {
    const confirmed = window.confirm("Permanently delete “" + folder.name + "”, its subfolders, and every file inside them?");
    if (!confirmed) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest("/api/vault/folders/" + encodeURIComponent(folder.id), { method: "DELETE" });
      refresh();
    } catch (reason) {
      setError(explainError(reason instanceof Error ? reason.message : "VAULT_FOLDER_DELETE_FAILED"));
    } finally {
      setBusy(false);
    }
  };

  const deleteFile = async (file: FileItem) => {
    const confirmed = window.confirm("Permanently delete “" + file.name + "”?");
    if (!confirmed) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest("/api/vault/files/" + encodeURIComponent(file.id), { method: "DELETE" });
      refresh();
    } catch (reason) {
      setError(explainError(reason instanceof Error ? reason.message : "VAULT_FILE_DELETE_FAILED"));
    } finally {
      setBusy(false);
    }
  };

  const uploadFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (!selected.length) return;

    setBusy(true);
    setError("");
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
            const start = index * upload.chunkSizeBytes;
            const chunk = file.slice(start, Math.min(file.size, start + upload.chunkSizeBytes));
            const percentage = Math.round(((index + 1) / upload.expectedChunks) * 100);
            setProgress("Uploading " + file.name + " — " + percentage + "%");
            await apiRequest("/api/vault/uploads/" + upload.uploadId + "/chunks/" + index, {
              method: "PUT",
              headers: { "Content-Type": "application/octet-stream" },
              body: chunk
            });
          }

          setProgress("Saving " + file.name + " to the company vault");
          await apiRequest("/api/vault/uploads/" + upload.uploadId + "/complete", { method: "POST" });
          uploadId = null;
        } catch (reason) {
          if (uploadId) {
            await fetch("/api/vault/uploads/" + encodeURIComponent(uploadId), { method: "DELETE" }).catch(() => undefined);
          }
          throw reason;
        }
      }
      refresh();
    } catch (reason) {
      setError(explainError(reason instanceof Error ? reason.message : "VAULT_UPLOAD_FAILED"));
      setLoading(true);
      setReloadVersion((version) => version + 1);
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  const usedPercent = snapshot?.usage.quotaBytes
    ? Math.min(100, (snapshot.usage.usedBytes / snapshot.usage.quotaBytes) * 100)
    : 0;
  const canManage = currentRole === "COMPANY_ADMIN" || currentRole === "PLATFORM_ADMIN";
  const usedFiles = (snapshot?.folders.length ?? 0) + (snapshot?.files.length ?? 0);

  return (
    <>
      <WorkspaceSidebar
        companyName={companyName}
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
                  <button type="button" disabled={busy || loading} onClick={() => inputRef.current?.click()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-3.5 py-2.5 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                    {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />}
                    Upload files
                  </button>
                  <input ref={inputRef} type="file" multiple className="hidden" onChange={uploadFiles} aria-label="Choose files to upload" />
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 text-sm">
                <button type="button" onClick={() => navigateToFolder(null)} className="font-semibold text-blue-700 hover:text-blue-900">Vault</button>
                {(snapshot?.breadcrumbs ?? []).map((item, index) => (
                  <span key={item.id} className="inline-flex items-center gap-2">
                    <ChevronRight className="size-3.5 text-slate-400" />
                    <button
                      type="button"
                      onClick={() => navigateToFolder(item.id)
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

              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                <div className="grid grid-cols-[minmax(0,1fr)_100px_76px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 sm:grid-cols-[minmax(0,1fr)_150px_100px_86px]">
                  <span>Name</span>
                  <span className="hidden sm:block">Last updated</span>
                  <span>Size</span>
                  <span className="text-right">Actions</span>
                </div>

                {loading ? (
                  <div className="flex items-center justify-center gap-2 px-5 py-14 text-sm text-slate-500">
                    <LoaderCircle className="size-4 animate-spin" />
                    Loading private files…
                  </div>
                ) : !snapshot ? (
                  <div className="px-5 py-12 text-center text-sm text-slate-500">The vault could not be loaded.</div>
                ) : usedFiles === 0 ? (
                  <div className="flex flex-col items-center px-5 py-12 text-center">
                    <div className="grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-500">
                      <CloudUpload className="size-6" />
                    </div>
                    <p className="mt-3 text-sm font-semibold text-slate-900">This folder is empty</p>
                    <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">Create a folder or upload files. Items in this vault are available only to authorized members of {companyName}.</p>
                  </div>
                ) : (
                  <>
                    {snapshot.folders.map((folder) => (
                      <div key={folder.id} className="grid grid-cols-[minmax(0,1fr)_100px_76px] items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_150px_100px_86px]">
                        <button type="button" onClick={() => navigateToFolder(folder.id) className="flex min-w-0 items-center gap-3 text-left">
                          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600"><Folder className="size-4.5" /></div>
                          <span className="min-w-0 truncate text-sm font-semibold text-slate-800 hover:text-blue-700">{folder.name}</span>
                        </button>
                        <span className="hidden truncate text-xs text-slate-500 sm:block">{new Date(folder.updatedAt).toLocaleDateString()}</span>
                        <span className="text-xs text-slate-400">Folder</span>
                        <div className="flex justify-end gap-1">
                          <button type="button" disabled={busy} onClick={() => void renameFolder(folder)} title="Rename folder" aria-label={"Rename " + folder.name} className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40"><Pencil className="size-3.5" /></button>
                          <button type="button" disabled={busy} onClick={() => void deleteFolder(folder)} title="Delete folder and contents" aria-label={"Delete " + folder.name} className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"><Trash2 className="size-3.5" /></button>
                        </div>
                      </div>
                    ))}

                    {snapshot.files.map((file) => {
                      const Icon = fileIcon(file.mimeType);
                      return (
                        <div key={file.id} className="grid grid-cols-[minmax(0,1fr)_100px_76px] items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_150px_100px_86px]">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><Icon className="size-4.5" /></div>
                            <a href={"/api/vault/files/" + encodeURIComponent(file.id)} className="min-w-0 truncate text-sm font-medium text-slate-800 hover:text-blue-700" title={file.name}>{file.name}</a>
                          </div>
                          <span className="hidden truncate text-xs text-slate-500 sm:block">{new Date(file.updatedAt).toLocaleDateString()}</span>
                          <span className="text-xs tabular-nums text-slate-500">{formatBytes(file.sizeBytes)}</span>
                          <div className="flex justify-end">
                            <button type="button" disabled={busy} onClick={() => void deleteFile(file)} title="Delete file" aria-label={"Delete " + file.name} className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"><Trash2 className="size-3.5" /></button>
                          </div>
                        </div>
                      );
                    })}
                  </>
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
                      <span className="text-slate-500">Available</span>
                      <span className="font-semibold tabular-nums text-slate-800">{formatBytes(snapshot.usage.availableBytes)}</span>
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
                <p className="mt-3 text-xs leading-5 text-slate-500">Large files are sent in small chunks through the server, then assembled into the private Bunny Storage Zone.</p>
              </section>
            </aside>
          </section>
        </div>
      </main>
    </>
  );
}
