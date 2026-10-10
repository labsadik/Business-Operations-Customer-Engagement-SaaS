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
  vaultStorageRoot: string;
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
    Company.findOne({ _id: companyId }).select("_id name slug vaultStorageRoot").lean(),
    Workspace.findOne({ _id: workspaceId, companyId, active: true }).select("_id").lean()
  ]);
  if (!company || !workspace) throw new Error("WORKSPACE_NOT_FOUND");

  // Persist a human-readable name + immutable ID once. A later company rename
  // never changes the storage prefix and therefore cannot orphan existing files.
  let vaultStorageRoot = company.vaultStorageRoot;
  if (typeof vaultStorageRoot !== "string" || !/^company-[a-z0-9-]{1,80}-[0-9a-f]{24}$/.test(vaultStorageRoot)) {
    vaultStorageRoot = buildCompanyVaultRoot(company.name, String(company._id));
    await Company.updateOne({ _id: companyId }, { $set: { vaultStorageRoot } });
  }

  const entitlements = await getCompanyEntitlements(String(companyId));
  if (!entitlements.vaultEnabled) throw new Error("VAULT_FEATURE_NOT_INCLUDED");

  return {
    session,
    companyId: String(companyId),
    workspaceId: String(workspaceId),
    companyName: company.name,
    companySlug: company.slug,
    vaultStorageRoot,
    isPlatformAdmin: session.role === "PLATFORM_ADMIN",
    vaultEnabled: Boolean(entitlements.vaultEnabled),
    vaultQuotaBytes: entitlements.vaultQuotaBytes ?? getVaultDefaultQuotaBytes(),
    vaultMaxFileBytes: Math.min(entitlements.vaultMaxFileBytes ?? getVaultMaxFileBytes(), HARD_MAX_FILE_BYTES),
    vaultMaxItems: entitlements.vaultMaxItems ?? 1000
  };
}

export function buildCompanyVaultRoot(companyName: string, companyId: string) {
  const readable = companyName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "company";
  if (!/^[0-9a-f]{24}$/.test(companyId)) throw new Error("COMPANY_NOT_CONFIGURED");
  return "company-" + readable + "-" + companyId;
}

export function companyVaultRoot(scope: Pick<VaultScope, "vaultStorageRoot">) {
  return scope.vaultStorageRoot;
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

export async function bunnyDownload(path: string, range?: string) {
  const config = bunnyConfig();
  const headers: Record<string, string> = { AccessKey: config.password };
  // Only forward a single byte range; user-controlled arbitrary headers never reach Bunny.
  if (range && /^bytes=(?:\d+-\d*|-\d+)$/.test(range)) headers.Range = range;
  const response = range && headers.Range
    ? await fetch(bunnyObjectUrl(path, config), { method: "GET", headers, cache: "no-store" })
    : await bunnyRequest("GET", path);
  if (!response.ok && response.status !== 206) throwBunnyError(response);
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

export async function* streamRequestBody(
  body: ReadableStream<Uint8Array>,
  expectedSizeBytes: number
): AsyncGenerator<Uint8Array> {
  const reader = body.getReader();
  let receivedBytes = 0;
  let finished = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        finished = true;
        break;
      }
      if (!value?.byteLength) continue;
      receivedBytes += value.byteLength;
      if (receivedBytes > expectedSizeBytes) throw new Error("INVALID_CHUNK_SIZE");
      // Yield the network chunk as-is. Backpressure is provided by fetch's
      // async-iterable request body, so memory remains bounded under load.
      yield value;
    }
  } finally {
    if (!finished) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }

  if (receivedBytes !== expectedSizeBytes) throw new Error("INVALID_CHUNK_SIZE");
}

