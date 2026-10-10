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
    if (request.headers.get("sec-fetch-site") === "cross-site") throw new Error("FORBIDDEN");
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
    // Preview URLs only render inside the application UI. Opening a copied image/video
    // URL as a top-level browser document falls back to attachment download.
    const topLevelDocument = request.headers.get("sec-fetch-dest") === "document";
    const inline = wantsInline && !topLevelDocument && previewableMimeType(file.mimeType);
    const requestedRange = request.headers.get("range");
    const compressed = file.contentEncoding === "gzip";
    const safeRange = !compressed && requestedRange && /^bytes=(?:\d+-\d*|-\d+)$/.test(requestedRange)
      ? requestedRange
      : undefined;
    const remote = await bunnyDownload(file.storageKey, safeRange);
    let body = remote.body;
    if (compressed) {
      if (!body || typeof DecompressionStream === "undefined") throw new Error("VAULT_DECOMPRESSION_UNAVAILABLE");
      body = body.pipeThrough(new DecompressionStream("gzip"));
    }
    const responseHeaders: Record<string, string> = {
      "Content-Type": file.mimeType || "application/octet-stream",
      "Content-Length": compressed ? String(file.sizeBytes) : remote.headers.get("content-length") ?? String(file.sizeBytes),
      "Content-Disposition": downloadDisposition(file.originalName, inline),
      "X-Content-Type-Options": "nosniff",
      "X-Download-Options": "noopen",
      "X-Permitted-Cross-Domain-Policies": "none",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Content-Security-Policy": "sandbox",
      "Cache-Control": "private, no-store, max-age=0",
      "Pragma": "no-cache",
      "Vary": "Cookie, Sec-Fetch-Dest, Range",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "SAMEORIGIN",
      ...(compressed ? {} : { "Accept-Ranges": "bytes" })
    };
    const contentRange = remote.headers.get("content-range");
    if (!compressed && remote.status === 206 && contentRange) responseHeaders["Content-Range"] = contentRange;
    return new Response(body, {
      status: !compressed && remote.status === 206 ? 206 : 200,
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
