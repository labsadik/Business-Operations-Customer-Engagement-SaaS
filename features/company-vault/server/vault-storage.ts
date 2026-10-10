import { Types } from "mongoose";
import { getMongo } from "@/lib/mongodb";
import { requireCompanyMember } from "@/lib/authz";
import type { AuthSession } from "@/lib/session";
import { Company } from "@/models/company";
import { Workspace } from "@/models/workspace";
import { VaultFolder } from "@/models/vault-folder";
import { VaultUsage } from "@/models/vault-usage";
import { VaultUpload } from "@/models/vault-upload";
import { VaultFile } from "@/models/vault-file";
import { jsonError } from "@/lib/http";
import { getCompanyEntitlements } from "@/lib/plans-server";

export const VAULT_CHUNK_SIZE_BYTES = 3 * 1024 * 1024;
const DEFAULT_QUOTA_BYTES = 5 * 1024 * 1024 * 1024;
const DEFAULT_MAX_FILE_BYTES = 100 * 1024 * 1024;
const HARD_MAX_FILE_BYTES = 250 * 1024 * 1024;
const UPLOAD_LIFETIME_MS = 6 * 60 * 60 * 1000;

export type VaultScope = {
  session: AuthSession;
  companyId: string;
  workspaceId: string;
  companyName: string;
  companySlug: string;
  isPlatformAdmin: boolean;
  vaultEnabled: boolean;
  vaultQuotaBytes: number;
  vaultMaxFileBytes: number;
  vaultMaxItems: number;
};

type BunnyConfig = { zone: string; password: string; endpoint: string };

function positiveIntegerEnv(name: string, fallback: number, maximum: number) {
  const value = Number(process.env[name]);
  if (!Number.isSafeInteger(value) || value < 1) return fallback;
  return Math.min(value, maximum);
}

export function getVaultMaxFileBytes() {
  return positiveIntegerEnv("BUNNY_VAULT_MAX_FILE_BYTES", DEFAULT_MAX_FILE_BYTES, HARD_MAX_FILE_BYTES);
}

export function getVaultDefaultQuotaBytes() {
  return positiveIntegerEnv("BUNNY_VAULT_QUOTA_BYTES", DEFAULT_QUOTA_BYTES, Number.MAX_SAFE_INTEGER);
}

export function getUploadExpiry() {
  return new Date(Date.now() + UPLOAD_LIFETIME_MS);
}

export async function requireVaultScope(): Promise<VaultScope> {
  await getMongo();
  const result = await requireCompanyMember(["COMPANY_ADMIN", "EMPLOYEE", "PLATFORM_ADMIN"]);
  const session = result.session;
  if (!session.companyId || !session.workspaceId ||
      !Types.ObjectId.isValid(session.companyId) || !Types.ObjectId.isValid(session.workspaceId)) {
    throw new Error("COMPANY_NOT_CONFIGURED");
  }

  const companyId = new Types.ObjectId(session.companyId);
  const workspaceId = new Types.ObjectId(session.workspaceId);
  const [company, workspace] = await Promise.all([
    Company.findOne({ _id: companyId }).select("_id name slug").lean(),
    Workspace.findOne({ _id: workspaceId, companyId, active: true }).select("_id").lean()
  ]);
  if (!company || !workspace) throw new Error("WORKSPACE_NOT_FOUND");

  const entitlements = await getCompanyEntitlements(String(companyId));
  if (!entitlements.vaultEnabled) throw new Error("VAULT_FEATURE_NOT_INCLUDED");

  return {
    session,
    companyId: String(companyId),
    workspaceId: String(workspaceId),
    companyName: company.name,
    companySlug: company.slug,
    isPlatformAdmin: session.role === "PLATFORM_ADMIN",
    vaultEnabled: Boolean(entitlements.vaultEnabled),
    vaultQuotaBytes: entitlements.vaultQuotaBytes ?? getVaultDefaultQuotaBytes(),
    vaultMaxFileBytes: Math.min(entitlements.vaultMaxFileBytes ?? getVaultMaxFileBytes(), HARD_MAX_FILE_BYTES),
    vaultMaxItems: entitlements.vaultMaxItems ?? 1000
  };
}

