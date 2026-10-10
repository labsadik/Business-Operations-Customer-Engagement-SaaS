import { Types } from "mongoose";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getMongo } from "@/lib/mongodb";
import { getCompanyEntitlements } from "@/lib/plans-server";
import { requireCompanyMember } from "@/lib/authz";
import { Company } from "@/models/company";
import { Workspace } from "@/models/workspace";
import { Membership } from "@/models/membership";
import { LiveChatSettings } from "@/models/live-chat-settings";
import { sha256 } from "@/lib/security";
import { isAllowedOrigin } from "@/features/live-chat/shared/validation";
import type { AuthSession } from "@/lib/session";

export type LiveChatScope = {
  session: AuthSession;
  company: any;
  workspace: any;
  companyId: string;
  workspaceId: string;
  entitlements: Awaited<ReturnType<typeof getCompanyEntitlements>>;
};

export async function requireLiveChatScope(): Promise<LiveChatScope> {
  const { session } = await requireCompanyMember();
  await getMongo();
  if (!session.companyId || !session.workspaceId ||
      !Types.ObjectId.isValid(session.companyId) || !Types.ObjectId.isValid(session.workspaceId)) {
    throw new Error("COMPANY_NOT_CONFIGURED");
  }
  const [company, workspace, entitlements] = await Promise.all([
    Company.findById(session.companyId).select("_id name slug websiteUrl").lean(),
    Workspace.findOne({ _id: session.workspaceId, companyId: session.companyId, active: true }).select("_id companyId name timezone").lean(),
    getCompanyEntitlements(session.companyId)
  ]);
  if (!company || !workspace) throw new Error("FORBIDDEN");
  if (!entitlements.liveChatEnabled) throw new Error("LIVE_CHAT_NOT_INCLUDED");

  if (session.role === "EMPLOYEE") {
    const eligibleEmployees = await Membership.find({
      companyId: session.companyId,
      workspaceId: session.workspaceId,
      active: true,
      role: "EMPLOYEE"
    }).sort({ createdAt: 1, _id: 1 }).limit(entitlements.liveChatAgentLimit + 1).select("userId").lean();
    if (!eligibleEmployees.some((row) => String(row.userId) === session.userId)) {
      throw new Error("LIVE_CHAT_AGENT_LIMIT_REACHED");
    }
  }
  return {
    session,
    company,
    workspace,
    companyId: String(company._id),
    workspaceId: String(workspace._id),
    entitlements
  };
}

export async function getOrCreateLiveChatSettings(companyId: string, workspaceId: string) {
  const now = new Date();
  return LiveChatSettings.findOneAndUpdate(
    { companyId: new Types.ObjectId(companyId), workspaceId: new Types.ObjectId(workspaceId) },
    { $setOnInsert: { companyId: new Types.ObjectId(companyId), workspaceId: new Types.ObjectId(workspaceId), createdAt: now } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  ).lean();
}

export function currentMonthStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function currentPeriodKey(now = new Date()) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function usageExpiry(now = new Date()) {
  // Retain count-only plan usage for three months beyond its calendar month.
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 4, 1));
}

export function monthlyCustomerHash(companyId: string, visitorId: string, periodKey: string) {
  // Rotate this pseudonymous key each month to avoid cross-period linkage.
  return sha256("conventus-live-chat-monthly-customer:v1:" + companyId + ":" + periodKey + ":" + visitorId);
}

export function monthlyCustomerKeyExpiry(now = new Date()) {
  // The deduplication key is needed for this month only, then it can be erased.
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 5));
}

