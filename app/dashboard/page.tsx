import { redirect } from "next/navigation";
import WorkspaceDashboard from "@/components/workspace-dashboard";
import { getSession } from "@/lib/session";
import { Membership } from "@/models/membership";
import { Company } from "@/models/company";

export const dynamic = "force-dynamic";
export const metadata = { title: "Workspace" };

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login?error=signin_required");
  if (!["COMPANY_OWNER", "COMPANY_ADMIN", "EMPLOYEE", "PLATFORM_ADMIN"].includes(session.role)) {
    redirect("/login?error=workspace_access_required");
  }

  // Platform admins normally live in /admin. A managed-company scope is the
  // explicit exception that opens one tenant's real workspace dashboard.
  if (session.role === "PLATFORM_ADMIN" && !session.companyId) redirect("/admin");

  if (["COMPANY_ADMIN", "EMPLOYEE"].includes(session.role) && !session.companyId) {
    redirect("/login?error=workspace_access_required");
  }

  if (session.companyId && ["COMPANY_OWNER", "COMPANY_ADMIN", "EMPLOYEE"].includes(session.role)) {
    const membership = await Membership.findOne({ companyId: session.companyId, userId: session.userId, active: true }).lean();
    if (!membership) redirect("/login?error=workspace_access_revoked");
  }

  if (session.role === "COMPANY_OWNER" && !session.companyId) {
    const company = await Company.findOne({ ownerUserId: session.userId }).lean();
    if (company) {
      const membership = await Membership.findOne({
        companyId: company._id,
        userId: session.userId,
        active: true,
        role: "COMPANY_OWNER"
      }).lean();
      if (membership) {
        const { updateSessionScope } = await import("@/lib/session");
        await updateSessionScope(session.userId, {
          companyId: String(company._id),
          workspaceId: String(membership.workspaceId),
          role: "COMPANY_OWNER"
        });
        redirect("/dashboard");
      }
    }
  }

  return <WorkspaceDashboard user={{ id: session.userId, name: session.name, email: session.email, image: session.image }} />;
}
