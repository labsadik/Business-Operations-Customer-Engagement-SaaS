import { Types } from "mongoose";
import { getSession, type AuthSession } from "@/lib/session";
import { Company } from "@/models/company";
import { Workspace } from "@/models/workspace";
import { Membership } from "@/models/membership";
import { isUserRole, type UserRole } from "@/types/domain";
import { assertCompanyPlanNotSuspended } from "@/lib/plans-server";

const COMPANY_MEMBER_ROLE_VALUES = ["COMPANY_ADMIN", "EMPLOYEE"] as const;

/** Enforce tenant membership on the server; admins must be explicitly allowlisted. */
export async function requireCompanyMember(
  roles: readonly UserRole[] = COMPANY_MEMBER_ROLE_VALUES,
  options: { allowPlanLocked?: boolean } = {}
) {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHENTICATED");
  if (!isUserRole(session.role) || !roles.includes(session.role)) throw new Error("FORBIDDEN");

  if (!session.companyId || !session.workspaceId ||
      !Types.ObjectId.isValid(session.companyId) || !Types.ObjectId.isValid(session.workspaceId)) {
    throw new Error("COMPANY_NOT_CONFIGURED");
  }

  const workspace = await Workspace.findOne({
    _id: new Types.ObjectId(session.workspaceId),
    companyId: new Types.ObjectId(session.companyId),
    active: true
  }).select("_id").lean();
  if (!workspace) throw new Error("FORBIDDEN");

  if (session.role === "PLATFORM_ADMIN") return { session, membership: null };
  if (!(COMPANY_MEMBER_ROLE_VALUES as readonly string[]).includes(session.role)) throw new Error("FORBIDDEN");

  const membership = await Membership.findOne({
    companyId: new Types.ObjectId(session.companyId),
    workspaceId: new Types.ObjectId(session.workspaceId),
    userId: new Types.ObjectId(session.userId),
    active: true,
    role: session.role
  }).lean();
  if (!membership) throw new Error("FORBIDDEN");
  if (!options.allowPlanLocked) await assertCompanyPlanNotSuspended(session.companyId);
  return { session, membership };
}

export async function getCompanyForSession(session: AuthSession) {
  if (!session.companyId) return null;
  return Company.findById(session.companyId).lean();
}

export function isManager(role: string) {
  return role === "COMPANY_ADMIN" || role === "PLATFORM_ADMIN";
}
