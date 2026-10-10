import { redirect } from "next/navigation";
import { Types } from "mongoose";
import LiveChatDashboard from "@/components/live-chat-dashboard";
import { getMongo } from "@/lib/mongodb";
import { getSession } from "@/lib/session";
import { Company } from "@/models/company";
import { Membership } from "@/models/membership";
import { getCompanyEntitlements } from "@/lib/plans-server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Live Chat · Conventus" };

export default async function LiveChatPage() {
  const session = await getSession();
  if (!session) redirect("/login?error=signin_required");
  if (session.role === "PLATFORM_ADMIN") redirect("/admin/live-chat");
  if (!["COMPANY_ADMIN", "EMPLOYEE"].includes(session.role)) redirect("/login?error=workspace_access_required");
  if (!session.companyId || !session.workspaceId || !Types.ObjectId.isValid(session.companyId) || !Types.ObjectId.isValid(session.workspaceId)) {
    redirect("/dashboard");
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
  const company = await Company.findById(session.companyId).select("_id name").lean();
  if (!company) redirect("/dashboard");
  const entitlements = await getCompanyEntitlements(String(company._id));
  if (!entitlements.liveChatEnabled) redirect("/dashboard?notice=live_chat_not_included");
  return (
    <LiveChatDashboard
      canManageSettings={session.role === "COMPANY_ADMIN"}
      companyName={company.name}
      taskManagementEnabled={Boolean(entitlements.taskManagementEnabled)}
      vaultEnabled={Boolean(entitlements.vaultEnabled)}
      sessionRole={session.role}
    />
  );
}
