import { Types } from "mongoose";
import { getMongo } from "@/lib/mongodb";
import { assertSameOrigin } from "@/lib/security";
import { jsonOk } from "@/lib/http";
import { VaultUpload } from "@/models/vault-upload";
import {
  bunnyPut,
  getUploadExpiry,
  requireVaultScope,
  uploadChunkKey,
  vaultErrorResponse
} from "@/features/company-vault/server/vault-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ uploadId: string; chunkIndex: string }> }
) {
  try {
    assertSameOrigin(request);
    const scope = await requireVaultScope();
    await getMongo();
    const { uploadId, chunkIndex: rawIndex } = await params;
    if (!Types.ObjectId.isValid(uploadId)) throw new Error("INVALID_UPLOAD_ID");
    if (!/^\d+$/.test(rawIndex)) throw new Error("INVALID_CHUNK_INDEX");
    const index = Number(rawIndex);
    if (!Number.isSafeInteger(index) || index < 0) throw new Error("INVALID_CHUNK_INDEX");

    const upload = await VaultUpload.findOne({
      _id: new Types.ObjectId(uploadId),
      companyId: new Types.ObjectId(scope.companyId),
      workspaceId: new Types.ObjectId(scope.workspaceId),
      status: "OPEN",
      expiresAt: { $gt: new Date() }
    }).lean();
    if (!upload) throw new Error("UPLOAD_NOT_FOUND");
    if (index >= upload.expectedChunks) throw new Error("INVALID_CHUNK_INDEX");

    const bytes = Buffer.from(await request.arrayBuffer());
    const expectedSize = index === upload.expectedChunks - 1
      ? upload.sizeBytes - index * upload.chunkSizeBytes
      : upload.chunkSizeBytes;
    if (bytes.length !== expectedSize || bytes.length > upload.chunkSizeBytes) {
      throw new Error("INVALID_CHUNK_SIZE");
    }

    await bunnyPut(uploadChunkKey(upload.storageRoot, uploadId, index), bytes, "application/octet-stream");
    const updated = await VaultUpload.findOneAndUpdate(
      {
        _id: upload._id,
        companyId: upload.companyId,
        workspaceId: upload.workspaceId,
        status: "OPEN",
        expiresAt: { $gt: new Date() }
      },
      { $addToSet: { receivedChunks: index }, $set: { expiresAt: getUploadExpiry() } },
      { returnDocument: "after" }
    ).select("_id").lean();

    if (!updated) throw new Error("UPLOAD_NOT_FOUND");
    return jsonOk({ received: true, chunkIndex: index });
  } catch (error) {
    return vaultErrorResponse(error, "VAULT_CHUNK_UPLOAD_FAILED");
  }
}