export function companyVaultRoot(scope: Pick<VaultScope, "companyId">) {
  // Stable company ID only: renaming a company or changing its public slug cannot
  // orphan stored bytes or change which tenant owns them.
  return "company-" + scope.companyId;
}

export function vaultFolderSegment(name: string, folderId: string) {
  const readable = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "folder";
  return readable + "-" + folderId;
}

export function safeVaultFilename(name: string) {
  const leaf = name.split(/[\\/]/).pop() ?? "";
  const clean = leaf
    .replace(/[\u0000-\u001f\u007f]/g, "_")
    .replace(/[\\/]/g, "_")
    .trim()
    .replace(/^\.+$/, "_")
    .slice(0, 240);
  return clean || "unnamed-file";
}

export function safeMimeType(value: unknown) {
  if (typeof value !== "string" || value.length > 160) return "application/octet-stream";
  const cleaned = value.trim();
  return /^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/.test(cleaned)
    ? cleaned
    : "application/octet-stream";
}

function bunnyConfig(): BunnyConfig {
  const zone = process.env.BUNNY_STORAGE_ZONE?.trim();
  const password = process.env.BUNNY_STORAGE_PASSWORD?.trim();
  const configuredEndpoint = process.env.BUNNY_STORAGE_ENDPOINT?.trim() || "https://storage.bunnycdn.com";
  let endpointUrl: URL;
  try {
    endpointUrl = new URL(configuredEndpoint);
  } catch {
    throw new Error("BUNNY_STORAGE_CONFIGURATION_INVALID");
  }
  if (endpointUrl.protocol !== "https:" || !endpointUrl.hostname) {
    throw new Error("BUNNY_STORAGE_CONFIGURATION_INVALID");
  }
  if (!zone || !password) throw new Error("BUNNY_STORAGE_NOT_CONFIGURED");
  return { zone, password, endpoint: endpointUrl.origin.replace(/\/+$/, "") };
}

function bunnyObjectUrl(path: string, config: BunnyConfig) {
  const pieces = [config.zone, ...path.split("/").filter(Boolean)];
  return config.endpoint + "/" + pieces.map((piece) => encodeURIComponent(piece)).join("/");
}

async function bunnyRequest(method: string, path: string, body?: Uint8Array | string, contentType?: string) {
  const config = bunnyConfig();
  const headers: Record<string, string> = { AccessKey: config.password };
  if (contentType) headers["Content-Type"] = contentType;
  const init: RequestInit = { method, headers, cache: "no-store" };
  if (body !== undefined) {
    init.body = (typeof body === "string" ? body : Buffer.from(body)) as unknown as BodyInit;
  }
  return fetch(bunnyObjectUrl(path, config), init);
}

function throwBunnyError(response: Response) {
  if (response.status === 404) throw new Error("BUNNY_OBJECT_NOT_FOUND");
  throw new Error("BUNNY_STORAGE_REQUEST_FAILED");
}

export async function bunnyPut(path: string, bytes: Uint8Array | string, contentType = "application/octet-stream") {
  const response = await bunnyRequest("PUT", path, bytes, contentType);
  if (!response.ok) throwBunnyError(response);
}

export async function bunnyDelete(path: string) {
  const response = await bunnyRequest("DELETE", path);
  if (response.status === 404) return;
  if (!response.ok) throwBunnyError(response);
}

export async function bunnyDownload(path: string) {
  const response = await bunnyRequest("GET", path);
  if (!response.ok) throwBunnyError(response);
  return response;
}

export async function bunnyReadBuffer(path: string) {
  const response = await bunnyDownload(path);
  return Buffer.from(await response.arrayBuffer());
}

export async function bunnyPutStream(
  path: string,
  body: AsyncIterable<Uint8Array>,
  sizeBytes: number,
  contentType = "application/octet-stream"
) {
  const config = bunnyConfig();
  const headers: Record<string, string> = {
    AccessKey: config.password,
    "Content-Type": contentType,
    "Content-Length": String(sizeBytes)
  };
  const response = await fetch(bunnyObjectUrl(path, config), {
    method: "PUT",
    headers,
    body: body as unknown as BodyInit,
    cache: "no-store",
    duplex: "half"
  } as RequestInit & { duplex: "half" });
  if (!response.ok) throwBunnyError(response);
}

