import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { getMongo } from "@/lib/mongodb";
import { LiveChatConversation } from "@/models/live-chat-conversation";
import { LiveChatMessage } from "@/models/live-chat-message";
import { LiveChatMonthlyUsage } from "@/models/live-chat-monthly-usage";
import { LiveChatMonthlyCustomer } from "@/models/live-chat-monthly-customer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const RETENTION_BATCH_LIMIT = 250;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  try {
    await getMongo();
    const now = new Date();
    const expired = await LiveChatConversation.find({ expiresAt: { $lte: now } })
      .select("_id")
      .sort({ expiresAt: 1, _id: 1 })
      .limit(RETENTION_BATCH_LIMIT)
      .lean();
    const ids = expired.map((row) => new Types.ObjectId(String(row._id)));
    let messagesDeleted = 0;
    let conversationsDeleted = 0;
    if (ids.length) {
      const messages = await LiveChatMessage.deleteMany({ conversationId: { $in: ids } });
      messagesDeleted = messages.deletedCount ?? 0;
      const conversations = await LiveChatConversation.deleteMany({ _id: { $in: ids }, expiresAt: { $lte: now } });
      conversationsDeleted = conversations.deletedCount ?? 0;
    }
    const [expiredUsage, expiredCustomers] = await Promise.all([
      LiveChatMonthlyUsage.find({ expiresAt: { $lte: now } }).select("_id").sort({ expiresAt: 1 }).limit(RETENTION_BATCH_LIMIT).lean(),
      LiveChatMonthlyCustomer.find({ expiresAt: { $lte: now } }).select("_id").sort({ expiresAt: 1 }).limit(RETENTION_BATCH_LIMIT).lean()
    ]);
    const [usageDelete, customerDelete] = await Promise.all([
      LiveChatMonthlyUsage.deleteMany({ _id: { $in: expiredUsage.map((row) => row._id) }, expiresAt: { $lte: now } }),
      LiveChatMonthlyCustomer.deleteMany({ _id: { $in: expiredCustomers.map((row) => row._id) }, expiresAt: { $lte: now } })
    ]);
    const remaining = await Promise.all([
      LiveChatConversation.exists({ expiresAt: { $lte: now } }),
      LiveChatMonthlyUsage.exists({ expiresAt: { $lte: now } }),
      LiveChatMonthlyCustomer.exists({ expiresAt: { $lte: now } })
    ]);
    return NextResponse.json({
      ok: true,
      conversationsDeleted,
      messagesDeleted,
      usageRowsDeleted: usageDelete.deletedCount ?? 0,
      customerUsageRowsDeleted: customerDelete.deletedCount ?? 0,
      hasMoreWork: remaining.some(Boolean),
      timestamp: now.toISOString()
    });
  } catch (error) {
    console.error("[Canvas] Live Chat retention job failed", {
      code: error instanceof Error ? error.message : "UNKNOWN_ERROR"
    });
    return NextResponse.json({ ok: false, error: "LIVE_CHAT_RETENTION_FAILED" }, { status: 500 });
  }
}