export async function* streamVaultParts(
  storageRoot: string,
  uploadId: string,
  expectedChunks: number,
  expectedSizeBytes: number
): AsyncGenerator<Uint8Array> {
  let totalBytes = 0;
  for (let index = 0; index < expectedChunks; index += 1) {
    const response = await bunnyDownload(uploadChunkKey(storageRoot, uploadId, index));
    if (!response.body) throw new Error("BUNNY_OBJECT_NOT_FOUND");
    const reader = response.body.getReader();
    try {
      while (true) {
        const item = await reader.read();
        if (item.done) break;
        if (item.value?.byteLength) {
          totalBytes += item.value.byteLength;
          if (totalBytes > expectedSizeBytes) throw new Error("INVALID_CHUNK_SIZE");
          yield item.value;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
  if (totalBytes !== expectedSizeBytes) throw new Error("INVALID_CHUNK_SIZE");
}

export async function ensureVaultUsage(
  scope: Pick<VaultScope, "companyId" | "workspaceId" | "vaultQuotaBytes">
) {
  const companyId = new Types.ObjectId(scope.companyId);
  // Keep the existing company+workspace unique index compatible with earlier
  // deployments, while using a deterministic company-wide counter row.
  const usageWorkspaceId = companyId;
  const filter = { companyId, workspaceId: usageWorkspaceId };
  let usage = await VaultUsage.findOne(filter).lean();

  if (!usage) {
    // Clear expired reservations before measuring tenant usage. This runs only
    // during first-use migration, not on every vault listing request.
    await cleanupExpiredVaultUploads(scope);
    // During the transition from the earlier workspace-based counter, treat
    // persisted file/upload metadata as authoritative and collapse old counters
    // only after the company-wide row has been created.
    const [files, activeUploads] = await Promise.all([
      VaultFile.find({ companyId }).select("_id uploadId sizeBytes storageSizeBytes").lean(),
      VaultUpload.find({
        companyId,
        status: { $in: ["OPEN", "COMPLETING"] }
      }).select("_id sizeBytes").lean()
    ]);
    const fileBytes = files.reduce((sum, file) => sum + (file.storageSizeBytes ?? file.sizeBytes), 0);
    const filesByUpload = new Set(files.map((file) => String(file.uploadId)));
    const pendingUploads = activeUploads.filter((upload) => !filesByUpload.has(String(upload._id)));
    const pendingBytes = pendingUploads.reduce((sum, upload) => sum + upload.sizeBytes, 0);
    const usedBytes = fileBytes + pendingBytes;
    const usedItems = files.length + pendingUploads.length;

    try {
      usage = await VaultUsage.findOneAndUpdate(
        filter,
        {
          $set: { quotaBytes: scope.vaultQuotaBytes },
          $setOnInsert: { usedBytes, usedItems, counterVersion: 2 }
        },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
      ).lean();
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === 11000)) throw error;
      usage = await VaultUsage.findOne(filter).lean();
    }

    // Old rows are now superseded by the company-level ledger row.
    await VaultUsage.deleteMany({ companyId, workspaceId: { $ne: usageWorkspaceId } });
  }

  if (!usage) throw new Error("VAULT_USAGE_UNAVAILABLE");

  // Repair legacy counters without requiring MongoDB replica-set transactions.
  // A guarded atomic update makes concurrent repairs idempotent and prevents a
  // second repair from overwriting an already-upgraded counter after reservations.
  if (usage.counterVersion !== 2) {
    await cleanupExpiredVaultUploads(scope);
    const [files, activeUploads] = await Promise.all([
      VaultFile.find({ companyId }).select("uploadId sizeBytes storageSizeBytes").lean(),
      VaultUpload.find({
        companyId,
        status: { $in: ["OPEN", "COMPLETING"] },
        expiresAt: { $gt: new Date() }
      }).select("_id sizeBytes").lean()
    ]);
    const filesByUpload = new Set(files.map((file) => String(file.uploadId)));
    const pendingUploads = activeUploads.filter((upload) => !filesByUpload.has(String(upload._id)));
    const usedBytes = files.reduce((sum, file) => sum + (file.storageSizeBytes ?? file.sizeBytes), 0) +
      pendingUploads.reduce((sum, upload) => sum + upload.sizeBytes, 0);
    await VaultUsage.updateOne(
      { ...filter, counterVersion: { $ne: 2 } },
      { $set: {
        usedBytes,
        usedItems: files.length + pendingUploads.length,
        quotaBytes: scope.vaultQuotaBytes,
        counterVersion: 2
      } }
    );
    usage = await VaultUsage.findOne(filter).lean();
  }

  if (!Number.isSafeInteger(usage?.usedItems)) {
    const [files, activeUploads] = await Promise.all([
      VaultFile.find({ companyId }).select("uploadId").lean(),
      VaultUpload.find({ companyId, status: { $in: ["OPEN", "COMPLETING"] } }).select("_id").lean()
    ]);
    const filesByUpload = new Set(files.map((file) => String(file.uploadId)));
    const pendingCount = activeUploads.filter((upload) => !filesByUpload.has(String(upload._id))).length;
    await VaultUsage.updateOne(filter, { $set: { usedItems: files.length + pendingCount } });
    usage = await VaultUsage.findOne(filter).lean();
  }

  // Plan edits can change the quota without changing any stored file bytes.
  await VaultUsage.updateOne(filter, { $set: { quotaBytes: scope.vaultQuotaBytes } });
  if (!usage) throw new Error("VAULT_USAGE_UNAVAILABLE");
  return { ...usage, quotaBytes: scope.vaultQuotaBytes };
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
      workspaceId: companyId,
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
    const usage = await VaultUsage.findOne({ companyId, workspaceId: companyId }).select("usedBytes quotaBytes usedItems").lean();
    if (usage && (usage.usedItems ?? 0) >= scope.vaultMaxItems) throw new Error("VAULT_ITEM_LIMIT_REACHED");
    throw new Error("VAULT_STORAGE_LIMIT_REACHED");
  }
  return updated;
}

export async function releaseVaultBytes(scope: Pick<VaultScope, "companyId">, bytes: number) {
  if (bytes <= 0) return;
  const companyId = new Types.ObjectId(scope.companyId);
  await VaultUsage.updateOne(
    { companyId, workspaceId: companyId },
    [{
      $set: {
        usedBytes: { $max: [0, { $subtract: [{ $ifNull: ["$usedBytes", 0] }, bytes] }] },
        usedItems: { $max: [0, { $subtract: [{ $ifNull: ["$usedItems", 0] }, 1] }] }
      }
    }]
  );
}

export async function deleteVaultFileAndRelease(
  scope: Pick<VaultScope, "companyId" | "workspaceId">,
  file: { _id: Types.ObjectId; sizeBytes: number; storageSizeBytes?: number }
) {
  const companyId = new Types.ObjectId(scope.companyId);
  const workspaceId = new Types.ObjectId(scope.workspaceId);
  // This conditional single-document delete makes retries idempotent. Usage
  // counters are released only by the request that actually removed the file.
  const deleted = await VaultFile.deleteOne({ _id: file._id, companyId, workspaceId });
  if (!deleted.deletedCount) return false;

  try {
    await releaseVaultBytes(scope, file.storageSizeBytes ?? file.sizeBytes);
  } catch (error) {
    // The metadata deletion has succeeded; mark the counter stale so the next
    // vault request can reconcile it rather than returning a false delete failure.
    await VaultUsage.updateOne(
      { companyId, workspaceId: companyId },
      { $set: { counterVersion: 1 } }
    ).catch(() => undefined);
    console.error("Vault file deleted but usage counter needs reconciliation", {
      companyId: String(companyId),
      fileId: String(file._id),
      error: error instanceof Error ? error.message : "USAGE_RELEASE_FAILED"
    });
  }
  return true;
}

export async function getVaultUsageSnapshot(
  scope: Pick<VaultScope, "companyId" | "vaultQuotaBytes" | "vaultMaxItems" | "vaultMaxFileBytes">
) {
  const companyId = new Types.ObjectId(scope.companyId);
  const usageFilter = { companyId, workspaceId: companyId };
  let usage = await VaultUsage.findOne(usageFilter)
    .select("usedBytes usedItems counterVersion")
    .lean();

  // Routine reads are O(1): use the atomic quota ledger instead of aggregating
  // every file and active upload on every folder navigation or profile request.
  // Reconciliation scans only run when the versioned ledger is missing or stale.
  if (
    !usage ||
    usage.counterVersion !== 2 ||
    !Number.isSafeInteger(usage.usedBytes) ||
    !Number.isSafeInteger(usage.usedItems)
  ) {
    usage = await ensureVaultUsage({
      companyId: String(companyId),
      workspaceId: String(companyId),
      vaultQuotaBytes: scope.vaultQuotaBytes
    });
  }

  const usedBytes = Math.max(0, usage.usedBytes ?? 0);
  const usedItems = Math.max(0, usage.usedItems ?? 0);
  return {
    usedBytes,
    quotaBytes: scope.vaultQuotaBytes,
    availableBytes: Math.max(0, scope.vaultQuotaBytes - usedBytes),
    usedItems,
    maxItems: scope.vaultMaxItems,
    maxFileBytes: scope.vaultMaxFileBytes
  };
}

export function uploadChunkKey(storageRoot: string, uploadId: string, index: number) {
  return ".conventus-staging/" + storageRoot + "/" + uploadId + "/" + index + ".part";
}

export async function removeUploadChunks(storageRoot: string, uploadId: string, expectedChunks: number) {
  // Bound provider concurrency during cleanup instead of issuing one request per
  // chunk at once. Uploads are capped at 250 MiB, but corrupted metadata is capped too.
  const requestedChunkCount = Number.isSafeInteger(expectedChunks) && expectedChunks > 0 ? expectedChunks : 0;
  const chunkCount = Math.min(requestedChunkCount, Math.ceil(HARD_MAX_FILE_BYTES / VAULT_CHUNK_SIZE_BYTES));
  const workerCount = Math.min(6, chunkCount);
  let nextIndex = 0;
  const worker = async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= chunkCount) return;
      try {
        await bunnyDelete(uploadChunkKey(storageRoot, uploadId, index));
      } catch {
        // Cleanup is best-effort; expiration cleanup retries the same deterministic keys.
      }
    }
  };
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}

