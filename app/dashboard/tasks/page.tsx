import { redirect } from "next/navigation";
import { TaskManagementDashboard } from "@/features/task-management/components";
import { getMongo } from "@/lib/mongodb";
import { getSession } from "@/lib/session";
import { getCompanyEntitlements } from "@/lib/plans-server";
import { Company } from "@/models/company";
import { Membership } from "@/models/membership";

export const dynamic = "force-dynamic";
export const metadata = { title: "Task management" };

export default async function TaskManagementPage() {
  const session = await getSession();
  if (!session) redirect("/login?error=signin_required");
  if (!["COMPANY_ADMIN", "EMPLOYEE", "PLATFORM_ADMIN"].includes(session.role)) {
    redirect("/login?error=workspace_access_required");
  }
  if (session.role === "PLATFORM_ADMIN" && !session.companyId) redirect("/admin");
  if (session.role === "COMPANY_ADMIN" && !session.companyId) redirect("/dashboard");
  if (session.role === "EMPLOYEE" && (!session.companyId || !session.workspaceId)) redirect("/login?error=workspace_access_required");

  await getMongo();
  if (session.companyId && ["COMPANY_ADMIN", "EMPLOYEE"].includes(session.role)) {
    const membership = await Membership.findOne({
      companyId: session.companyId,
      workspaceId: session.workspaceId,
      userId: session.userId,
      active: true,
      role: session.role
    }).lean();
    if (!membership) redirect("/login?error=workspace_access_revoked");
  }

  const company = session.companyId
    ? await Company.findById(session.companyId).select("name").lean()
    : null;
  if (!company) redirect("/dashboard");

  const plan = session.role === "PLATFORM_ADMIN"
    ? { taskManagementEnabled: true }
    : await getCompanyEntitlements(String(company._id));

  return (
    <TaskManagementDashboard
      companyName={company.name}
      userName={session.name?.trim() || session.email}
      userEmail={session.email}
      userImage={session.image}
      userId={session.userId}
      currentRole={session.role}
      taskManagementEnabled={Boolean(plan.taskManagementEnabled)}
    />
  );
}
