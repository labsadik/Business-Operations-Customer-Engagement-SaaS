import { Types } from "mongoose";
import { assertSameOrigin } from "@/lib/security";
import { getMongo } from "@/lib/mongodb";
import { getSession } from "@/lib/session";
import { Membership } from "@/models/membership";
import { PushSubscription } from "@/models/push-subscription";
import { jsonError, jsonOk } from "@/lib/http";
import { getWebPushPublicKey, isAllowedPushEndpoint, isWebPushConfigured } from "@/lib/web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorizedUser() {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHENTICATED");
  if (!["COMPANY_OWNER", "COMPANY_ADMIN", "EMPLOYEE", "PLATFORM_ADMIN"].includes(session.role)) {
    throw new Error("FORBIDDEN");
  }
  if (!Types.ObjectId.isValid(session.userId)) throw new Error("UNAUTHENTICATED");
  if (session.role !== "PLATFORM_ADMIN") {
    if (!session.companyId) throw new Error("COMPANY_NOT_CONFIGURED");
    const membership = await Membership.findOne({
      companyId: new Types.ObjectId(session.companyId),
      userId: new Types.ObjectId(session.userId),
      active: true
    }).select("_id").lean();
    if (!membership) throw new Error("FORBIDDEN");
  }
  return session;
}

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "PUSH_SUBSCRIPTION_FAILED";
  return jsonError(code, code === "UNAUTHENTICATED" ? 401 : code === "FORBIDDEN" || code === "CSRF_ORIGIN_INVALID" ? 403 : 400);
}

function validSubscriptionKey(value: string, kind: "p256dh" | "auth") {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return false;
  const bytes = Buffer.from(value, "base64url");
  return kind === "p256dh"
    ? bytes.length === 65 && bytes[0] === 4
    : bytes.length === 16;
}

export async function GET() {
  try {
    const session = await authorizedUser();
    await getMongo();
    const count = await PushSubscription.countDocuments({ userId: new Types.ObjectId(session.userId) });
    return jsonOk({
      enabled: isWebPushConfigured(),
      publicKey: getWebPushPublicKey(),
      subscriptionCount: count
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await authorizedUser();
    await getMongo();
    if (!isWebPushConfigured()) return jsonError("WEB_PUSH_NOT_CONFIGURED", 503);

    const body = await request.json().catch(() => null) as {
      endpoint?: unknown;
      expirationTime?: unknown;
      keys?: { p256dh?: unknown; auth?: unknown };
    } | null;
    if (
      !body ||
      typeof body.endpoint !== "string" ||
      body.endpoint.length > 4096 ||
      !isAllowedPushEndpoint(body.endpoint) ||
      !body.keys ||
      typeof body.keys.p256dh !== "string" ||
      typeof body.keys.auth !== "string" ||
      body.keys.p256dh.length > 256 ||
      body.keys.auth.length > 128 ||
      !validSubscriptionKey(body.keys.p256dh, "p256dh") ||
      !validSubscriptionKey(body.keys.auth, "auth")
    ) {
      return jsonError("PUSH_SUBSCRIPTION_INVALID", 400);
    }

    const expirationTime = typeof body.expirationTime === "number" && Number.isFinite(body.expirationTime) && body.expirationTime >= 0
      ? body.expirationTime
      : null;
    await PushSubscription.updateOne(
      {
        userId: new Types.ObjectId(session.userId),
        endpoint: body.endpoint
      },
      {
        $set: {
          p256dh: body.keys.p256dh,
          auth: body.keys.auth,
          expirationTime
        },
        $setOnInsert: {
          userId: new Types.ObjectId(session.userId),
          endpoint: body.endpoint
        }
      },
      { upsert: true, runValidators: true }
    );
    return jsonOk({ subscribed: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await authorizedUser();
    await getMongo();
    const body = await request.json().catch(() => null) as { endpoint?: unknown } | null;
    if (typeof body?.endpoint !== "string" || !isAllowedPushEndpoint(body.endpoint)) {
      return jsonError("PUSH_SUBSCRIPTION_INVALID", 400);
    }
    await PushSubscription.deleteOne({
      userId: new Types.ObjectId(session.userId),
      endpoint: body.endpoint
    });
    return jsonOk({ unsubscribed: true });
  } catch (error) {
    return errorResponse(error);
  }
}