export async function cleanupExpiredVaultUploads(
  scope?: Pick<VaultScope, "companyId">,
  batchLimit?: number
) {
  const now = new Date();
  const filter = scope
    ? { companyId: new Types.ObjectId(scope.companyId), expiresAt: { $lte: now } }
    : { expiresAt: { $lte: now } };
  const limit = Number.isSafeInteger(batchLimit) && (batchLimit ?? 0) > 0
    ? Math.min(batchLimit as number, 25)
    : undefined;
  let query = VaultUpload.find(filter).sort({ expiresAt: 1 }).select(
    "_id companyId sizeBytes storageRoot expectedChunks expiresAt"
  );
  if (limit) query = query.limit(limit + 1);
  const expired = await query.lean();
  const batch = limit ? expired.slice(0, limit) : expired;
  const hasMoreWork = Boolean(limit && expired.length > limit);

  for (const upload of batch) {
    const uploadId = String(upload._id);
    await removeUploadChunks(upload.storageRoot, uploadId, upload.expectedChunks);
    const companyId = upload.companyId;
    const fileExists = await VaultFile.exists({ uploadId: upload._id, companyId });
    const deleted = await VaultUpload.deleteOne({
      _id: upload._id,
      companyId,
      expiresAt: { $lte: now }
    });
    if (deleted.deletedCount && !fileExists) {
      await releaseVaultBytes({ companyId: String(companyId) }, upload.sizeBytes);
    }
  }

  return { processed: batch.length, hasMoreWork };
}

export function vaultErrorResponse(error: unknown, fallback = "VAULT_REQUEST_FAILED") {
  const rawCode = error instanceof Error ? error.message : fallback;
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
  const code = statusByCode[rawCode] !== undefined ||
    /^(?:INVALID_[A-Z0-9_]+|[A-Z0-9]+(?:_[A-Z0-9]+)*_(?:INVALID|REQUIRED|TOO_LONG|ALREADY_EXISTS|NOT_FOUND))$/.test(rawCode)
      ? rawCode
      : fallback;
  let status = statusByCode[rawCode] ??
    (rawCode.endsWith("_INVALID") || rawCode.endsWith("_REQUIRED") || rawCode.endsWith("_TOO_LONG") ? 400 : 500);
  if (rawCode.startsWith("BUNNY_")) status = statusByCode[rawCode] ?? 502;
  if (status >= 500) {
    console.error("Company vault operation failed", {
      code: rawCode,
      responseCode: code,
      detail: error instanceof Error ? error.message : "UNKNOWN_ERROR"
    });
  }
  // Internal MongoDB/provider errors belong in server logs, never in a user response.
  return jsonError(status >= 500 ? (statusByCode[rawCode] !== undefined ? rawCode : fallback) : code || fallback, status);
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
