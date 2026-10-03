import { jsonError, jsonOk } from "@/lib/http";
import { requireCompanyMember } from "@/lib/authz";
import { EMPLOYEE_PRESENCE_STATUSES, heartbeatEmployeePresence, getEmployeePresence, setEmployeePresence } from "@/lib/employee-presence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function currentMember() {
  const { session, membership } = await requireCompanyMember(["COMPANY_OWNER", "COMPANY_ADMIN", "EMPLOYEE"]);
  return { session, membership };
}

export async function GET() {
  try {
    const { session, membership } = await currentMember();
    const presence = await getEmployeePresence(session.companyId!, session.userId);
    return jsonOk({ userId: session.userId, role: membership.role, ...presence });
  } catch (error) {
    const code = error instanceof Error ? error.message : "FORBIDDEN";
    return jsonError(code, code === "UNAUTHENTICATED" ? 401 : 403);
  }
}

export async function PATCH(request: Request) {
  try {
    const { session } = await currentMember();
    const body = await request.json().catch(() => null) as { status?: string } | null;
    if (!body?.status || !(EMPLOYEE_PRESENCE_STATUSES as readonly string[]).includes(body.status)) {
      return jsonError("INVALID_PRESENCE_STATUS", 400);
    }
    const result = await setEmployeePresence(session.companyId!, session.userId, body.status as typeof EMPLOYEE_PRESENCE_STATUSES[number]);
    return jsonOk(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "PRESENCE_UPDATE_FAILED";
    return jsonError(code, code === "UNAUTHENTICATED" ? 401 : code === "REDIS_NOT_AVAILABLE" ? 503 : 400);
  }
}

export async function POST() {
  try {
    const { session } = await currentMember();
    return jsonOk(await heartbeatEmployeePresence(session.companyId!, session.userId));
  } catch (error) {
    const code = error instanceof Error ? error.message : "PRESENCE_HEARTBEAT_FAILED";
    return jsonError(code, code === "UNAUTHENTICATED" ? 401 : 403);
  }
}