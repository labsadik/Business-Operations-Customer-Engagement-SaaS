import { redirect } from "next/navigation";
import { getMongo } from "@/lib/mongodb";
import { getSession } from "@/lib/session";
import { Company } from "@/models/company";
import { Membership } from "@/models/membership";
import { getCompanyEntitlements } from "@/lib/plans-server";
import CompanyVault from "@/components/company-vault";

export const dynamic = "force-dynamic";
export const metadata = { title: "Company vault" };

export default async function CompanyVaultPage() {
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

  return (
    <CompanyVault
      companyName={company.name}
      currentRole={session.role}
      taskManagementEnabled={Boolean(entitlements.taskManagementEnabled)}
    />
  );
}