export function addRetentionDays(from: Date, days: number) {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

export function visitorHash(companyId: string, visitorId: string) {
  return sha256("conventus-live-chat:v1:" + companyId + ":" + visitorId);
}

export function requestIpHash(request: Request, companyId: string) {
  const forwarded = request.headers.get("x-vercel-forwarded-for")
    ?? request.headers.get("x-real-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown";
  const userAgent = (request.headers.get("user-agent") ?? "unknown").slice(0, 300);
  return createHmac("sha256", publicWidgetSigningSecret()).update("conventus-live-chat-ip:v1:" + companyId + ":" + forwarded + ":" + userAgent).digest("hex");
}

function companyWebsiteDomain(websiteUrl?: string | null) {
  if (!websiteUrl) return [];
  try {
    return [new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(websiteUrl) ? websiteUrl : "https://" + websiteUrl).host.toLowerCase()];
  } catch {
    return [];
  }
}

export type PublicWidgetTokenClaims = {
  v: 1;
  companyId: string;
  workspaceId: string;
  slug: string;
  siteHost: string;
  exp: number;
  visitorKeyHash?: string;
};

function publicWidgetSigningSecret() {
  const secret = process.env.AUTH_SECRET || process.env.ENCRYPTION_KEY;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") throw new Error("LIVE_CHAT_SIGNING_SECRET_MISSING");
  return "conventus-live-chat-development-only-not-for-production";
}

export function createPublicWidgetToken(input: Omit<PublicWidgetTokenClaims, "v" | "exp">, now = Date.now()) {
  const claims: PublicWidgetTokenClaims = { ...input, v: 1, exp: Math.floor(now / 1000) + 600 };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", publicWidgetSigningSecret()).update(payload).digest("base64url");
  return payload + "." + signature;
}

export function verifyPublicWidgetToken(
  token: string | null,
  companySlug: string,
  siteOrigin: string,
  now = Date.now(),
  visitorId?: string
): PublicWidgetTokenClaims {
  if (!token || token.length > 2048) throw new Error("LIVE_CHAT_TOKEN_INVALID");
  const parts = token.split(".");
  if (parts.length !== 2) throw new Error("LIVE_CHAT_TOKEN_INVALID");
  const expected = createHmac("sha256", publicWidgetSigningSecret()).update(parts[0]).digest();
  let supplied: Buffer;
  try { supplied = Buffer.from(parts[1], "base64url"); } catch { throw new Error("LIVE_CHAT_TOKEN_INVALID"); }
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new Error("LIVE_CHAT_TOKEN_INVALID");
  let claims: PublicWidgetTokenClaims;
  try { claims = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as PublicWidgetTokenClaims; } catch { throw new Error("LIVE_CHAT_TOKEN_INVALID"); }
  if (claims.v !== 1 || !Types.ObjectId.isValid(claims.companyId) || !Types.ObjectId.isValid(claims.workspaceId) ||
      claims.slug !== companySlug.toLowerCase() || !Number.isSafeInteger(claims.exp)) {
    throw new Error("LIVE_CHAT_TOKEN_INVALID");
  }
  if (claims.exp <= Math.floor(now / 1000)) throw new Error("LIVE_CHAT_TOKEN_EXPIRED");
  let host = "";
  try { host = new URL(siteOrigin).host.toLowerCase(); } catch { throw new Error("LIVE_CHAT_TOKEN_INVALID"); }
  if (!host || claims.siteHost !== host) throw new Error("LIVE_CHAT_TOKEN_INVALID");
  if (visitorId !== undefined) {
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(visitorId) ||
        !claims.visitorKeyHash ||
        claims.visitorKeyHash !== visitorHash(claims.companyId, visitorId)) {
      throw new Error("LIVE_CHAT_TOKEN_INVALID");
    }
  } else if (claims.visitorKeyHash) {
    throw new Error("LIVE_CHAT_TOKEN_INVALID");
  }
  return claims;
}

export function assertWidgetApiOrigin(request: Request) {
  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (origin && origin !== requestOrigin) throw new Error("LIVE_CHAT_REQUEST_ORIGIN_INVALID");
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      if (new URL(referer).origin !== requestOrigin) throw new Error("LIVE_CHAT_REQUEST_ORIGIN_INVALID");
    } catch (error) {
      if (error instanceof Error && error.message === "LIVE_CHAT_REQUEST_ORIGIN_INVALID") throw error;
      throw new Error("LIVE_CHAT_REQUEST_ORIGIN_INVALID");
    }
  }
}

