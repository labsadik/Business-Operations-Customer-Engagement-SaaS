import { cookies } from "next/headers";
import { getSession, ADMIN_MANAGED_COMPANY_COOKIE } from "@/lib/session";
import { assertSameOrigin } from "@/lib/security";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await getSession();
    if (!session) return jsonError("UNAUTHENTICATED", 401);
    if (session.role !== "PLATFORM_ADMIN") return jsonError("FORBIDDEN", 403);

    const store = await cookies();
    store.delete(ADMIN_MANAGED_COMPANY_COOKIE);
    return jsonOk({ managedCompanyId: null });
  } catch (error) {
    const code = error instanceof Error ? error.message : "ADMIN_COMPANY_UNMANAGE_FAILED";
    const status = code === "CSRF_ORIGIN_INVALID" || code === "FORBIDDEN" ? 403 : code === "UNAUTHENTICATED" ? 401 : 500;
    return jsonError(code, status);
  }
}
