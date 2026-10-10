import { Types } from "mongoose";
import { getMongo } from "@/lib/mongodb";
import { jsonOk } from "@/lib/http";
import { VaultFolder } from "@/models/vault-folder";
import { VaultFile } from "@/models/vault-file";
import {
  getTenantFolder,
  getVaultUsageSnapshot,
  requireVaultScope,
  vaultErrorResponse
} from "@/features/company-vault/server/vault-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

type ListingCursor = { name: string; id: string };

function parseCursor(value: string | null, maxNameLength: number): ListingCursor | null {
  if (!value) return null;
  if (value.length > 1024) throw new Error("INVALID_VAULT_CURSOR");
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<ListingCursor>;
    if (
      typeof parsed.name !== "string" ||
      parsed.name.length > maxNameLength ||
      typeof parsed.id !== "string" ||
      !Types.ObjectId.isValid(parsed.id)
    ) throw new Error("INVALID_VAULT_CURSOR");
    return { name: parsed.name, id: parsed.id };
  } catch {
    throw new Error("INVALID_VAULT_CURSOR");
  }
}

function encodeCursor(name: string, id: Types.ObjectId) {
  return Buffer.from(JSON.stringify({ name, id: String(id) })).toString("base64url");
}

export async function GET(request: Request) {
  try {
    const scope = await requireVaultScope();
    await getMongo();
    const url = new URL(request.url);
    const requestedFolderId = url.searchParams.get("folderId");
    const loadMore = url.searchParams.get("loadMore") === "1";
    const folderCursor = parseCursor(url.searchParams.get("folderCursor"), 100);
    const fileCursor = parseCursor(url.searchParams.get("fileCursor"), 240);
    const currentFolder = requestedFolderId ? await getTenantFolder(scope, requestedFolderId) : null;
    const parentFolderId = currentFolder ? currentFolder._id : null;
    const companyId = new Types.ObjectId(scope.companyId);
    const workspaceId = new Types.ObjectId(scope.workspaceId);

    const folderFilter = {
      companyId,
      workspaceId,
      parentFolderId,
      ...(folderCursor ? {
        $or: [
          { nameKey: { $gt: folderCursor.name } },
          { nameKey: folderCursor.name, _id: { $gt: new Types.ObjectId(folderCursor.id) } }
        ]
      } : {})
    };
    const fileFilter = {
      companyId,
      workspaceId,
      folderId: parentFolderId,
      ...(fileCursor ? {
        $or: [
          { originalName: { $gt: fileCursor.name } },
          { originalName: fileCursor.name, _id: { $gt: new Types.ObjectId(fileCursor.id) } }
        ]
      } : {})
    };

    // Cursor-paginate each collection independently. A browser never pulls an
    // unbounded folder/file list into one API response for large tenants.
    const [folderRows, fileRows, usage] = await Promise.all([
      loadMore && !folderCursor
        ? Promise.resolve([])
        : VaultFolder.find(folderFilter)
            .sort({ nameKey: 1, _id: 1 })
            .select("_id parentFolderId name nameKey createdAt updatedAt")
            .limit(PAGE_SIZE + 1)
            .lean(),
      loadMore && !fileCursor
        ? Promise.resolve([])
        : VaultFile.find(fileFilter)
            .sort({ originalName: 1, _id: 1 })
            .select("_id originalName mimeType sizeBytes createdAt updatedAt")
            .limit(PAGE_SIZE + 1)
            .lean(),
      getVaultUsageSnapshot(scope)
    ]);

    const hasMoreFolders = folderRows.length > PAGE_SIZE;
    const hasMoreFiles = fileRows.length > PAGE_SIZE;
    const folders = folderRows.slice(0, PAGE_SIZE);
    const files = fileRows.slice(0, PAGE_SIZE);

    const breadcrumbs: { id: string; name: string }[] = [];
    let ancestor = currentFolder;
    let depth = 0;
    while (ancestor && depth < 50) {
      breadcrumbs.unshift({ id: String(ancestor._id), name: ancestor.name });
      if (!ancestor.parentFolderId) break;
      ancestor = await getTenantFolder(scope, String(ancestor.parentFolderId));
      depth += 1;
    }

    const usedBytes = usage?.usedBytes ?? 0;
    const quotaBytes = scope.vaultQuotaBytes;
    const usedItems = usage?.usedItems ?? 0;

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
      nextFolderCursor: hasMoreFolders && folders.length
        ? encodeCursor(folders[folders.length - 1].nameKey, folders[folders.length - 1]._id)
        : null,
      nextFileCursor: hasMoreFiles && files.length
        ? encodeCursor(files[files.length - 1].originalName, files[files.length - 1]._id)
        : null,
      usage: {
        usedBytes,
        quotaBytes,
        availableBytes: Math.max(0, quotaBytes - usedBytes),
        usedItems,
        maxItems: scope.vaultMaxItems,
        maxFileBytes: scope.vaultMaxFileBytes
      }
    });
  } catch (error) {
    return vaultErrorResponse(error, "VAULT_LIST_FAILED");
  }
}
