import { getSession, type AuthSession } from "@/lib/session";
import { Company } from "@/models/company";
import { Membership } from "@/models/membership";

export async function requireCompanyMember(roles?: string[]) {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHENTICATED");
  if (!session.companyId) throw new Error("COMPANY_NOT_CONFIGURED");
  const adminManaged = session.role === "PLATFORM_ADMIN";
  if (roles && !adminManaged && !roles.includes(session.role)) throw new Error("FORBIDDEN");

  const membership = await Membership.findOne({
    companyId: session.companyId,
    userId: session.userId,
    active: true
  }).lean();

  if (!membership) throw new Error("FORBIDDEN");
  return { session, membership };
}

export async function getCompanyForSession(session: AuthSession) {
  if (!session.companyId) return null;
  return Company.findById(session.companyId).lean();
}

export function isManager(role: string) {
  return role === "COMPANY_OWNER" || role === "COMPANY_ADMIN" || role === "PLATFORM_ADMIN";
}