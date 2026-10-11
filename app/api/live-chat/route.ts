import { Types } from "mongoose";
import { getMongo } from "@/lib/mongodb";
import { jsonError, jsonOk } from "@/lib/http";
import { LiveChatConversation } from "@/models/live-chat-conversation";
import { LiveChatMonthlyUsage } from "@/models/live-chat-monthly-usage";
import { currentPeriodKey, liveChatError, requireLiveChatScope } from "@/lib/live-chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const scope = await requireLiveChatScope({ allowSuspendedRead: true });
    await getMongo();
    const now = new Date();
    const tenant = { companyId: new Types.ObjectId(scope.companyId), workspaceId: new Types.ObjectId(scope.workspaceId) };
    const conversations = await LiveChatConversation.find({
      ...tenant,
      status: { $in: ["OPEN", "CLOSED"] },
      expiresAt: { $gt: now }
    })
      .sort({ lastMessageAt: -1, _id: -1 })
      .limit(100)
      .select("_id customerName customerEmail customerPhone status messageCount lastMessageAt nextCustomerMessageAt expiresAt createdAt geoCountry geoCity geoRegion ipDisplay browser os deviceType referrer assignedAgentId unreadAgentCount lastMessagePreview")
      .lean();

    const [monthlyUsage, openChats] = await Promise.all([
      LiveChatMonthlyUsage.findOne({ companyId: tenant.companyId, periodKey: currentPeriodKey(now) }).select("chatCount customerCount").lean(),
      LiveChatConversation.countDocuments({ ...tenant, status: "OPEN", expiresAt: { $gt: now } })
    ]);

    return jsonOk({
      items: conversations.map((item) => ({
        id: String(item._id),
        customerName: item.customerName || "Anonymous customer",
        customerEmail: item.customerEmail || "",
        customerPhone: item.customerPhone || "",
        status: item.status,
        messageCount: item.messageCount,
        lastMessageAt: item.lastMessageAt,
        nextCustomerMessageAt: item.nextCustomerMessageAt,
        expiresAt: item.expiresAt,
        createdAt: item.createdAt,
        geoCountry: item.geoCountry || "",
        geoCity: item.geoCity || "",
        geoRegion: item.geoRegion || "",
        ipDisplay: item.ipDisplay || "",
        browser: item.browser || "",
        os: item.os || "",
        deviceType: item.deviceType || "DESKTOP",
        referrer: item.referrer || "",
        assignedAgentId: item.assignedAgentId ? String(item.assignedAgentId) : null,
        unreadAgentCount: item.unreadAgentCount ?? 0,
        lastMessagePreview: item.lastMessagePreview || ""
      })),
      usage: {
        monthlyChats: monthlyUsage?.chatCount ?? 0,
        uniqueCustomers: monthlyUsage?.customerCount ?? 0,
        openChats,
        monthlyChatLimit: scope.entitlements.liveChatMonthlyLimit,
        customerLimit: scope.entitlements.liveChatCustomerLimit,
        agentLimit: scope.entitlements.liveChatAgentLimit,
        retentionDays: scope.entitlements.liveChatRetentionDays,
        cooldownSeconds: scope.entitlements.liveChatMessageCooldownSeconds,
        pdfExportEnabled: scope.entitlements.liveChatPdfExportEnabled,
        deleteEnabled: scope.entitlements.liveChatDeleteEnabled
      }
    });
  } catch (error) {
    const { code, status } = liveChatError(error, "LIVE_CHAT_LIST_FAILED");
    return jsonError(code, status);
  }
}