export async function getPublicLiveChatContext(companySlug: string, siteOrigin: string, visitorId?: string) {
  await getMongo();
  const company = await Company.findOne({ slug: companySlug.toLowerCase() }).select("_id name slug websiteUrl").lean();
  if (!company) throw new Error("COMPANY_NOT_FOUND");
  const workspace = await Workspace.findOne({ companyId: company._id, active: true }).select("_id companyId").sort({ createdAt: 1 }).lean();
  if (!workspace) throw new Error("COMPANY_NOT_CONFIGURED");
  const entitlements = await getCompanyEntitlements(String(company._id));
  if (!entitlements.liveChatEnabled) throw new Error("LIVE_CHAT_NOT_INCLUDED");
  const settings = await getOrCreateLiveChatSettings(String(company._id), String(workspace._id));
  if (!settings?.publicWidgetEnabled) throw new Error("LIVE_CHAT_WIDGET_DISABLED");
  const allowedDomains = (settings.allowedDomains?.length ? settings.allowedDomains : companyWebsiteDomain(company.websiteUrl));
  if (!siteOrigin || !isAllowedOrigin(siteOrigin, allowedDomains)) throw new Error("LIVE_CHAT_ORIGIN_NOT_ALLOWED");
  const siteHost = new URL(siteOrigin).host.toLowerCase();
  if (visitorId !== undefined && !/^[a-zA-Z0-9_-]{16,100}$/.test(visitorId)) throw new Error("LIVE_CHAT_VISITOR_INVALID");
  const accessToken = createPublicWidgetToken({
    companyId: String(company._id),
    workspaceId: String(workspace._id),
    slug: company.slug,
    siteHost,
    ...(visitorId ? { visitorKeyHash: visitorHash(String(company._id), visitorId) } : {})
  });
  return { company, workspace, settings, entitlements, allowedDomains, accessToken };
}

export function liveChatError(error: unknown, fallback: string) {
  const code = error instanceof Error ? error.message : fallback;
  const status =
    code === "UNAUTHENTICATED" ? 401 :
    code === "FORBIDDEN" || code === "CSRF_ORIGIN_INVALID" ? 403 :
    code === "COMPANY_NOT_FOUND" ? 404 :
    code === "LIVE_CHAT_WIDGET_DISABLED" || code === "LIVE_CHAT_NOT_INCLUDED" ? 403 :
    code === "LIVE_CHAT_ORIGIN_NOT_ALLOWED" || code === "LIVE_CHAT_DOMAIN_NOT_CONFIGURED" || code === "LIVE_CHAT_DOMAIN_NOT_ALLOWED" || code === "LIVE_CHAT_REQUEST_ORIGIN_INVALID" ? 403 :
    code === "LIVE_CHAT_CONVERSATION_NOT_FOUND" ? 404 :
    code === "LIVE_CHAT_TOKEN_INVALID" || code === "LIVE_CHAT_TOKEN_EXPIRED" ? 401 :
    code === "LIVE_CHAT_MESSAGE_RETRY" || code === "LIVE_CHAT_CONVERSATION_ALREADY_OPEN" ? 409 :
    code === "COMPANY_NOT_CONFIGURED" ? 403 :
    code === "LIVE_CHAT_MESSAGE_COOLDOWN" || code === "LIVE_CHAT_RATE_LIMITED" || code === "LIVE_CHAT_AGENT_LIMIT_REACHED" ? 429 :
    code === "LIVE_CHAT_MONTHLY_LIMIT_REACHED" || code === "LIVE_CHAT_CUSTOMER_LIMIT_REACHED" ? 429 :
    code === "LIVE_CHAT_DELETE_NOT_INCLUDED" || code === "LIVE_CHAT_EXPORT_NOT_INCLUDED" ? 403 :
    code.includes("_REQUIRED") || code.includes("_INVALID") || code.includes("_TOO_MANY") ? 400 :
    code === "LIVE_CHAT_BODY_TOO_LARGE" ? 413 :
    code === "RESOURCE_BUSY" ? 429 : 500;
  return { code, status };
}

export async function readLiveChatJson(request: Request, maxBytes = 8192) {
  const announcedLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(announcedLength) && announcedLength > maxBytes) {
    throw new Error("LIVE_CHAT_BODY_TOO_LARGE");
  }
  if (!request.body) throw new Error("LIVE_CHAT_JSON_INVALID");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        throw new Error("LIVE_CHAT_BODY_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    const joined = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const parsed: unknown = JSON.parse(new TextDecoder().decode(joined));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("LIVE_CHAT_JSON_INVALID");
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("LIVE_CHAT_")) throw error;
    throw new Error("LIVE_CHAT_JSON_INVALID");
  }
}
