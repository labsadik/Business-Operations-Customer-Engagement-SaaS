import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Server-side access boundary for every /dashboard page. */
export default async function DashboardLayout({ children }: Readonly<{ children: ReactNode }>) {
  const session = await getSession();
  if (!session) redirect("/login?error=signin_required");
  if (session.role === "PLATFORM_ADMIN") {
    if (!session.companyId || !session.workspaceId) redirect("/admin");
    return children;
  }
  if (session.role === "COMPANY_ADMIN") return children;
  if (session.role !== "EMPLOYEE" || !session.companyId || !session.workspaceId) redirect("/?error=workspace_access_required");
  return children;
}
