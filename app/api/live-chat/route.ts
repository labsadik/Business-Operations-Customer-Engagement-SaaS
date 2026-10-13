import { Types } from "mongoose";
import { getMongo } from "@/lib/mongodb";
import { jsonError, jsonOk } from "@/lib/http";
import { LiveChatConversation } from "@/models/live-chat-conversation";
import { LiveChatMonthlyUsage } from "@/models/live-chat-monthly-usage";
import { currentPeriodKey, liveChatError, requireLiveChatScope } from "@/lib/live-chat";
import { decodeListCursor, encodeListCursor, parseListLimit } from "@/lib/list-pagination";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const scope = await requireLiveChatScope({ allowSuspendedRead: true });
    await getMongo();
    const url = new URL(request.url);
    const limit = parseListLimit(url.searchParams.get("limit"));
    const cursorValue = url.searchParams.get("cursor");
    const cursor = decodeListCursor(cursorValue);
    if (cursorValue && !cursor) return jsonError("INVALID_LIVE_CHAT_CURSOR", 400);
    const cursorDate = cursor ? new Date(cursor.key) : null;
    if (cursorDate && !Number.isFinite(cursorDate.getTime())) return jsonError("INVALID_LIVE_CHAT_CURSOR", 400);

    const status = url.searchParams.get("status");
    if (status && !["OPEN", "UNASSIGNED", "CLOSED"].includes(status)) return jsonError("LIVE_CHAT_STATUS_INVALID", 400);
    const search = (url.searchParams.get("search") ?? "").trim().slice(0, 100);
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, (character) => "\\" + character);
    const conversationFilter = {
      status: status === "CLOSED" ? "CLOSED" : status === "UNASSIGNED" ? "OPEN" : status === "OPEN" ? "OPEN" : { $in: ["OPEN", "CLOSED"] },
      ...(status === "UNASSIGNED" ? { assignedAgentId: null } : {}),
      ...(escapedSearch ? { $or: [
        { customerName: { $regex: escapedSearch, $options: "i" } },
        { customerEmail: { $regex: escapedSearch, $options: "i" } },
        { customerPhone: { $regex: escapedSearch, $options: "i" } },
        { geoCountry: { $regex: escapedSearch, $options: "i" } },
        { geoCity: { $regex: escapedSearch, $options: "i" } },
        { geoRegion: { $regex: escapedSearch, $options: "i" } },
        { lastMessagePreview: { $regex: escapedSearch, $options: "i" } }
      ] } : {}),
      ...(cursor && cursorDate ? { $or: [
        { lastMessageAt: { $lt: cursorDate } },
        { lastMessageAt: cursorDate, _id: { $lt: cursor.id } }
      ] } : {})
    };
    const now = new Date();
    const tenant = { companyId: new Types.ObjectId(scope.companyId), workspaceId: new Types.ObjectId(scope.workspaceId) };
    const rows = await LiveChatConversation.find({
      ...tenant,
      ...conversationFilter,
      expiresAt: { $gt: now }
    })
      .sort({ lastMessageAt: -1, _id: -1 })
      .limit(limit + 1)
      .select("_id customerName customerEmail customerPhone status messageCount lastMessageAt nextCustomerMessageAt expiresAt createdAt geoCountry geoCity geoRegion ipDisplay browser os deviceType referrer assignedAgentId unreadAgentCount lastMessagePreview")
      .lean();
    const hasMore = rows.length > limit;
    const conversations = hasMore ? rows.slice(0, limit) : rows;

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
      nextCursor: hasMore && conversations.length
        ? encodeListCursor(conversations[conversations.length - 1].lastMessageAt, conversations[conversations.length - 1]._id)
        : null,
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
