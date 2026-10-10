import { Types } from "mongoose";
import { getMongo } from "@/lib/mongodb";
import { assertSameOrigin } from "@/lib/security";
import { jsonError, jsonOk } from "@/lib/http";
import { VaultFolder } from "@/models/vault-folder";
import { VaultFile } from "@/models/vault-file";
import {
  bunnyDelete,
  getTenantFolder,
  deleteVaultFileAndRelease,
  ensureVaultUsage,
  requireVaultScope,
  vaultErrorResponse
} from "@/features/company-vault/server/vault-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validateFolderName(value: unknown) {
  if (typeof value !== "string" || !value.trim()) throw new Error("FOLDER_NAME_REQUIRED");
  const name = value.trim().normalize("NFKC");
  if (name.length > 100) throw new Error("FOLDER_NAME_TOO_LONG");
  if (name === "." || name === ".." || /[\/\\\u0000-\u001f\u007f]/.test(name)) {
    throw new Error("FOLDER_NAME_INVALID");
  }
  return name;
}

function duplicateKey(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === 11000);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ folderId: string }> }
) {
  try {
    assertSameOrigin(request);
    const scope = await requireVaultScope();
    await getMongo();
    const { folderId } = await params;
    const folder = await getTenantFolder(scope, folderId);
    const body = await request.json().catch(() => null);
    const name = validateFolderName(body?.name);
    let updated;
    try {
      updated = await VaultFolder.findOneAndUpdate(
        { _id: folder._id, companyId: folder.companyId, workspaceId: folder.workspaceId },
        { $set: { name, nameKey: name.toLocaleLowerCase("en-US") } },
        { returnDocument: "after", runValidators: true }
      ).select("_id name updatedAt").lean();
    } catch (error) {
      if (duplicateKey(error)) throw new Error("FOLDER_ALREADY_EXISTS");
      throw error;
    }
    if (!updated) return jsonError("FOLDER_NOT_FOUND", 404);
    return jsonOk({ id: String(updated._id), name: updated.name, updatedAt: updated.updatedAt });
  } catch (error) {
    return vaultErrorResponse(error, "VAULT_FOLDER_RENAME_FAILED");
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ folderId: string }> }
) {
  try {
    assertSameOrigin(request);
    const scope = await requireVaultScope();
    await getMongo();
    const { folderId } = await params;
    const folder = await getTenantFolder(scope, folderId);
    const companyId = new Types.ObjectId(scope.companyId);
    const workspaceId = new Types.ObjectId(scope.workspaceId);
    await ensureVaultUsage(scope);

    const allFolders = await VaultFolder.find({ companyId, workspaceId })
      .select("_id parentFolderId storageKey")
      .lean();
    const childrenByParent = new Map<string, typeof allFolders>();
    for (const item of allFolders) {
      const parentKey = item.parentFolderId ? String(item.parentFolderId) : "";
      const group = childrenByParent.get(parentKey) ?? [];
      group.push(item);
      childrenByParent.set(parentKey, group);
    }

    const descendants: typeof allFolders = [];
    const queue = [String(folder._id)];
    const visited = new Set<string>();
    while (queue.length) {
      const currentId = queue.shift() as string;
      if (visited.has(currentId)) continue;
      visited.add(currentId);
      const current = allFolders.find((item) => String(item._id) === currentId);
      if (current) descendants.push(current);
      for (const child of childrenByParent.get(currentId) ?? []) queue.push(String(child._id));
    }

    const folderIds = descendants.map((item) => item._id);
    const files = await VaultFile.find({
      companyId,
      workspaceId,
      folderId: { $in: folderIds }
    }).select("_id storageKey sizeBytes").lean();

    // Delete remote content before removing the matching metadata. Each successful
    // deletion is committed separately so a transient Bunny failure can be retried.
    for (const file of files) {
      await bunnyDelete(file.storageKey);
      await deleteVaultFileAndRelease(scope, file);
    }

    // Clean marker files written by older vault builds; new folders never create them.
    for (const item of [...descendants].reverse()) {
      await bunnyDelete(item.storageKey + "/.conventus-folder");
    }

    await VaultFolder.deleteMany({ _id: { $in: folderIds }, companyId, workspaceId });
    return jsonOk({ deleted: true, deletedFolderCount: folderIds.length, deletedFileCount: files.length });
  } catch (error) {
    return vaultErrorResponse(error, "VAULT_FOLDER_DELETE_FAILED");
  }
}
