import { Types } from "mongoose";
import { getMongo } from "@/lib/mongodb";
import { assertSameOrigin } from "@/lib/security";
import { jsonOk } from "@/lib/http";
import { VaultUpload } from "@/models/vault-upload";
import {
  bunnyEnsureMarker,
  companyVaultRoot,
  getTenantFolder,
  getUploadExpiry,
  getVaultMaxFileBytes,
  reserveVaultBytes,
  releaseVaultBytes,
  requireVaultScope,
  safeMimeType,
  safeVaultFilename,
  vaultErrorResponse,
  VAULT_CHUNK_SIZE_BYTES,
  ensureVaultUsage,
  cleanupExpiredVaultUploads
} from "@/features/company-vault/server/vault-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const scope = await requireVaultScope();
    await getMongo();
    await cleanupExpiredVaultUploads(scope);

    const body = await request.json().catch(() => null);
    if (!body || typeof body.name !== "string" ||
        typeof body.size !== "number" || !Number.isSafeInteger(body.size) || body.size < 1) {
      throw new Error("INVALID_UPLOAD_INPUT");
    }
    if (body.size > getVaultMaxFileBytes()) throw new Error("VAULT_FILE_TOO_LARGE");
    if (body.name.length > 500 || !body.name.trim()) throw new Error("INVALID_UPLOAD_INPUT");

    const originalName = safeVaultFilename(body.name);
    const mimeType = safeMimeType(body.mimeType);
    const root = companyVaultRoot(scope);
    const rawFolderId = body.folderId;
    const folder = rawFolderId ? await getTenantFolder(scope, String(rawFolderId)) : null;
    const storageBaseKey = folder ? folder.storageKey : root;

    await bunnyEnsureMarker(root + "/.conventus-vault", "Conventus private company vault marker.");
    const expectedChunks = Math.ceil(body.size / VAULT_CHUNK_SIZE_BYTES);
    await reserveVaultBytes(scope, body.size);

    const upload = new VaultUpload({
      companyId: new Types.ObjectId(scope.companyId),
      workspaceId: new Types.ObjectId(scope.workspaceId),
      folderId: folder ? folder._id : null,
      createdByUserId: new Types.ObjectId(scope.session.userId),
      originalName,
      mimeType,
      sizeBytes: body.size,
      chunkSizeBytes: VAULT_CHUNK_SIZE_BYTES,
      expectedChunks,
      receivedChunks: [],
      storageRoot: root,
      storageBaseKey,
      status: "OPEN",
      expiresAt: getUploadExpiry()
    });

    try {
      await upload.save();
    } catch (error) {
      await releaseVaultBytes(scope, body.size);
      throw error;
    }

    return jsonOk({
      uploadId: String(upload._id),
      chunkSizeBytes: VAULT_CHUNK_SIZE_BYTES,
      expectedChunks,
      expiresAt: upload.expiresAt,
      usage: await ensureVaultUsage(scope).then((item) => ({
        usedBytes: item.usedBytes,
        quotaBytes: item.quotaBytes,
        availableBytes: Math.max(0, item.quotaBytes - item.usedBytes)
      }))
    }, 201);
  } catch (error) {
    return vaultErrorResponse(error, "VAULT_UPLOAD_START_FAILED");
  }
}
