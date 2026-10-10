import { Types } from "mongoose";
import { getMongo } from "@/lib/mongodb";
import { assertSameOrigin } from "@/lib/security";
import { jsonOk } from "@/lib/http";
import { VaultUpload } from "@/models/vault-upload";
import {
  releaseVaultBytes,
  removeUploadChunks,
  requireVaultScope,
  vaultErrorResponse
} from "@/features/company-vault/server/vault-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ uploadId: string }> }
) {
  try {
    assertSameOrigin(request);
    const scope = await requireVaultScope();
    await getMongo();
    const { uploadId } = await params;
    if (!Types.ObjectId.isValid(uploadId)) throw new Error("INVALID_UPLOAD_ID");

    const upload = await VaultUpload.findOne({
      _id: new Types.ObjectId(uploadId),
      companyId: new Types.ObjectId(scope.companyId),
      workspaceId: new Types.ObjectId(scope.workspaceId)
    }).lean();
    if (!upload) return jsonOk({ cancelled: true });
    if (upload.status === "COMPLETING") throw new Error("UPLOAD_ALREADY_COMPLETING");

    await removeUploadChunks(upload.storageRoot, uploadId, upload.expectedChunks);
    const deleted = await VaultUpload.deleteOne({
      _id: upload._id,
      companyId: upload.companyId,
      workspaceId: upload.workspaceId,
      status: "OPEN"
    });
    if (deleted.deletedCount) await releaseVaultBytes(scope, upload.sizeBytes);
    return jsonOk({ cancelled: true });
  } catch (error) {
    return vaultErrorResponse(error, "VAULT_UPLOAD_CANCEL_FAILED");
  }
}
