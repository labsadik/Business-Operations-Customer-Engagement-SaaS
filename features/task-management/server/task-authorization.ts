import { Types } from "mongoose";
import { getMongo } from "@/lib/mongodb";
import { requireCompanyMember } from "@/lib/authz";
import { getCompanyEntitlements } from "@/lib/plans-server";
import { Membership } from "@/models/membership";
import { User } from "@/models/user";
import { Workspace } from "@/models/workspace";
import type { AuthSession } from "@/lib/session";

export type TaskScope = {
  session: AuthSession;
  companyId: string;
  workspaceId: string;
  timezone: string;
  isPlatformAdmin: boolean;
};

export async function requireTaskScope(): Promise<TaskScope> {
  await getMongo();
  const { session, membership } = await requireCompanyMember([
    "COMPANY_ADMIN",
    "EMPLOYEE",
    "PLATFORM_ADMIN"
  ]);

  const companyId = session.companyId;
  const workspaceId = session.workspaceId ??
    (membership && "workspaceId" in membership ? String(membership.workspaceId) : undefined);
  if (!companyId || !workspaceId || !Types.ObjectId.isValid(companyId) || !Types.ObjectId.isValid(workspaceId)) {
    throw new Error("COMPANY_NOT_CONFIGURED");
  }

  const workspace = await Workspace.findOne({
    _id: new Types.ObjectId(workspaceId),
    companyId: new Types.ObjectId(companyId),
    active: true
  }).select("_id companyId timezone").lean();
  if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");

  if (session.role !== "PLATFORM_ADMIN") {
    const activeMembership = await Membership.findOne({
      companyId: new Types.ObjectId(companyId),
      workspaceId: new Types.ObjectId(workspaceId),
      userId: new Types.ObjectId(session.userId),
      active: true,
      role: session.role
    }).select("_id").lean();
    if (!activeMembership) throw new Error("FORBIDDEN");
  }

  return {
    session,
    companyId,
    workspaceId,
    timezone: typeof workspace.timezone === "string" && workspace.timezone ? workspace.timezone : "Asia/Kolkata",
    isPlatformAdmin: session.role === "PLATFORM_ADMIN"
  };
}

export async function assertTaskFeatureAccess(scope: TaskScope) {
  // A platform administrator can inspect/manage records via the explicitly
  // protected admin surface even when the tenant's plan does not include Tasks.
  if (scope.isPlatformAdmin) return { taskManagementEnabled: true };
  const plan = await getCompanyEntitlements(scope.companyId);
  if (!plan.taskManagementEnabled) throw new Error("FEATURE_NOT_IN_PLAN");
  return plan;
}

export function canManageTask(scope: TaskScope, task: { createdByUserId: unknown }) {
  return (
    scope.isPlatformAdmin ||
    scope.session.role === "COMPANY_ADMIN" ||
    String(task.createdByUserId) === scope.session.userId
  );
}

export async function assertAssignableEmployees(scope: TaskScope, userIds: string[]) {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) throw new Error("ASSIGNEE_REQUIRED");
  if (ids.length > 50) throw new Error("ASSIGNEE_LIMIT_EXCEEDED");

  const objectIds = ids.map((id) => {
    if (!Types.ObjectId.isValid(id)) throw new Error("ASSIGNEE_ID_INVALID");
    return new Types.ObjectId(id);
  });

  const [memberships, users] = await Promise.all([
    Membership.find({
      companyId: new Types.ObjectId(scope.companyId),
      workspaceId: new Types.ObjectId(scope.workspaceId),
      userId: { $in: objectIds },
      active: true,
      role: { $in: ["COMPANY_ADMIN", "EMPLOYEE"] },
      $or: [
        { employmentStatus: "ACTIVE" },
        { employmentStatus: { $exists: false } }
      ]
    }).select("userId").lean(),
    User.find({
      _id: { $in: objectIds },
      active: { $ne: false }
    }).select("_id").lean()
  ]);

  const memberIds = new Set(memberships.map((item) => String(item.userId)));
  const activeUserIds = new Set(users.map((item) => String(item._id)));
  if (ids.some((id) => !memberIds.has(id) || !activeUserIds.has(id))) {
    throw new Error("ASSIGNEE_NOT_FOUND");
  }
  return objectIds;
}
