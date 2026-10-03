import { redirect } from "next/navigation";
import WorkspaceDashboard from "@/components/workspace-dashboard";
import { getSession } from "@/lib/session";
import { Membership } from "@/models/membership";

export const dynamic = "force-dynamic";
export const metadata = { title: "Workspace" };

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login?error=signin_required");
  if (!["COMPANY_OWNER", "COMPANY_ADMIN", "EMPLOYEE", "PLATFORM_ADMIN"].includes(session.role)) {
    redirect("/login?error=workspace_access_required");
  }

  if (["COMPANY_ADMIN", "EMPLOYEE"].includes(session.role)) {
    if (!session.companyId) redirect("/login?error=workspace_access_required");
    const membership = await Membership.findOne({ companyId: session.companyId, userId: session.userId, active: true }).lean();
    if (!membership) redirect("/login?error=workspace_access_revoked");
  }

  if (session.companyId && ["COMPANY_OWNER", "COMPANY_ADMIN", "EMPLOYEE"].includes(session.role)) {
    const membership = await Membership.findOne({ companyId: session.companyId, userId: session.userId, active: true }).lean();
    if (!membership) redirect("/login?error=workspace_access_revoked");
  }

  return <WorkspaceDashboard />;
}
