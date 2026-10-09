import { Types } from "mongoose";
import { assertSameOrigin } from "@/lib/security";
import { getMongo } from "@/lib/mongodb";
import { jsonError, jsonOk } from "@/lib/http";
import { TaskNotification } from "@/models/task-notification";
import { assertTaskFeatureAccess, requireTaskScope } from "@/features/task-management/server/task-authorization";
import { taskErrorResponse } from "@/features/task-management/server/task-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ notificationId: string }> }
) {
  try {
    assertSameOrigin(request);
    const scope = await requireTaskScope();
    await assertTaskFeatureAccess(scope);
    await getMongo();
    const { notificationId } = await params;
    if (!Types.ObjectId.isValid(notificationId)) return jsonError("INVALID_NOTIFICATION_ID", 400);

    const body = await request.json().catch(() => null) as { read?: unknown } | null;
    const read = body?.read === undefined ? true : body.read;
    if (typeof read !== "boolean") return jsonError("NOTIFICATION_READ_INVALID", 400);

    const updated = await TaskNotification.findOneAndUpdate(
      {
        _id: new Types.ObjectId(notificationId),
        companyId: new Types.ObjectId(scope.companyId),
        workspaceId: new Types.ObjectId(scope.workspaceId),
        recipientUserId: new Types.ObjectId(scope.session.userId)
      },
      { $set: { readAt: read ? new Date() : null } },
      { returnDocument: "after" }
    ).select("_id readAt").lean();

    if (!updated) return jsonError("NOTIFICATION_NOT_FOUND", 404);
    return jsonOk({ id: String(updated._id), readAt: updated.readAt ?? null });
  } catch (error) {
    return taskErrorResponse(error, "TASK_NOTIFICATION_UPDATE_FAILED");
  }
}
