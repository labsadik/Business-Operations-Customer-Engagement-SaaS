import { Types } from "mongoose";
import { getMongo } from "@/lib/mongodb";
import { assertSameOrigin } from "@/lib/security";
import { jsonOk } from "@/lib/http";
import { VaultFile } from "@/models/vault-file";
import {
  bunnyDelete,
  bunnyDownload,
  releaseVaultBytes,
  requireVaultScope,
  vaultErrorResponse
} from "@/features/company-vault/server/vault-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function downloadDisposition(name: string) {
  const fallback = name.replace(/[^A-Za-z0-9._ -]/g, "_").replace(/["\\]/g, "_") || "download";
  return "attachment; filename=\"" + fallback + "\"; filename*=UTF-8''" + encodeURIComponent(name);
}

export async function GET(
  _request: Request,
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

    const remote = await bunnyDownload(file.storageKey);
    return new Response(remote.body, {
      status: 200,
      headers: {
        "Content-Type": file.mimeType || "application/octet-stream",
        "Content-Length": String(file.sizeBytes),
        "Content-Disposition": downloadDisposition(file.originalName),
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
        "Cache-Control": "private, no-store"
      }
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

    await bunnyDelete(file.storageKey);
    const deleted = await VaultFile.deleteOne({ _id: file._id, companyId, workspaceId });
    if (deleted.deletedCount) await releaseVaultBytes(scope, file.sizeBytes);
    return jsonOk({ deleted: true });
  } catch (error) {
    return vaultErrorResponse(error, "VAULT_FILE_DELETE_FAILED");
  }
}
