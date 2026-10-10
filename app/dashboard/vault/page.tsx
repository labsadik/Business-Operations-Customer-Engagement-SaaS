import { redirect } from "next/navigation";
import { Types } from "mongoose";
import { getMongo } from "@/lib/mongodb";
import { getSession } from "@/lib/session";
import { Company } from "@/models/company";
import { Membership } from "@/models/membership";
import { VaultFolder } from "@/models/vault-folder";
import { VaultFile } from "@/models/vault-file";
import { getCompanyEntitlements } from "@/lib/plans-server";
import { getTenantFolder, getVaultUsageSnapshot } from "@/features/company-vault/server/vault-storage";
import CompanyVault from "@/components/company-vault";

export const dynamic = "force-dynamic";
export const metadata = { title: "Company vault" };

const PAGE_SIZE = 100;
const DEFAULT_QUOTA_BYTES = 5 * 1024 * 1024 * 1024;
const DEFAULT_MAX_FILE_BYTES = 100 * 1024 * 1024;

type PageProps = {
  searchParams: Promise<{ folderId?: string | string[] }>;
};

export default async function CompanyVaultPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login?error=signin_required");
  if (!["COMPANY_ADMIN", "EMPLOYEE", "PLATFORM_ADMIN"].includes(session.role)) {
    redirect("/login?error=workspace_access_required");
  }
  if (session.role === "PLATFORM_ADMIN" && !session.companyId) redirect("/admin");
  if (session.role === "COMPANY_ADMIN" && !session.companyId) redirect("/dashboard");
  if (session.role === "EMPLOYEE" && (!session.companyId || !session.workspaceId)) {
    redirect("/login?error=workspace_access_required");
  }

  await getMongo();
  if (session.role !== "PLATFORM_ADMIN") {
    const membership = await Membership.findOne({
      companyId: session.companyId,
      workspaceId: session.workspaceId,
      userId: session.userId,
      active: true,
      role: session.role
    }).select("_id").lean();
    if (!membership) redirect("/login?error=workspace_access_revoked");
  }

  const company = session.companyId
    ? await Company.findById(session.companyId).select("_id name").lean()
    : null;
  if (!company) redirect("/dashboard");
  const entitlements = await getCompanyEntitlements(String(company._id));
  if (!entitlements.vaultEnabled) redirect("/dashboard");

  // All initial reads use the authenticated session's exact company/workspace
  // scope. Never trust a folder ID from the URL without validating its tenant.
  if (!session.workspaceId || !Types.ObjectId.isValid(session.companyId ?? "") ||
      !Types.ObjectId.isValid(session.workspaceId)) {
    redirect(session.role === "PLATFORM_ADMIN" ? "/admin" : "/dashboard");
  }
  const companyId = new Types.ObjectId(String(company._id));
  const workspaceId = new Types.ObjectId(session.workspaceId);
  const query = await searchParams;
  const requestedFolderId = Array.isArray(query.folderId) ? query.folderId[0] : query.folderId;
  if (requestedFolderId && !Types.ObjectId.isValid(requestedFolderId)) {
    redirect("/dashboard/vault");
  }

  const scope = { companyId: String(companyId), workspaceId: String(workspaceId) };
  let currentFolder = null as Awaited<ReturnType<typeof getTenantFolder>> | null;
  if (requestedFolderId) {
    try {
      currentFolder = await getTenantFolder(scope, requestedFolderId);
    } catch (error) {
      if (error instanceof Error && error.message === "FOLDER_NOT_FOUND") {
        redirect("/dashboard/vault");
      }
      throw error;
    }
  }

  const parentFolderId = currentFolder?._id ?? null;
  const [folderRows, fileRows, usage] = await Promise.all([
    VaultFolder.find({ companyId, workspaceId, parentFolderId })
      .sort({ nameKey: 1, _id: 1 })
      .select("_id parentFolderId name nameKey createdAt updatedAt")
      .limit(PAGE_SIZE + 1)
      .lean(),
    VaultFile.find({ companyId, workspaceId, folderId: parentFolderId })
      .sort({ originalName: 1, _id: 1 })
      .select("_id originalName mimeType sizeBytes createdAt updatedAt")
      .limit(PAGE_SIZE + 1)
      .lean(),
    getVaultUsageSnapshot({
      companyId: String(companyId),
      vaultQuotaBytes: entitlements.vaultQuotaBytes ?? DEFAULT_QUOTA_BYTES,
      vaultMaxFileBytes: entitlements.vaultMaxFileBytes ?? DEFAULT_MAX_FILE_BYTES,
      vaultMaxItems: entitlements.vaultMaxItems ?? 1000
    })
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

  const initialSnapshot = {
    companyName: company.name,
    currentFolder: currentFolder ? { id: String(currentFolder._id), name: currentFolder.name } : null,
    breadcrumbs,
    folders: folders.map((folder) => ({
      id: String(folder._id),
      name: folder.name,
      createdAt: folder.createdAt instanceof Date ? folder.createdAt.toISOString() : String(folder.createdAt),
      updatedAt: folder.updatedAt instanceof Date ? folder.updatedAt.toISOString() : String(folder.updatedAt)
    })),
    files: files.map((file) => ({
      id: String(file._id),
      name: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      createdAt: file.createdAt instanceof Date ? file.createdAt.toISOString() : String(file.createdAt),
      updatedAt: file.updatedAt instanceof Date ? file.updatedAt.toISOString() : String(file.updatedAt)
    })),
    nextFolderCursor: hasMoreFolders && folders.length
      ? Buffer.from(JSON.stringify({
          name: folders[folders.length - 1].nameKey,
          id: String(folders[folders.length - 1]._id)
        })).toString("base64url")
      : null,
    nextFileCursor: hasMoreFiles && files.length
      ? Buffer.from(JSON.stringify({
          name: files[files.length - 1].originalName,
          id: String(files[files.length - 1]._id)
        })).toString("base64url")
      : null,
    usage: {
      usedBytes: usage.usedBytes,
      quotaBytes: usage.quotaBytes,
      availableBytes: usage.availableBytes,
      usedItems: usage.usedItems,
      maxItems: usage.maxItems,
      maxFileBytes: usage.maxFileBytes
    }
  };

  return (
    <CompanyVault
      companyName={company.name}
      currentRole={session.role}
      taskManagementEnabled={Boolean(entitlements.taskManagementEnabled)}
      initialSnapshot={initialSnapshot}
    />
  );
}
