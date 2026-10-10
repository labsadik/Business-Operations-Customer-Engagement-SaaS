import { Types } from "mongoose";
import { getMongo } from "@/lib/mongodb";
import { requirePlatformAdmin } from "@/lib/admin";
import { jsonError, jsonOk } from "@/lib/http";
import { LiveChatConversation } from "@/models/live-chat-conversation";
import { LiveChatMonthlyUsage } from "@/models/live-chat-monthly-usage";
import { Company } from "@/models/company";
import { getCompanyEntitlements, getCompanySubscription } from "@/lib/plans-server";
import { getManagedPlan } from "@/lib/plan-catalog";
import { currentMonthStart, currentPeriodKey } from "@/lib/live-chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requirePlatformAdmin();
    await getMongo();
    const start = currentMonthStart();
    const usageRows = await LiveChatMonthlyUsage.aggregate<{
      _id: Types.ObjectId;
      chatCount: number;
      customerCount: number;
    }>([
      { $match: { periodKey: currentPeriodKey() } },
      { $group: {
        _id: "$companyId",
        chatCount: { $sum: "$chatCount" },
        customerCount: { $sum: "$customerCount" }
      } },
      { $sort: { chatCount: -1, _id: 1 } },
      { $limit: 300 }
    ]);
    const companyIds = [...new Set(usageRows.map((row) => String(row._id)))];
    const companies = await Company.find({ _id: { $in: companyIds.map((id) => new Types.ObjectId(id)) } })
      .select("_id name slug")
      .lean();
    const companyMap = new Map(companies.map((row) => [String(row._id), row]));
    const openRows = await LiveChatConversation.aggregate<{ _id: Types.ObjectId; openChats: number }>([
      { $match: { companyId: { $in: usageRows.map((row) => row._id) }, status: "OPEN", expiresAt: { $gt: new Date() } } },
      { $group: { _id: "$companyId", openChats: { $sum: 1 } } }
    ]);
    const openChatMap = new Map(openRows.map((row) => [String(row._id), row.openChats]));
    const rows = await Promise.all(usageRows.map(async (row) => {
      const companyId = String(row._id);
      const company = companyMap.get(companyId);
      if (!company) return null;
      const [subscription, entitlements] = await Promise.all([
        getCompanySubscription(companyId),
        getCompanyEntitlements(companyId)
      ]);
      const openChats = openChatMap.get(companyId) ?? 0;
      const plan = await getManagedPlan(subscription.planId, { includeArchived: true });
      return {
        companyId,
        companyName: company.name,
        companySlug: company.slug,
        planId: subscription.planId,
        planName: plan?.name ?? subscription.planId,
        enabled: Boolean(entitlements.liveChatEnabled),
        monthlyChats: row.chatCount,
        uniqueCustomers: row.customerCount,
        openChats,
        monthlyChatLimit: entitlements.liveChatMonthlyLimit,
        customerLimit: entitlements.liveChatCustomerLimit,
        agentLimit: entitlements.liveChatAgentLimit,
        retentionDays: entitlements.liveChatRetentionDays,
        cooldownSeconds: entitlements.liveChatMessageCooldownSeconds
      };
    }));
    const totalChats = usageRows.reduce((sum, row) => sum + row.chatCount, 0);
    const totalUniqueCustomers = usageRows.reduce((sum, row) => sum + row.customerCount, 0);
    const totalOpenChats = rows.reduce((sum, row) => sum + (row?.openChats ?? 0), 0);
    return jsonOk({
      periodStart: start,
      totals: { companiesUsingChat: rows.filter(Boolean).length, totalChats, totalUniqueCustomers, totalOpenChats },
      companies: rows.filter(Boolean)
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "ADMIN_LIVE_CHAT_USAGE_FAILED";
    return jsonError(code, code === "UNAUTHENTICATED" ? 401 : code === "FORBIDDEN" ? 403 : 500);
  }
}
