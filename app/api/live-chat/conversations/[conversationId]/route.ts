import { Types } from "mongoose";
import { assertSameOrigin } from "@/lib/security";
import { getMongo } from "@/lib/mongodb";
import { jsonError, jsonOk } from "@/lib/http";
import { LiveChatConversation } from "@/models/live-chat-conversation";
import { LiveChatMessage } from "@/models/live-chat-message";
import { liveChatError, requireLiveChatScope } from "@/lib/live-chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  try {
    assertSameOrigin(request);
    const scope = await requireLiveChatScope();
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || body.action !== "close") return jsonError("LIVE_CHAT_ACTION_INVALID", 400);
    const { conversationId } = await params;
    if (!Types.ObjectId.isValid(conversationId)) return jsonError("LIVE_CHAT_CONVERSATION_NOT_FOUND", 404);
    await getMongo();
    const updated = await LiveChatConversation.findOneAndUpdate(
      {
        _id: new Types.ObjectId(conversationId),
        companyId: new Types.ObjectId(scope.companyId),
        workspaceId: new Types.ObjectId(scope.workspaceId),
        status: "OPEN",
        expiresAt: { $gt: new Date() }
      },
      { $set: { status: "CLOSED" } },
      { returnDocument: "after" }
    ).select("_id status").lean();
    if (!updated) return jsonError("LIVE_CHAT_CONVERSATION_NOT_FOUND", 404);
    return jsonOk({ id: String(updated._id), status: updated.status });
  } catch (error) {
    const { code, status } = liveChatError(error, "LIVE_CHAT_CLOSE_FAILED");
    return jsonError(code, status);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  try {
    assertSameOrigin(request);
    const scope = await requireLiveChatScope();
    if (!scope.entitlements.liveChatDeleteEnabled) return jsonError("LIVE_CHAT_DELETE_NOT_INCLUDED", 403);
    const { conversationId } = await params;
    if (!Types.ObjectId.isValid(conversationId)) return jsonError("LIVE_CHAT_CONVERSATION_NOT_FOUND", 404);
    await getMongo();
    const tenant = { companyId: new Types.ObjectId(scope.companyId), workspaceId: new Types.ObjectId(scope.workspaceId), _id: new Types.ObjectId(conversationId) };
    const conversation = await LiveChatConversation.findOne(tenant).select("_id").lean();
    if (!conversation) return jsonError("LIVE_CHAT_CONVERSATION_NOT_FOUND", 404);
    await LiveChatMessage.deleteMany({
      companyId: tenant.companyId,
      workspaceId: tenant.workspaceId,
      conversationId: tenant._id
    });
    await LiveChatConversation.deleteOne(tenant);
    return jsonOk({ deleted: true });
  } catch (error) {
    const { code, status } = liveChatError(error, "LIVE_CHAT_DELETE_FAILED");
    return jsonError(code, status);
  }
}
