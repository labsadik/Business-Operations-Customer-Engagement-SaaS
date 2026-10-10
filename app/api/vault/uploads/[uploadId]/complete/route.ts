import { Types } from "mongoose";
import { getMongo } from "@/lib/mongodb";
import { assertSameOrigin } from "@/lib/security";
import { jsonOk } from "@/lib/http";
import { VaultFile } from "@/models/vault-file";
import { VaultFolder } from "@/models/vault-folder";
import { VaultUpload } from "@/models/vault-upload";
import {
  bunnyDelete,
  bunnyPut,
  bunnyReadBuffer,
  getUploadExpiry,
  removeUploadChunks,
  requireVaultScope,
  safeVaultFilename,
  uploadChunkKey,
  vaultErrorResponse
} from "@/features/company-vault/server/vault-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UploadRecord = {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  workspaceId: Types.ObjectId;
  folderId: Types.ObjectId | null;
  createdByUserId: Types.ObjectId;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  chunkSizeBytes: number;
  expectedChunks: number;
  receivedChunks: number[];
  storageRoot: string;
  storageBaseKey: string;
};

type CompletedFile = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ uploadId: string }> }
) {
  let claimedUpload: UploadRecord | null = null;
  let finalStorageKey = "";
  let finalStored = false;
  let fileSaved = false;
  let completedFile: CompletedFile | null = null;

  try {
    assertSameOrigin(request);
    const scope = await requireVaultScope();
    await getMongo();
    const { uploadId } = await params;
    if (!Types.ObjectId.isValid(uploadId)) throw new Error("INVALID_UPLOAD_ID");

    const tenantFilter = {
      companyId: new Types.ObjectId(scope.companyId),
      workspaceId: new Types.ObjectId(scope.workspaceId)
    };
    const existing = await VaultUpload.findOne({
      _id: new Types.ObjectId(uploadId),
      ...tenantFilter,
      expiresAt: { $gt: new Date() }
    }).lean();
    if (!existing) {
      const priorFile = await VaultFile.findOne({ uploadId: new Types.ObjectId(uploadId), ...tenantFilter })
        .select("_id originalName mimeType sizeBytes createdAt")
        .lean();
      if (priorFile) {
        return jsonOk({
          id: String(priorFile._id),
          name: priorFile.originalName,
          mimeType: priorFile.mimeType,
          sizeBytes: priorFile.sizeBytes,
          createdAt: priorFile.createdAt
        });
      }
      throw new Error("UPLOAD_NOT_FOUND");
    }

    const received = new Set<number>(existing.receivedChunks);
    if (received.size !== existing.expectedChunks) throw new Error("UPLOAD_CHUNKS_INCOMPLETE");
    for (let index = 0; index < existing.expectedChunks; index += 1) {
      if (!received.has(index)) throw new Error("UPLOAD_CHUNKS_INCOMPLETE");
    }

    if (existing.folderId) {
      const folder = await VaultFolder.findOne({
        _id: existing.folderId,
        ...tenantFilter
      }).select("_id").lean();
      if (!folder) throw new Error("FOLDER_NOT_FOUND");
    }

    const claimed = await VaultUpload.findOneAndUpdate(
      {
        _id: existing._id,
        ...tenantFilter,
        status: "OPEN",
        expiresAt: { $gt: new Date() },
        receivedChunks: { $size: existing.expectedChunks }
      },
      { $set: { status: "COMPLETING", expiresAt: getUploadExpiry() } },
      { returnDocument: "after" }
    ).lean();
    if (!claimed) throw new Error("UPLOAD_ALREADY_COMPLETING");
    claimedUpload = claimed as unknown as UploadRecord;

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    for (let index = 0; index < claimedUpload.expectedChunks; index += 1) {
      const part = await bunnyReadBuffer(uploadChunkKey(claimedUpload.storageRoot, uploadId, index));
      chunks.push(part);
      totalBytes += part.length;
    }
    if (totalBytes !== claimedUpload.sizeBytes) throw new Error("INVALID_CHUNK_SIZE");

    const bytes = Buffer.concat(chunks, totalBytes);
    const file = new VaultFile({
      companyId: claimedUpload.companyId,
      workspaceId: claimedUpload.workspaceId,
      folderId: claimedUpload.folderId ?? null,
      uploadId: claimedUpload._id,
      createdByUserId: claimedUpload.createdByUserId,
      originalName: safeVaultFilename(claimedUpload.originalName),
      mimeType: claimedUpload.mimeType,
      sizeBytes: claimedUpload.sizeBytes,
      storageKey: "pending"
    });
    file.storageKey = claimedUpload.storageBaseKey + "/" + String(file._id) + "-" + safeVaultFilename(claimedUpload.originalName);
    finalStorageKey = file.storageKey;

    await bunnyPut(finalStorageKey, bytes, claimedUpload.mimeType);
    finalStored = true;
    await file.save();
    fileSaved = true;
    completedFile = {
      id: String(file._id),
      name: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      createdAt: file.createdAt
    };

    // The source upload ID lets expiry cleanup distinguish a committed file from
    // an abandoned reservation if the request is interrupted during final cleanup.
    await VaultUpload.updateOne(
      { _id: claimedUpload._id, ...tenantFilter, status: "COMPLETING" },
      { $set: { status: "COMPLETED" } }
    ).catch(() => undefined);
    await removeUploadChunks(claimedUpload.storageRoot, uploadId, claimedUpload.expectedChunks);
    await VaultUpload.deleteOne({ _id: claimedUpload._id, ...tenantFilter }).catch(() => undefined);

    return jsonOk(completedFile, 201);
  } catch (error) {
    if (fileSaved && completedFile) {
      if (claimedUpload) {
        const tenantFilter = {
          companyId: claimedUpload.companyId,
          workspaceId: claimedUpload.workspaceId
        };
        await VaultUpload.updateOne(
          { _id: claimedUpload._id, ...tenantFilter },
          { $set: { status: "COMPLETED" } }
        ).catch(() => undefined);
        await removeUploadChunks(claimedUpload.storageRoot, String(claimedUpload._id), claimedUpload.expectedChunks);
        await VaultUpload.deleteOne({ _id: claimedUpload._id, ...tenantFilter }).catch(() => undefined);
      }
      return jsonOk(completedFile, 201);
    }

    if (finalStored && finalStorageKey) {
      await bunnyDelete(finalStorageKey).catch(() => undefined);
    }
    if (claimedUpload) {
      await VaultUpload.updateOne(
        { _id: claimedUpload._id, companyId: claimedUpload.companyId, workspaceId: claimedUpload.workspaceId, status: "COMPLETING" },
        { $set: { status: "OPEN", expiresAt: getUploadExpiry() } }
      ).catch(() => undefined);
    }
    return vaultErrorResponse(error, "VAULT_UPLOAD_COMPLETE_FAILED");
  }
}
