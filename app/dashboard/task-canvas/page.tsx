import { redirect } from "next/navigation";
import { getMongo } from "@/lib/mongodb";
import { getSession } from "@/lib/session";
import { getCompanyEntitlements, getCompanyPlanAccessState } from "@/lib/plans-server";
import PlanAccessGuard from "@/components/plan-access-guard";
import { Company } from "@/models/company";
import { Membership } from "@/models/membership";
import TaskCanvasDashboard from "@/features/task-canvas/components/task-canvas-dashboard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Task Canvas · Team whiteboards" };

export default async function TaskCanvasPage() {
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

  const accessState = session.role === "PLATFORM_ADMIN"
    ? null
    : await getCompanyPlanAccessState(String(company._id));
  if (accessState?.locked) {
    return <PlanAccessGuard initialState={accessState} canManageBilling={session.role === "COMPANY_ADMIN"} />;
  }

  const entitlements = await getCompanyEntitlements(String(company._id));
  if (!entitlements.taskCanvasEnabled) {
    redirect("/dashboard?notice=task_canvas_not_included");
  }
  const maxCollaborators = Math.min(200, Math.max(2, entitlements.taskCanvasMaxCollaborators ?? 2));
  const canvasLimit = Math.min(100, Math.max(1, entitlements.taskCanvasHistoryLimit ?? 10));

  return (
    <PlanAccessGuard
      initialState={accessState}
      canManageBilling={session.role === "COMPANY_ADMIN"}
      bypass={session.role === "PLATFORM_ADMIN"}
    >
      <TaskCanvasDashboard
        companyName={company.name}
        currentRole={session.role}
        currentUserId={session.userId}
        taskCanvasEnabled={Boolean(entitlements.taskCanvasEnabled)}
        taskManagementEnabled={Boolean(entitlements.taskManagementEnabled)}
        vaultEnabled={Boolean(entitlements.vaultEnabled)}
        liveChatEnabled={Boolean(entitlements.liveChatEnabled)}
        maxCollaborators={maxCollaborators}
        canvasLimit={canvasLimit}
      />
    </PlanAccessGuard>
  );
}
