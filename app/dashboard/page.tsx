import { redirect } from "next/navigation";
import WorkspaceDashboard from "@/components/workspace-dashboard";
import { getSession } from "@/lib/session";
import { Membership } from "@/models/membership";

export const dynamic = "force-dynamic";
export const metadata = { title: "Workspace" };

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login?error=signin_required");
  if (!["COMPANY_ADMIN", "EMPLOYEE", "PLATFORM_ADMIN"].includes(session.role)) redirect("/login?error=workspace_access_required");
  if (session.role === "PLATFORM_ADMIN" && !session.companyId) redirect("/admin");
  if (session.role === "EMPLOYEE" && (!session.companyId || !session.workspaceId)) redirect("/login?error=workspace_access_required");

  if (session.companyId && (session.role === "COMPANY_ADMIN" || session.role === "EMPLOYEE")) {
    const membership = await Membership.findOne({
      companyId: session.companyId, workspaceId: session.workspaceId, userId: session.userId,
      active: true, role: session.role
    }).lean();
    if (!membership) redirect("/login?error=workspace_access_revoked");
  }

  // Unscoped company admins may use onboarding to create their first company;
  // every tenant API requires a validated company/workspace scope.
  return <WorkspaceDashboard user={{ id: session.userId, name: session.name, email: session.email, image: session.image }} />;
}
