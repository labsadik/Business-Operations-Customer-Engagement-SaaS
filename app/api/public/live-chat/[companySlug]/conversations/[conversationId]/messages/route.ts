import { Types } from "mongoose";
import { getMongo } from "@/lib/mongodb";
import { jsonError, jsonOk } from "@/lib/http";
import { addRetentionDays, assertWidgetApiOrigin, liveChatError, visitorHash, verifyPublicWidgetToken, readLiveChatJson } from "@/lib/live-chat";
import { LiveChatConversation } from "@/models/live-chat-conversation";
import { LiveChatMessage } from "@/models/live-chat-message";
import { User } from "@/models/user";
import { validateChatMessage } from "@/features/live-chat/shared/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function publicConversation(request: Request, companySlug: string, conversationId: string) {
  assertWidgetApiOrigin(request);
  if (!Types.ObjectId.isValid(conversationId)) throw new Error("LIVE_CHAT_CONVERSATION_NOT_FOUND");
  const url = new URL(request.url);
  const visitorId = url.searchParams.get("visitorId") ?? "";
  const siteOrigin = url.searchParams.get("site") ?? "";
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(visitorId)) throw new Error("LIVE_CHAT_VISITOR_INVALID");
  const claims = verifyPublicWidgetToken(request.headers.get("x-conventus-live-chat-token"), companySlug, siteOrigin, Date.now(), visitorId);
  await getMongo();
  const companyId = new Types.ObjectId(claims.companyId);
  const workspaceId = new Types.ObjectId(claims.workspaceId);
  const conversation = await LiveChatConversation.findOne({
    _id: new Types.ObjectId(conversationId),
    companyId,
    workspaceId,
    visitorKeyHash: visitorHash(String(companyId), visitorId),
    status: "OPEN",
    expiresAt: { $gt: new Date() }
  }).lean();
  if (!conversation) throw new Error("LIVE_CHAT_CONVERSATION_NOT_FOUND");
  return { claims, companyId, workspaceId, conversation };
}

export async function GET(request: Request, { params }: { params: Promise<{ companySlug: string; conversationId: string }> }) {
  try {
    const { companySlug, conversationId } = await params;
    const scope = await publicConversation(request, companySlug, conversationId);
    const rows = await LiveChatMessage.find({
      companyId: scope.companyId,
      workspaceId: scope.workspaceId,
      conversationId: scope.conversation._id,
      expiresAt: { $gt: new Date() }
    }).sort({ createdAt: -1, _id: -1 }).limit(100).lean();
    const agentIds = [...new Set(rows.filter((row) => row.senderType === "AGENT" && row.senderUserId).map((row) => String(row.senderUserId)))];
    const agents = agentIds.length ? await User.find({ _id: { $in: agentIds }, active: true })
      .select("_id name image").lean() : [];
    const agentById = new Map(agents.map((agent) => [String(agent._id), { name: agent.name || "Support agent", image: agent.image || "" }]));
    return jsonOk({
      conversation: {
        id: String(scope.conversation._id),
        nextCustomerMessageAt: scope.conversation.nextCustomerMessageAt,
        expiresAt: scope.conversation.expiresAt,
        status: scope.conversation.status
      },
      messages: rows.reverse().map((row) => ({
        id: String(row._id),
        senderType: row.senderType,
        body: row.body,
        createdAt: row.createdAt,
        senderName: row.senderType === "AGENT" && row.senderUserId ? agentById.get(String(row.senderUserId))?.name ?? "Support agent" : "",
        senderAvatar: row.senderType === "AGENT" && row.senderUserId ? agentById.get(String(row.senderUserId))?.image ?? "" : ""
      }))
    });
  } catch (error) {
    const { code, status } = liveChatError(error, "PUBLIC_LIVE_CHAT_MESSAGES_FAILED");
    return jsonError(code, status);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ companySlug: string; conversationId: string }> }) {
  try {
    const { companySlug, conversationId } = await params;
    const body = await readLiveChatJson(request);
    const message = validateChatMessage(body.body);
    const scope = await publicConversation(request, companySlug, conversationId);
    const now = new Date();
    const { getCompanyEntitlements } = await import("@/lib/plans-server");
    const entitlements = await getCompanyEntitlements(scope.claims.companyId);
    if (!entitlements.liveChatEnabled) return jsonError("LIVE_CHAT_NOT_INCLUDED", 403);
    const nextAt = new Date(now.getTime() + Math.max(2, entitlements.liveChatMessageCooldownSeconds) * 1000);
    const retentionExpiresAt = addRetentionDays(now, entitlements.liveChatRetentionDays);
    const query = {
      _id: new Types.ObjectId(conversationId),
      companyId: scope.companyId,
      workspaceId: scope.workspaceId,
      visitorKeyHash: visitorHash(String(scope.companyId), String(new URL(request.url).searchParams.get("visitorId") ?? "")),
      status: "OPEN",
      expiresAt: { $gt: now },
      $or: [
        { nextCustomerMessageAt: null },
        { nextCustomerMessageAt: { $exists: false } },
        { nextCustomerMessageAt: { $lte: now } }
      ]
    };
    const updated = await LiveChatConversation.findOneAndUpdate(query, {
      $set: { nextCustomerMessageAt: nextAt, lastMessageAt: now, lastMessagePreview: message.slice(0, 240), expiresAt: retentionExpiresAt },
      $inc: { messageCount: 1, unreadAgentCount: 1 }
    }, { returnDocument: "after" }).select("_id").lean();

    if (!updated) {
      const current = await LiveChatConversation.findOne({
        _id: new Types.ObjectId(conversationId),
        companyId: scope.companyId,
        workspaceId: scope.workspaceId,
        visitorKeyHash: visitorHash(String(scope.companyId), String(new URL(request.url).searchParams.get("visitorId") ?? "")),
        status: "OPEN",
        expiresAt: { $gt: new Date() }
      }).select("nextCustomerMessageAt").lean();
      if (!current) return jsonError("LIVE_CHAT_CONVERSATION_NOT_FOUND", 404);
      if (current.nextCustomerMessageAt && current.nextCustomerMessageAt.getTime() > Date.now()) {
        return jsonError("LIVE_CHAT_MESSAGE_COOLDOWN", 429, { retryAt: current.nextCustomerMessageAt });
      }
      return jsonError("LIVE_CHAT_MESSAGE_RETRY", 409);
    }

    const created = await LiveChatMessage.create({
      companyId: scope.companyId,
      workspaceId: scope.workspaceId,
      conversationId: updated._id,
      senderType: "CUSTOMER",
      senderUserId: null,
      body: message,
      expiresAt: retentionExpiresAt
    });
    return jsonOk({
      message: { id: String(created._id), senderType: created.senderType, body: created.body, createdAt: created.createdAt },
      nextCustomerMessageAt: nextAt
    }, 201);
  } catch (error) {
    const { code, status } = liveChatError(error, "PUBLIC_LIVE_CHAT_MESSAGE_FAILED");
    return jsonError(code, status);
  }
}