export async function* streamVaultParts(storageRoot: string, uploadId: string, expectedChunks: number): AsyncGenerator<Uint8Array> {
  for (let index = 0; index < expectedChunks; index += 1) {
    const response = await bunnyDownload(uploadChunkKey(storageRoot, uploadId, index));
    if (!response.body) throw new Error("BUNNY_OBJECT_NOT_FOUND");
    const reader = response.body.getReader();
    try {
      while (true) {
        const item = await reader.read();
        if (item.done) break;
        if (item.value?.byteLength) yield item.value;
      }
    } finally {
      reader.releaseLock();
    }
  }
}

export async function ensureVaultUsage(
  scope: Pick<VaultScope, "companyId" | "workspaceId" | "vaultQuotaBytes">
) {
  const companyId = new Types.ObjectId(scope.companyId);
  const filter = { companyId };
  let usage;
  try {
    usage = await VaultUsage.findOneAndUpdate(
      filter,
      {
        $set: { quotaBytes: scope.vaultQuotaBytes },
        $setOnInsert: {
          workspaceId: new Types.ObjectId(scope.workspaceId),
          usedBytes: 0,
          usedItems: 0
        }
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    ).lean();
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === 11000)) throw error;
    usage = await VaultUsage.findOne(filter).lean();
  }
  if (!usage) throw new Error("VAULT_USAGE_UNAVAILABLE");

  // Backfill item usage for records created before item quotas existed.
  if (!Number.isSafeInteger(usage.usedItems)) {
    const [fileCount, openUploadCount] = await Promise.all([
      VaultFile.countDocuments({ companyId }),
      VaultUpload.countDocuments({ companyId, status: { $in: ["OPEN", "COMPLETING"] } })
    ]);
    await VaultUsage.updateOne(filter, { $set: { usedItems: fileCount + openUploadCount } });
    usage = await VaultUsage.findOne(filter).lean();
  }
  if (!usage) throw new Error("VAULT_USAGE_UNAVAILABLE");
  return usage;
}

export async function reserveVaultBytes(
  scope: Pick<VaultScope, "companyId" | "workspaceId" | "vaultQuotaBytes" | "vaultMaxItems">,
  bytes: number
) {
  const companyId = new Types.ObjectId(scope.companyId);
  await ensureVaultUsage(scope);
  const updated = await VaultUsage.findOneAndUpdate(
    {
      companyId,
      $expr: {
        $and: [
          { $lte: [{ $add: [{ $ifNull: ["$usedBytes", 0] }, bytes] }, "$quotaBytes"] },
          { $lt: [{ $ifNull: ["$usedItems", 0] }, scope.vaultMaxItems] }
        ]
      }
    },
    { $inc: { usedBytes: bytes, usedItems: 1 } },
    { returnDocument: "after" }
  ).lean();
  if (!updated) {
    const usage = await VaultUsage.findOne({ companyId }).select("usedBytes quotaBytes usedItems").lean();
    if (usage && (usage.usedItems ?? 0) >= scope.vaultMaxItems) throw new Error("VAULT_ITEM_LIMIT_REACHED");
    throw new Error("VAULT_STORAGE_LIMIT_REACHED");
  }
  return updated;
}

export async function releaseVaultBytes(scope: Pick<VaultScope, "companyId" | "workspaceId" | "vaultQuotaBytes">, bytes: number) {
  if (bytes <= 0) return;
  const companyId = new Types.ObjectId(scope.companyId);
  await VaultUsage.updateOne(
    { companyId },
    [{
      $set: {
        usedBytes: { $max: [0, { $subtract: [{ $ifNull: ["$usedBytes", 0] }, bytes] }] },
        usedItems: { $max: [0, { $subtract: [{ $ifNull: ["$usedItems", 0] }, 1] }] }
      }
    }]
  );
}

export function uploadChunkKey(storageRoot: string, uploadId: string, index: number) {
  return ".conventus-staging/" + storageRoot + "/" + uploadId + "/" + index + ".part";
}

