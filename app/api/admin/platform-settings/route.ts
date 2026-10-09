import { getPlatformSettings } from "@/lib/platform";
import { PlatformSettings } from "@/models/platform-settings";
import { assertSameOrigin } from "@/lib/security";
import { jsonError, jsonOk } from "@/lib/http";
import { requirePlatformAdmin } from "@/lib/admin";
import { normalizeNavigationLabels } from "@/lib/navigation-labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: unknown, max = 2000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET() {
  try {
    await requirePlatformAdmin();
    const settings = await getPlatformSettings();
    return jsonOk({
      legalName: settings.legalName,
      description: settings.description,
      websiteUrl: settings.websiteUrl,
      billingEmail: settings.billingEmail,
      phone: settings.phone,
      logoUrl: settings.logoUrl,
      taxId: settings.taxId,
      gstin: settings.gstin,
      sacCode: settings.sacCode,
      address: settings.address,
      gst: settings.gst,
      navigation: normalizeNavigationLabels(settings.navigation)
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PLATFORM_SETTINGS_READ_FAILED";
    return jsonError(code, code === "UNAUTHENTICATED" ? 401 : 403);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requirePlatformAdmin();
    const body = await request.json().catch(() => null);

    if (!body || typeof body !== "object") return jsonError("INVALID_SETTINGS", 400);
    const input = body as Record<string, unknown>;

    const gst = input.gst && typeof input.gst === "object" ? input.gst as Record<string, unknown> : {};
    const address = input.address && typeof input.address === "object" ? input.address as Record<string, unknown> : {};
    const rate = Number(gst.ratePercent ?? 18);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      return jsonError("INVALID_GST_RATE", 400);
    }

    const navigation = normalizeNavigationLabels(input.navigation);

    const billingEmail = clean(input.billingEmail, 254).toLowerCase();
    if (billingEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billingEmail)) {
      return jsonError("INVALID_BILLING_EMAIL", 400);
    }

    const values = {
      legalName: clean(input.legalName, 200),
      description: clean(input.description, 1200),
      websiteUrl: clean(input.websiteUrl, 500),
      billingEmail,
      phone: clean(input.phone, 32),
      logoUrl: clean(input.logoUrl, 2000),
      taxId: clean(input.taxId, 80),
      gstin: clean(input.gstin, 80),
      sacCode: clean(input.sacCode, 40),
      address: {
        line1: clean(address.line1, 200),
        line2: clean(address.line2, 200),
        city: clean(address.city, 100),
        state: clean(address.state, 100),
        postalCode: clean(address.postalCode, 30),
        country: clean(address.country, 100) || "India"
      },
      gst: {
        enabled: gst.enabled !== false,
        ratePercent: rate,
        inclusive: gst.inclusive !== false
      },
      navigation,
      updatedByUserId: session.userId
    };

    if (!values.legalName) return jsonError("LEGAL_NAME_REQUIRED", 400);
    if (!values.description) return jsonError("DESCRIPTION_REQUIRED", 400);

    const updated = await PlatformSettings.findOneAndUpdate(
      { key: "default" },
      { $set: values, $setOnInsert: { key: "default" } },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    ).lean();

    return jsonOk({
      legalName: updated!.legalName,
      description: updated!.description,
      websiteUrl: updated!.websiteUrl,
      billingEmail: updated!.billingEmail,
      phone: updated!.phone,
      logoUrl: updated!.logoUrl,
      taxId: updated!.taxId,
      gstin: updated!.gstin,
      sacCode: updated!.sacCode,
      address: updated!.address,
      gst: updated!.gst,
      navigation: normalizeNavigationLabels(updated!.navigation)
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PLATFORM_SETTINGS_UPDATE_FAILED";
    const status = code === "CSRF_ORIGIN_INVALID" || code === "FORBIDDEN" ? 403 : code === "UNAUTHENTICATED" ? 401 : 500;
    return jsonError(code, status);
  }
}
