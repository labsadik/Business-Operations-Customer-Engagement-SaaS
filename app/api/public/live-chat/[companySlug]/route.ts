import { jsonError, jsonOk } from "@/lib/http";
import { assertWidgetApiOrigin, getPublicLiveChatContext, liveChatError } from "@/lib/live-chat";
import { assertCompanyPlanNotSuspended } from "@/lib/plans-server";

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
    await assertCompanyPlanNotSuspended(String(context.company._id));
    const response = jsonOk({
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
        collectPhone: context.settings.collectPhone,
        offlineMode: Boolean(context.settings.offlineMode),
        launcherSize: context.settings.launcherSize ?? 60,
        launcherIconSize: context.settings.launcherIconSize ?? 28,
        launcherShape: context.settings.launcherShape ?? "CIRCLE",
        panelRadius: context.settings.panelRadius ?? 18,
        headerStyle: context.settings.headerStyle ?? "SOLID",
        designTemplate: context.settings.designTemplate ?? "CLASSIC"
      },
      cooldownSeconds: context.entitlements.liveChatMessageCooldownSeconds,
      retentionDays: context.entitlements.liveChatRetentionDays
    });
    response.headers.set("Cache-Control", "private, no-cache, no-store, max-age=0, must-revalidate");
    return response;
  } catch (error) {
    const { code, status } = liveChatError(error, "PUBLIC_LIVE_CHAT_LOAD_FAILED");
    return jsonError(code, status);
  }
}
