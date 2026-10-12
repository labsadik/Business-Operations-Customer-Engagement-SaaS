import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getMongo } from "@/lib/mongodb";
import { Membership } from "@/models/membership";
import { getCompanyPlanAccessState } from "@/lib/plans-server";
import PlanAccessGuard from "@/components/plan-access-guard";

export const dynamic = "force-dynamic";

/** Server-side access boundary for every /dashboard page. */
export default async function DashboardLayout({ children }: Readonly<{ children: ReactNode }>) {
  const session = await getSession();
  if (!session) redirect("/login?error=signin_required");

  // Platform administrators must retain access to repair suspended/expired tenants.
  if (session.role === "PLATFORM_ADMIN") {
    if (!session.companyId || !session.workspaceId) redirect("/admin");
    return children;
  }

  // Unscoped company administrators need to finish initial company setup.
  if (session.role === "COMPANY_ADMIN" && !session.companyId) return children;
  if (!["COMPANY_ADMIN", "EMPLOYEE"].includes(session.role)) {
    redirect("/?error=workspace_access_required");
  }
  if (!session.companyId || !session.workspaceId) {
    redirect("/login?error=workspace_access_required");
  }

  await getMongo();
  const membership = await Membership.findOne({
    companyId: session.companyId,
    workspaceId: session.workspaceId,
    userId: session.userId,
    active: true,
    role: session.role
  }).select("_id").lean();
  if (!membership) redirect("/login?error=workspace_access_revoked");

  const accessState = await getCompanyPlanAccessState(session.companyId);
  if (!accessState) return children;

  // When locked, intentionally omit the child tree: no dashboard page is rendered
  // behind the access screen. Billing and the support-ticket endpoint live outside
  // this layout so customers can resolve the issue without bypassing the lock.
  return (
    <PlanAccessGuard
      initialState={accessState}
      canManageBilling={session.role === "COMPANY_ADMIN"}
      globalGate
    >
      {accessState.locked ? undefined : children}
    </PlanAccessGuard>
  );
}