export async function removeUploadChunks(storageRoot: string, uploadId: string, expectedChunks: number) {
  for (let index = 0; index < expectedChunks; index += 1) {
    try {
      await bunnyDelete(uploadChunkKey(storageRoot, uploadId, index));
    } catch {
      // Cleanup is best-effort; expiration cleanup retries the same deterministic keys.
    }
  }
}

export async function cleanupExpiredVaultUploads(scope: Pick<VaultScope, "companyId" | "workspaceId">) {
  const now = new Date();
  const companyId = new Types.ObjectId(scope.companyId);
  const workspaceId = new Types.ObjectId(scope.workspaceId);
  const expired = await VaultUpload.find({ companyId, workspaceId, expiresAt: { $lte: now } }).lean();
  for (const upload of expired) {
    const uploadId = String(upload._id);
    await removeUploadChunks(upload.storageRoot, uploadId, upload.expectedChunks);
    const fileExists = await VaultFile.exists({ uploadId: upload._id, companyId, workspaceId });
    const deleted = await VaultUpload.deleteOne({
      _id: upload._id,
      companyId,
      workspaceId,
      expiresAt: { $lte: now }
    });
    if (deleted.deletedCount && !fileExists) await releaseVaultBytes(scope, upload.sizeBytes);
  }
}

export function vaultErrorResponse(error: unknown, fallback = "VAULT_REQUEST_FAILED") {
  const code = error instanceof Error ? error.message : fallback;
  const statusByCode: Record<string, number> = {
    UNAUTHENTICATED: 401,
    FORBIDDEN: 403,
    CSRF_ORIGIN_INVALID: 403,
    COMPANY_NOT_CONFIGURED: 403,
    WORKSPACE_NOT_FOUND: 404,
    COMPANY_NOT_FOUND: 404,
    FOLDER_NOT_FOUND: 404,
    FILE_NOT_FOUND: 404,
    UPLOAD_NOT_FOUND: 404,
    INVALID_FOLDER_ID: 400,
    INVALID_FILE_ID: 400,
    INVALID_UPLOAD_ID: 400,
    INVALID_CHUNK_INDEX: 400,
    INVALID_CHUNK_SIZE: 400,
    FOLDER_NAME_REQUIRED: 400,
    FOLDER_NAME_INVALID: 400,
    FOLDER_NAME_TOO_LONG: 400,
    FOLDER_ALREADY_EXISTS: 409,
    FOLDER_NOT_EMPTY: 409,
    INVALID_UPLOAD_INPUT: 400,
    UPLOAD_CHUNKS_INCOMPLETE: 409,
    UPLOAD_ALREADY_COMPLETING: 409,
    VAULT_STORAGE_LIMIT_REACHED: 413,
    VAULT_ITEM_LIMIT_REACHED: 413,
    VAULT_FEATURE_NOT_INCLUDED: 403,
    VAULT_FILE_TOO_LARGE: 413,
    BUNNY_STORAGE_NOT_CONFIGURED: 503,
    BUNNY_STORAGE_CONFIGURATION_INVALID: 503,
    BUNNY_STORAGE_REQUEST_FAILED: 502,
    BUNNY_OBJECT_NOT_FOUND: 502,
    VAULT_USAGE_UNAVAILABLE: 503
  };
  let status = statusByCode[code] ??
    (code.endsWith("_INVALID") || code.endsWith("_REQUIRED") || code.endsWith("_TOO_LONG") ? 400 : 500);
  if (code.startsWith("BUNNY_")) status = statusByCode[code] ?? 502;
  return jsonError(code || fallback, status);
}

export async function getTenantFolder(
  scope: Pick<VaultScope, "companyId" | "workspaceId">,
  folderId: string
) {
  if (!Types.ObjectId.isValid(folderId)) throw new Error("INVALID_FOLDER_ID");
  const folder = await VaultFolder.findOne({
    _id: new Types.ObjectId(folderId),
    companyId: new Types.ObjectId(scope.companyId),
    workspaceId: new Types.ObjectId(scope.workspaceId)
  }).lean();
  if (!folder) throw new Error("FOLDER_NOT_FOUND");
  return folder;
}
