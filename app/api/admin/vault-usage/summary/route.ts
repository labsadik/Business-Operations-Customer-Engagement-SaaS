import { requirePlatformAdmin } from "@/lib/admin";
import { getAdminVaultUsageTotals } from "@/lib/admin-vault-usage";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requirePlatformAdmin();
    const totals = await getAdminVaultUsageTotals();
    return jsonOk({ totals });
  } catch (error) {
    const code = error instanceof Error ? error.message : "ADMIN_VAULT_USAGE_SUMMARY_FAILED";
    const status = code === "UNAUTHENTICATED" ? 401 : code === "FORBIDDEN" ? 403 : 500;
    return jsonError(code, status);
  }
}
