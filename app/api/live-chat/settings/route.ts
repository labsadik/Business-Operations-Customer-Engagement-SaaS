import { assertSameOrigin } from "@/lib/security";
import { jsonError, jsonOk } from "@/lib/http";
import { getOrCreateLiveChatSettings, liveChatError, readLiveChatJson, requireLiveChatScope } from "@/lib/live-chat";
import { validateLiveChatSettingsDraft } from "@/features/live-chat/shared/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const scope = await requireLiveChatScope();
    const settings = await getOrCreateLiveChatSettings(scope.companyId, scope.workspaceId);
    const origin = new URL(request.url).origin;
    const position = String(settings?.position ?? "RIGHT").toLowerCase();
    const embedCode = `<script src="${origin}/live-chat.js" data-company="${scope.company.slug}" data-position="${position}" async></script>`;
    return jsonOk({
      settings: {
        publicWidgetEnabled: Boolean(settings?.publicWidgetEnabled),
        title: settings?.title ?? "Chat with us",
        welcomeMessage: settings?.welcomeMessage ?? "Hello! How can we help?",
        primaryColor: settings?.primaryColor ?? "#2563eb",
        theme: settings?.theme ?? "LIGHT",
        position: settings?.position ?? "RIGHT",
        collectName: Boolean(settings?.collectName),
        collectEmail: Boolean(settings?.collectEmail),
        collectPhone: Boolean(settings?.collectPhone),
        offlineMode: Boolean(settings?.offlineMode),
        allowedDomains: settings?.allowedDomains ?? [],
        launcherSize: settings?.launcherSize ?? 60,
        launcherIconSize: settings?.launcherIconSize ?? 28,
        launcherShape: settings?.launcherShape ?? "CIRCLE",
        panelRadius: settings?.panelRadius ?? 18,
        headerStyle: settings?.headerStyle ?? "SOLID",
        designTemplate: settings?.designTemplate ?? "CLASSIC"
      },
      companyWebsiteUrl: scope.company.websiteUrl ?? "",
      embedCode,
      limits: {
        retentionDays: scope.entitlements.liveChatRetentionDays,
        messageCooldownSeconds: scope.entitlements.liveChatMessageCooldownSeconds,
        monthlyChatLimit: scope.entitlements.liveChatMonthlyLimit,
        customerLimit: scope.entitlements.liveChatCustomerLimit
      }
    });
  } catch (error) {
    const { code, status } = liveChatError(error, "LIVE_CHAT_SETTINGS_LOAD_FAILED");
    return jsonError(code, status);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const scope = await requireLiveChatScope();
    if (scope.session.role !== "COMPANY_ADMIN") return jsonError("FORBIDDEN", 403);
    const body = await readLiveChatJson(request);
    const draft = validateLiveChatSettingsDraft(body);
    const { Types } = await import("mongoose");
    const { LiveChatSettings } = await import("@/models/live-chat-settings");
    const updated = await LiveChatSettings.findOneAndUpdate(
      { companyId: new Types.ObjectId(scope.companyId), workspaceId: new Types.ObjectId(scope.workspaceId) },
      { $set: draft, $setOnInsert: { companyId: new Types.ObjectId(scope.companyId), workspaceId: new Types.ObjectId(scope.workspaceId) } },
      { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true }
    ).lean();
    return jsonOk({
      settings: {
        publicWidgetEnabled: updated?.publicWidgetEnabled ?? false,
        title: updated?.title ?? "Chat with us",
        welcomeMessage: updated?.welcomeMessage ?? "",
        primaryColor: updated?.primaryColor ?? "#2563eb",
        theme: updated?.theme ?? "LIGHT",
        position: updated?.position ?? "RIGHT",
        collectName: updated?.collectName ?? false,
        collectEmail: updated?.collectEmail ?? false,
        collectPhone: updated?.collectPhone ?? false,
        offlineMode: updated?.offlineMode ?? false,
        allowedDomains: updated?.allowedDomains ?? [],
        launcherSize: updated?.launcherSize ?? 60,
        launcherIconSize: updated?.launcherIconSize ?? 28,
        launcherShape: updated?.launcherShape ?? "CIRCLE",
        panelRadius: updated?.panelRadius ?? 18,
        headerStyle: updated?.headerStyle ?? "SOLID",
        designTemplate: updated?.designTemplate ?? "CLASSIC"
      }
    });
  } catch (error) {
    const { code, status } = liveChatError(error, "LIVE_CHAT_SETTINGS_SAVE_FAILED");
    return jsonError(code, status);
  }
}
