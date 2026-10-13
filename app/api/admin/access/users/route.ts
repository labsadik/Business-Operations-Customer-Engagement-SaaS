import { getAdminAccessUsers } from "@/lib/admin";
import { jsonError, jsonOk } from "@/lib/http";
import { parseListLimit } from "@/lib/list-pagination";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const page = await getAdminAccessUsers({
      search: url.searchParams.get("search") ?? "",
      cursor: url.searchParams.get("cursor"),
      limit: parseListLimit(url.searchParams.get("limit"))
    });
    return jsonOk(page);
  } catch (error) {
    const code = error instanceof Error ? error.message : "ADMIN_ACCESS_READ_FAILED";
    return jsonError(code, code === "UNAUTHENTICATED" ? 401 : code === "FORBIDDEN" ? 403 : code === "INVALID_LIST_CURSOR" || code.endsWith("_INVALID") ? 400 : 500);
  }
}
