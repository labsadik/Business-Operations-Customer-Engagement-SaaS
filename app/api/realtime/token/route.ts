import { jsonError, jsonOk } from "@/lib/http";
import { requireCompanyMember } from "@/lib/authz";
import { createRealtimeToken } from "@/lib/realtime-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { session, membership } = await requireCompanyMember([
      "COMPANY_OWNER",
      "COMPANY_ADMIN",
      "EMPLOYEE"
    ]);

    const token = createRealtimeToken({
      userId: session.userId,
      companyId: session.companyId!,
      role: membership.role
    });

    return jsonOk({ token });
  } catch (error) {
    const code = error instanceof Error ? error.message : "REALTIME_TOKEN_FAILED";
    return jsonError(code, code === "UNAUTHENTICATED" ? 401 : 403);
  }
}
