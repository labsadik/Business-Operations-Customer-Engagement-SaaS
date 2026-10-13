import { createTaskRealtimeTicket } from "@/lib/task-realtime-auth";
import { jsonOk } from "@/lib/http";
import { requireTaskScope, assertTaskFeatureAccess } from "@/features/task-management/server/task-authorization";
import { taskErrorResponse } from "@/features/task-management/server/task-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const scope = await requireTaskScope();
    await assertTaskFeatureAccess(scope, { allowSuspendedRead: true });
    // Vercel serverless does not run this same-process WebSocket upgrade handler.
    if (process.env.VERCEL === "1") return jsonOk({ enabled: false, ticket: null, expiresAt: null });
    const issued = createTaskRealtimeTicket({
      userId: scope.session.userId,
      companyId: scope.companyId,
      workspaceId: scope.workspaceId,
      role: scope.session.role
    });
    return jsonOk({ enabled: true, ticket: issued.ticket, expiresAt: issued.expiresAt });
  } catch (error) {
    return taskErrorResponse(error, "TASK_REALTIME_TICKET_FAILED");
  }
}
