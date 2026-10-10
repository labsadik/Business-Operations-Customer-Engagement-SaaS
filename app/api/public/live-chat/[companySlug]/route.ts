import { jsonError, jsonOk } from "@/lib/http";
import { assertWidgetApiOrigin, getPublicLiveChatContext, liveChatError } from "@/lib/live-chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ companySlug: string }> }) {
  try {
    assertWidgetApiOrigin(request);
    const { companySlug } = await params;
    const url = new URL(request.url);
    const siteOrigin = url.searchParams.get("site") ?? "";
    const visitorId = url.searchParams.get("visitorId") ?? "";
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(visitorId)) return jsonError("LIVE_CHAT_VISITOR_INVALID", 400);
    const context = await getPublicLiveChatContext(companySlug, siteOrigin, visitorId);
    return jsonOk({
      company: { name: context.company.name, slug: context.company.slug },
      accessToken: context.accessToken,
      settings: {
        title: context.settings.title,
        welcomeMessage: context.settings.welcomeMessage,
        primaryColor: context.settings.primaryColor,
        theme: context.settings.theme,
        position: context.settings.position,
        collectName: context.settings.collectName,
        collectEmail: context.settings.collectEmail,
        collectPhone: context.settings.collectPhone
      },
      cooldownSeconds: context.entitlements.liveChatMessageCooldownSeconds,
      retentionDays: context.entitlements.liveChatRetentionDays
    });
  } catch (error) {
    const { code, status } = liveChatError(error, "PUBLIC_LIVE_CHAT_LOAD_FAILED");
    return jsonError(code, status);
  }
}
