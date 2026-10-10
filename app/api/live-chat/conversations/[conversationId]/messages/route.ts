import { Types } from "mongoose";
import { assertSameOrigin } from "@/lib/security";
import { getMongo } from "@/lib/mongodb";
import { jsonError, jsonOk } from "@/lib/http";
import { LiveChatConversation } from "@/models/live-chat-conversation";
import { LiveChatMessage } from "@/models/live-chat-message";
import { User } from "@/models/user";
import { addRetentionDays, liveChatError, requireLiveChatScope } from "@/lib/live-chat";
import { validateChatMessage } from "@/features/live-chat/shared/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  try {
    const scope = await requireLiveChatScope();
    const { conversationId } = await params;
    if (!Types.ObjectId.isValid(conversationId)) return jsonError("LIVE_CHAT_CONVERSATION_NOT_FOUND", 404);
    await getMongo();
    const tenant = { companyId: new Types.ObjectId(scope.companyId), workspaceId: new Types.ObjectId(scope.workspaceId) };
    const conversation = await LiveChatConversation.findOne({
      ...tenant, _id: new Types.ObjectId(conversationId), expiresAt: { $gt: new Date() }
    }).select("_id customerName customerEmail customerPhone status createdAt lastMessageAt nextCustomerMessageAt expiresAt geoCountry geoCity geoRegion ipDisplay browser os deviceType referrer assignedAgentId unreadAgentCount lastMessagePreview").lean();
    if (!conversation) return jsonError("LIVE_CHAT_CONVERSATION_NOT_FOUND", 404);
    await LiveChatConversation.updateOne({ ...tenant, _id: conversation._id }, { $set: { unreadAgentCount: 0 } });
    const rows = await LiveChatMessage.find({
      ...tenant, conversationId: conversation._id, expiresAt: { $gt: new Date() }
    }).sort({ createdAt: -1, _id: -1 }).limit(100).lean();
    const agentIds = [...new Set(rows.filter((row) => row.senderType === "AGENT" && row.senderUserId).map((row) => String(row.senderUserId)))];
    const agents = agentIds.length ? await User.find({ _id: { $in: agentIds }, active: true }).select("_id name image").lean() : [];
    const agentById = new Map(agents.map((agent) => [String(agent._id), { name: agent.name || "Support agent", image: agent.image || "" }]));
    return jsonOk({
      conversation: {
        id: String(conversation._id),
        customerName: conversation.customerName || "Anonymous customer",
        customerEmail: conversation.customerEmail || "",
        customerPhone: conversation.customerPhone || "",
        status: conversation.status,
        createdAt: conversation.createdAt,
        lastMessageAt: conversation.lastMessageAt,
        nextCustomerMessageAt: conversation.nextCustomerMessageAt,
        expiresAt: conversation.expiresAt,
        geoCountry: conversation.geoCountry || "",
        geoCity: conversation.geoCity || "",
        geoRegion: conversation.geoRegion || "",
        ipDisplay: conversation.ipDisplay || "",
        browser: conversation.browser || "",
        os: conversation.os || "",
        deviceType: conversation.deviceType || "DESKTOP",
        referrer: conversation.referrer || "",
        unreadAgentCount: 0,
        assignedAgentId: conversation.assignedAgentId ? String(conversation.assignedAgentId) : null,
        lastMessagePreview: conversation.lastMessagePreview || ""
      },
      messages: rows.reverse().map((row) => ({
        id: String(row._id),
        senderType: row.senderType,
        senderUserId: row.senderUserId ? String(row.senderUserId) : null,
        senderName: row.senderType === "AGENT" && row.senderUserId ? agentById.get(String(row.senderUserId))?.name ?? "Support agent" : "",
        senderAvatar: row.senderType === "AGENT" && row.senderUserId ? agentById.get(String(row.senderUserId))?.image ?? "" : "",
        body: row.body,
        createdAt: row.createdAt
      }))
    });
  } catch (error) {
    const { code, status } = liveChatError(error, "LIVE_CHAT_MESSAGES_LOAD_FAILED");
    return jsonError(code, status);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  try {
    assertSameOrigin(request);
    const scope = await requireLiveChatScope();
    const { conversationId } = await params;
    if (!Types.ObjectId.isValid(conversationId)) return jsonError("LIVE_CHAT_CONVERSATION_NOT_FOUND", 404);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return jsonError("LIVE_CHAT_MESSAGE_INVALID", 400);
    const message = validateChatMessage(body.body);
    await getMongo();
    const now = new Date();
    const expiresAt = addRetentionDays(now, scope.entitlements.liveChatRetentionDays);
    const tenant = { companyId: new Types.ObjectId(scope.companyId), workspaceId: new Types.ObjectId(scope.workspaceId) };
    const conversation = await LiveChatConversation.findOneAndUpdate(
      { ...tenant, _id: new Types.ObjectId(conversationId), status: "OPEN", expiresAt: { $gt: now } },
      { $set: { lastMessageAt: now, lastMessagePreview: message.slice(0, 240), unreadAgentCount: 0, expiresAt }, $inc: { messageCount: 1 } },
      { returnDocument: "after" }
    ).select("_id assignedAgentId").lean();
    if (!conversation) return jsonError("LIVE_CHAT_CONVERSATION_NOT_FOUND", 404);
    if (!conversation.assignedAgentId) {
      await LiveChatConversation.updateOne(
        { ...tenant, _id: conversation._id, assignedAgentId: null },
        { $set: { assignedAgentId: new Types.ObjectId(scope.session.userId) } }
      );
    }
    const created = await LiveChatMessage.create({
      ...tenant,
      conversationId: conversation._id,
      senderType: "AGENT",
      senderUserId: new Types.ObjectId(scope.session.userId),
      body: message,
      expiresAt
    });
    return jsonOk({ message: { id: String(created._id), senderType: created.senderType, body: created.body, createdAt: created.createdAt } }, 201);
  } catch (error) {
    const { code, status } = liveChatError(error, "LIVE_CHAT_MESSAGE_SEND_FAILED");
    return jsonError(code, status);
  }
}
