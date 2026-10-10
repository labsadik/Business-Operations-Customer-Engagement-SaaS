import { Types } from "mongoose";
import { getMongo } from "@/lib/mongodb";
import { assertSameOrigin } from "@/lib/security";
import { jsonOk } from "@/lib/http";
import { VaultFile } from "@/models/vault-file";
import {
  bunnyDelete,
  bunnyDownload,
  deleteVaultFileAndRelease,
  ensureVaultUsage,
  requireVaultScope,
  vaultErrorResponse
} from "@/features/company-vault/server/vault-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function downloadDisposition(name: string, inline: boolean) {
  const fallback = name.replace(/[^A-Za-z0-9._ -]/g, "_").replace(/["\\]/g, "_") || "download";
  return (inline ? "inline" : "attachment") + "; filename=\"" + fallback + "\"; filename*=UTF-8''" + encodeURIComponent(name);
}

function previewableMimeType(mimeType: string) {
  return /^(image\/(?:jpeg|png|gif|webp|avif)|video\/(?:mp4|webm|ogg)|application\/pdf|text\/(?:plain|csv)|application\/json)$/.test(mimeType);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const scope = await requireVaultScope();
    await getMongo();
    const { fileId } = await params;
    if (!Types.ObjectId.isValid(fileId)) throw new Error("INVALID_FILE_ID");
    const file = await VaultFile.findOne({
      _id: new Types.ObjectId(fileId),
      companyId: new Types.ObjectId(scope.companyId),
      workspaceId: new Types.ObjectId(scope.workspaceId)
    }).lean();
    if (!file) throw new Error("FILE_NOT_FOUND");

    const wantsInline = new URL(request.url).searchParams.get("inline") === "1";
    const inline = wantsInline && previewableMimeType(file.mimeType);
    const requestedRange = request.headers.get("range");
    const safeRange = requestedRange && /^bytes=(?:\d+-\d*|-\d+)$/.test(requestedRange)
      ? requestedRange
      : undefined;
    const remote = await bunnyDownload(file.storageKey, safeRange);
    const responseHeaders: Record<string, string> = {
      "Content-Type": file.mimeType || "application/octet-stream",
      "Content-Length": remote.headers.get("content-length") ?? String(file.sizeBytes),
      "Content-Disposition": downloadDisposition(file.originalName, inline),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
      "Cache-Control": "private, no-store",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Accept-Ranges": "bytes"
    };
    const contentRange = remote.headers.get("content-range");
    if (remote.status === 206 && contentRange) responseHeaders["Content-Range"] = contentRange;
    return new Response(remote.body, {
      status: remote.status === 206 ? 206 : 200,
      headers: responseHeaders
    });
  } catch (error) {
    return vaultErrorResponse(error, "VAULT_FILE_DOWNLOAD_FAILED");
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    assertSameOrigin(request);
    const scope = await requireVaultScope();
    await getMongo();
    const { fileId } = await params;
    if (!Types.ObjectId.isValid(fileId)) throw new Error("INVALID_FILE_ID");
    const companyId = new Types.ObjectId(scope.companyId);
    const workspaceId = new Types.ObjectId(scope.workspaceId);
    const file = await VaultFile.findOne({ _id: new Types.ObjectId(fileId), companyId, workspaceId }).lean();
    if (!file) throw new Error("FILE_NOT_FOUND");

    await ensureVaultUsage(scope);
    await bunnyDelete(file.storageKey);
    await deleteVaultFileAndRelease(scope, file);
    return jsonOk({ deleted: true });
  } catch (error) {
    return vaultErrorResponse(error, "VAULT_FILE_DELETE_FAILED");
  }
}
