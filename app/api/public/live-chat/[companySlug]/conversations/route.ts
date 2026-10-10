import { Types } from "mongoose";
import { getMongo } from "@/lib/mongodb";
import { jsonError, jsonOk } from "@/lib/http";
import { withRedisLock } from "@/lib/redis-lock";
import {
  addRetentionDays, assertWidgetApiOrigin, currentPeriodKey, getPublicLiveChatContext, liveChatError,
  monthlyCustomerHash, monthlyCustomerKeyExpiry, requestIpHash, usageExpiry, visitorHash, readLiveChatJson, verifyPublicWidgetToken
} from "@/lib/live-chat";
import { LiveChatConversation } from "@/models/live-chat-conversation";
import { LiveChatMonthlyCustomer } from "@/models/live-chat-monthly-customer";
import { LiveChatMonthlyUsage } from "@/models/live-chat-monthly-usage";
import { validateContact } from "@/features/live-chat/shared/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


function cleanHeader(value: string | null, maxLength: number) {
  if (!value) return "";
  let decoded = value;
  try { decoded = decodeURIComponent(value); } catch { /* header may not be URL encoded */ }
  return decoded.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, maxLength);
}

function parseUserAgent(userAgent: string) {
  const ua = userAgent.slice(0, 1000);
  const edge = ua.match(/Edg\/([\d.]+)/i);
  const opera = ua.match(/OPR\/([\d.]+)/i);
  const chrome = ua.match(/(?:Chrome|CriOS)\/([\d.]+)/i);
  const firefox = ua.match(/Firefox\/([\d.]+)/i);
  const safari = ua.match(/Version\/([\d.]+).*Safari/i);
  const browser = edge ? "Microsoft Edge " + edge[1] :
    opera ? "Opera " + opera[1] :
    chrome ? "Chrome " + chrome[1] :
    firefox ? "Firefox " + firefox[1] :
    safari ? "Safari " + safari[1] :
    /Safari/i.test(ua) ? "Safari" : "Unknown";
  const os =
    /Windows NT 10/i.test(ua) ? "Windows 10/11" :
    /Windows NT/i.test(ua) ? "Windows" :
    /Android/i.test(ua) ? "Android" :
    /iPhone|iPad|iPod/i.test(ua) ? "iOS" :
    /Mac OS X|Macintosh/i.test(ua) ? "macOS" :
    /Linux/i.test(ua) ? "Linux" : "Unknown";
  const deviceType = /iPad|Tablet/i.test(ua) ? "TABLET" : /Mobi|Android|iPhone|iPod/i.test(ua) ? "MOBILE" : "DESKTOP";
  return { browser: browser.slice(0, 100), os, deviceType };
}

function visitorTelemetry(request: Request, body: Record<string, unknown>, siteOrigin: string, visitorId: string) {
  const countryCode = cleanHeader(request.headers.get("cf-ipcountry"), 2).toUpperCase();
  const geoCountry = /^[A-Z]{2}$/.test(countryCode) && countryCode !== "XX" ? countryCode : "";
  const geoCity = cleanHeader(request.headers.get("cf-ipcity"), 120);
  const geoRegion = cleanHeader(request.headers.get("cf-region"), 120);
  const forwardedIp = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const ipDisplay = cleanHeader(forwardedIp, 64);
  const { browser, os, deviceType } = parseUserAgent(request.headers.get("user-agent") ?? "");
  let referrer = typeof body.referrer === "string" ? body.referrer : "";
  if (!referrer) referrer = request.headers.get("referer") ?? "";
  try {
    const target = new URL(referrer);
    const site = new URL(siteOrigin);
    if (!["http:", "https:"].includes(target.protocol) || target.origin !== site.origin) referrer = "";
    else {
      target.username = "";
      target.password = "";
      target.search = "";
      target.hash = "";
      referrer = target.toString().slice(0, 1024);
    }
  } catch {
    referrer = "";
  }
  const flag = /^[A-Z]{2}$/.test(geoCountry)
    ? String.fromCodePoint(...geoCountry.split("").map((char) => char.charCodeAt(0) + 127397))
    : "🌐";
  const location = [geoCity, geoCountry].filter(Boolean).join(", ");
  const visitorLabel = ("Visitor #" + visitorId.slice(0, 5).toUpperCase() + " · " + flag + (location ? " " + location : "")).slice(0, 120);
  return { geoCountry, geoCity, geoRegion, ipDisplay, browser, os, deviceType, referrer, visitorLabel };
}

function isDuplicateKey(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === 11000);
}

export async function POST(request: Request, { params }: { params: Promise<{ companySlug: string }> }) {
  try {
    assertWidgetApiOrigin(request);
    const { companySlug } = await params;
    const body = await readLiveChatJson(request);
    const visitorId = typeof body.visitorId === "string" ? body.visitorId : "";
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(visitorId)) return jsonError("LIVE_CHAT_VISITOR_INVALID", 400);
    const siteOrigin = typeof body.siteOrigin === "string" ? body.siteOrigin : "";
    const claims = verifyPublicWidgetToken(request.headers.get("x-conventus-live-chat-token"), companySlug, siteOrigin, Date.now(), visitorId);
    const context = await getPublicLiveChatContext(companySlug, siteOrigin, visitorId);
    if (claims.companyId !== String(context.company._id) || claims.workspaceId !== String(context.workspace._id)) return jsonError("LIVE_CHAT_TOKEN_INVALID", 401);
    const contact = validateContact(body.contact, context.settings);
    const telemetry = visitorTelemetry(request, body, siteOrigin, visitorId);
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
          customerName: contact.name || telemetry.visitorLabel,
          customerEmail: contact.email,
          customerPhone: contact.phone,
          geoCountry: telemetry.geoCountry,
          geoCity: telemetry.geoCity,
          geoRegion: telemetry.geoRegion,
          ipDisplay: telemetry.ipDisplay,
          browser: telemetry.browser,
          os: telemetry.os,
          deviceType: telemetry.deviceType,
          referrer: telemetry.referrer,
          assignedAgentId: null,
          unreadAgentCount: 0,
          lastMessagePreview: "",
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
