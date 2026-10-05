import { getPlatformSettings } from "@/lib/platform";
import { normalizeNavigationLabels } from "@/lib/navigation-labels";
import { jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getPlatformSettings();
  return jsonOk(normalizeNavigationLabels(settings.navigation));
}
