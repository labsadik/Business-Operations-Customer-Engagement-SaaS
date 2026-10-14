import { requirePlatformAdmin } from "@/lib/admin";
import { getAdminVaultUsagePage } from "@/lib/admin-vault-usage";
import { jsonError, jsonOk } from "@/lib/http";
import { parseListLimit } from "@/lib/list-pagination";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin();
    const url = new URL(request.url);
    const page = await getAdminVaultUsagePage({
      search: url.searchParams.get("search") ?? "",
      cursor: url.searchParams.get("cursor"),
      limit: parseListLimit(url.searchParams.get("limit"), 10, 50)
    });
    return jsonOk(page);
  } catch (error) {
    const code = error instanceof Error ? error.message : "ADMIN_VAULT_USAGE_FAILED";
    const status = code === "UNAUTHENTICATED"
      ? 401
      : code === "FORBIDDEN"
        ? 403
        : code === "INVALID_LIST_CURSOR" || code.endsWith("_INVALID")
          ? 400
          : 500;
    return jsonError(code, status);
  }
}
