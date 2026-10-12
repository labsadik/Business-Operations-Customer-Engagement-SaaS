import { Types } from "mongoose";
import { getMongo } from "@/lib/mongodb";
import { assertSameOrigin } from "@/lib/security";
import { jsonOk } from "@/lib/http";
import { VaultFolder } from "@/models/vault-folder";
import {
  bunnyDelete,
  cleanupExpiredVaultUploads,
  companyVaultRoot,
  getTenantFolder,
  vaultFolderSegment,
  requireVaultScope,
  vaultErrorResponse
} from "@/features/company-vault/server/vault-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function duplicateKey(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === 11000);
}

function validateFolderName(value: unknown) {
  if (typeof value !== "string" || !value.trim()) throw new Error("FOLDER_NAME_REQUIRED");
  const name = value.trim().normalize("NFKC");
  if (name.length > 100) throw new Error("FOLDER_NAME_TOO_LONG");
  if (name === "." || name === ".." || /[\/\\\u0000-\u001f\u007f]/.test(name)) {
    throw new Error("FOLDER_NAME_INVALID");
  }
  return name;
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const scope = await requireVaultScope();
    await getMongo();
    await cleanupExpiredVaultUploads(scope);
    const body = await request.json().catch(() => null);
    const name = validateFolderName(body?.name);
    const rawParentId = body?.parentFolderId;
    const parent = rawParentId ? await getTenantFolder(scope, String(rawParentId)) : null;
    const folderId = new Types.ObjectId();
    const storageRoot = companyVaultRoot(scope);
    const folderSegment = vaultFolderSegment(name, String(folderId));
    const storageKey = parent
      ? parent.storageKey + "/" + folderSegment
      : storageRoot + "/" + folderSegment;

    const folder = new VaultFolder({
      _id: folderId,
      companyId: new Types.ObjectId(scope.companyId),
      workspaceId: new Types.ObjectId(scope.workspaceId),
      parentFolderId: parent ? parent._id : null,
      createdByUserId: new Types.ObjectId(scope.session.userId),
      name,
      nameKey: name.toLocaleLowerCase("en-US"),
      storageKey
    });

    try {
      await folder.save();
    } catch (error) {
      if (duplicateKey(error)) throw new Error("FOLDER_ALREADY_EXISTS");
      throw error;
    }

    // Bunny Storage has no directory objects: the folder is represented by
    // metadata only, preventing marker files from appearing in the user's drive.
    await bunnyDelete(storageRoot + "/.canvas-vault").catch(() => undefined);

    return jsonOk({
      id: String(folder._id),
      name: folder.name,
      createdAt: folder.createdAt
    }, 201);
  } catch (error) {
    return vaultErrorResponse(error, "VAULT_FOLDER_CREATE_FAILED");
  }
}
