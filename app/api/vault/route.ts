import { Types } from "mongoose";
import { getMongo } from "@/lib/mongodb";
import { jsonOk } from "@/lib/http";
import { VaultFolder } from "@/models/vault-folder";
import { VaultFile } from "@/models/vault-file";
import {
  bunnyEnsureMarker,
  cleanupExpiredVaultUploads,
  companyVaultRoot,
  ensureVaultUsage,
  getTenantFolder,
  requireVaultScope,
  vaultErrorResponse
} from "@/features/company-vault/server/vault-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const scope = await requireVaultScope();
    await getMongo();
    await cleanupExpiredVaultUploads(scope);

    const root = companyVaultRoot(scope);
    await bunnyEnsureMarker(root + "/.conventus-vault", "Conventus private company vault marker.");
    const url = new URL(request.url);
    const requestedFolderId = url.searchParams.get("folderId");
    const currentFolder = requestedFolderId ? await getTenantFolder(scope, requestedFolderId) : null;
    const parentFolderId = currentFolder ? currentFolder._id : null;
    const companyId = new Types.ObjectId(scope.companyId);
    const workspaceId = new Types.ObjectId(scope.workspaceId);

    const [folders, files, usage] = await Promise.all([
      VaultFolder.find({ companyId, workspaceId, parentFolderId })
        .sort({ nameKey: 1, _id: 1 })
        .select("_id parentFolderId name createdAt updatedAt")
        .lean(),
      VaultFile.find({ companyId, workspaceId, folderId: parentFolderId })
        .sort({ originalName: 1, _id: 1 })
        .select("_id originalName mimeType sizeBytes createdAt updatedAt")
        .lean(),
      ensureVaultUsage(scope)
    ]);

    const breadcrumbs: { id: string; name: string }[] = [];
    let ancestor = currentFolder;
    let depth = 0;
    while (ancestor && depth < 50) {
      breadcrumbs.unshift({ id: String(ancestor._id), name: ancestor.name });
      if (!ancestor.parentFolderId) break;
      ancestor = await getTenantFolder(scope, String(ancestor.parentFolderId));
      depth += 1;
    }

    return jsonOk({
      companyName: scope.companyName,
      currentFolder: currentFolder ? { id: String(currentFolder._id), name: currentFolder.name } : null,
      breadcrumbs,
      folders: folders.map((folder) => ({
        id: String(folder._id),
        name: folder.name,
        createdAt: folder.createdAt,
        updatedAt: folder.updatedAt
      })),
      files: files.map((file) => ({
        id: String(file._id),
        name: file.originalName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt
      })),
      usage: {
        usedBytes: usage.usedBytes,
        quotaBytes: usage.quotaBytes,
        availableBytes: Math.max(0, usage.quotaBytes - usage.usedBytes)
      }
    });
  } catch (error) {
    return vaultErrorResponse(error, "VAULT_LIST_FAILED");
  }
}
