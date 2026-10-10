import { Types } from "mongoose";
import { getMongo } from "@/lib/mongodb";
import { jsonError, jsonOk } from "@/lib/http";
import { withRedisLock } from "@/lib/redis-lock";
import {
  addRetentionDays, currentPeriodKey, getPublicLiveChatContext, liveChatError,
  monthlyCustomerHash, monthlyCustomerKeyExpiry, requestIpHash, usageExpiry, visitorHash, readLiveChatJson, verifyPublicWidgetToken
} from "@/lib/live-chat";
import { LiveChatConversation } from "@/models/live-chat-conversation";
import { LiveChatMonthlyCustomer } from "@/models/live-chat-monthly-customer";
import { LiveChatMonthlyUsage } from "@/models/live-chat-monthly-usage";
import { validateContact } from "@/features/live-chat/shared/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isDuplicateKey(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === 11000);
}

export async function POST(request: Request, { params }: { params: Promise<{ companySlug: string }> }) {
  try {
    const { companySlug } = await params;
    const body = await readLiveChatJson(request);
    const visitorId = typeof body.visitorId === "string" ? body.visitorId : "";
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(visitorId)) return jsonError("LIVE_CHAT_VISITOR_INVALID", 400);
    const siteOrigin = typeof body.siteOrigin === "string" ? body.siteOrigin : "";
    const claims = verifyPublicWidgetToken(request.headers.get("x-conventus-live-chat-token"), companySlug, siteOrigin);
    const context = await getPublicLiveChatContext(companySlug, siteOrigin);
    if (claims.companyId !== String(context.company._id) || claims.workspaceId !== String(context.workspace._id)) return jsonError("LIVE_CHAT_TOKEN_INVALID", 401);
    const contact = validateContact(body.contact, context.settings);
    await getMongo();

    const companyId = new Types.ObjectId(String(context.company._id));
    const workspaceId = new Types.ObjectId(String(context.workspace._id));
    const visitorKeyHash = visitorHash(String(companyId), visitorId);
    const ipHash = requestIpHash(request, String(companyId));
    const tenant = { companyId, workspaceId };
    const findExisting = () => LiveChatConversation.findOne({
      ...tenant, visitorKeyHash, status: "OPEN", expiresAt: { $gt: new Date() }
    }).select("_id nextCustomerMessageAt expiresAt createdAt").lean();

    const existing = await findExisting();
    if (existing) {
      return jsonOk({
        conversation: { id: String(existing._id), nextCustomerMessageAt: existing.nextCustomerMessageAt, expiresAt: existing.expiresAt },
        existing: true
      });
    }

    const result = await withRedisLock("live-chat:create:" + String(companyId), 15000, async () => {
      const latestExisting = await findExisting();
      if (latestExisting) return { row: latestExisting, existing: true };

      const now = new Date();
      const periodKey = currentPeriodKey(now);
      const usageKey = { companyId, periodKey };
      const monthlyVisitorHash = monthlyCustomerHash(String(companyId), visitorId, periodKey);
      try {
        await LiveChatMonthlyUsage.updateOne(
          usageKey,
          { $setOnInsert: { ...usageKey, chatCount: 0, customerCount: 0, expiresAt: usageExpiry(now) } },
          { upsert: true }
        );
      } catch (error) {
        // Two first-time requests may race on the unique tenant/month index.
        if (!isDuplicateKey(error)) throw error;
      }

      const chatReservation = await LiveChatMonthlyUsage.findOneAndUpdate(
        { ...usageKey, $expr: { $lt: ["$chatCount", context.entitlements.liveChatMonthlyLimit] } },
        { $inc: { chatCount: 1 } },
        { returnDocument: "after" }
      ).select("chatCount").lean();
      if (!chatReservation) throw new Error("LIVE_CHAT_MONTHLY_LIMIT_REACHED");

      let createdCustomerRecord = false;
      let reservedCustomerCount = false;
      try {
        try {
          await LiveChatMonthlyCustomer.create({
            ...usageKey,
            visitorKeyHash: monthlyVisitorHash,
            expiresAt: monthlyCustomerKeyExpiry(now)
          });
          createdCustomerRecord = true;
        } catch (error) {
          // This visitor has already counted toward the customer quota this month.
          if (!isDuplicateKey(error)) throw error;
        }

        if (createdCustomerRecord) {
          const customerReservation = await LiveChatMonthlyUsage.findOneAndUpdate(
            { ...usageKey, $expr: { $lt: ["$customerCount", context.entitlements.liveChatCustomerLimit] } },
            { $inc: { customerCount: 1 } },
            { returnDocument: "after" }
          ).select("customerCount").lean();
          if (!customerReservation) {
            await LiveChatMonthlyCustomer.deleteOne({ ...usageKey, visitorKeyHash: monthlyVisitorHash });
            createdCustomerRecord = false;
            throw new Error("LIVE_CHAT_CUSTOMER_LIMIT_REACHED");
          }
          reservedCustomerCount = true;
        }

        // Close expired open rows first so the unique partial index permits a fresh chat.
        await LiveChatConversation.updateMany(
          { ...tenant, visitorKeyHash, status: "OPEN", expiresAt: { $lte: now } },
          { $set: { status: "CLOSED" } }
        );

        const created = await LiveChatConversation.create({
          ...tenant,
          visitorKeyHash,
          ipHash,
          originHost: (() => { try { return new URL(siteOrigin).host.slice(0, 255); } catch { return ""; } })(),
          customerName: contact.name,
          customerEmail: contact.email,
          customerPhone: contact.phone,
          status: "OPEN",
          messageCount: 0,
          lastMessageAt: now,
          nextCustomerMessageAt: null,
          expiresAt: addRetentionDays(now, context.entitlements.liveChatRetentionDays)
        });
        return { row: created.toObject(), existing: false };
      } catch (error) {
        if (reservedCustomerCount) {
          await LiveChatMonthlyUsage.updateOne(usageKey, { $inc: { customerCount: -1 } });
        }
        if (createdCustomerRecord) {
          await LiveChatMonthlyCustomer.deleteOne({ ...usageKey, visitorKeyHash });
        }
        await LiveChatMonthlyUsage.updateOne(usageKey, { $inc: { chatCount: -1 } });

        if (isDuplicateKey(error)) {
          const collided = await findExisting();
          if (collided) return { row: collided, existing: true };
        }
        throw error;
      }
    });

    return jsonOk({
      conversation: {
        id: String(result.row._id),
        nextCustomerMessageAt: result.row.nextCustomerMessageAt ?? null,
        expiresAt: result.row.expiresAt
      },
      existing: result.existing
    }, result.existing ? 200 : 201);
  } catch (error) {
    const { code, status } = liveChatError(error, "PUBLIC_LIVE_CHAT_CREATE_FAILED");
    return jsonError(code, status);
  }
}
