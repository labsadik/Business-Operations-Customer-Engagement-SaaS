import { redirect } from "next/navigation";
import WorkspaceDashboard from "@/components/workspace-dashboard";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Workspace" };

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login?error=signin_required");
  if (!["COMPANY_OWNER", "COMPANY_ADMIN", "EMPLOYEE", "PLATFORM_ADMIN"].includes(session.role)) {
    redirect("/login?error=workspace_access_required");
  }

  return <WorkspaceDashboard />;
}
