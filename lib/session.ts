import { cookies } from "next/headers";
import { getMongo } from "@/lib/mongodb";
import { Session } from "@/models/session";
import { User } from "@/models/user";
import { Membership } from "@/models/membership";
import { Company } from "@/models/company";
import { Workspace } from "@/models/workspace";
import { Types } from "mongoose";
import { randomToken, sha256 } from "@/lib/security";
import { googleAvatarUrl } from "@/lib/avatar";
import { isUserRole, type UserRole } from "@/types/domain";

const COOKIE_NAME = "canvas_session";
export const ADMIN_MANAGED_COMPANY_COOKIE = "canvas_admin_company";
const SESSION_DAYS = 30;
const COMPANY_ROLES = ["COMPANY_ADMIN", "EMPLOYEE"] as const;
const LEGACY_COMPANY_OWNER_ROLE = "COMPANY_OWNER";

function normalizeRole(value: unknown): UserRole | null {
  // Legacy database values are migrated to COMPANY_ADMIN, never treated as a separate permission.
  if (value === LEGACY_COMPANY_OWNER_ROLE) return "COMPANY_ADMIN";
  return isUserRole(value) ? value : null;
}

async function normalizeLegacyRoleData(userId: string) {
  const userObjectId = new Types.ObjectId(userId);
  const membership = await Membership.findOne({
    userId: userObjectId,
    active: true,
    role: { $in: [LEGACY_COMPANY_OWNER_ROLE, "COMPANY_ADMIN"] }
  }).sort({ createdAt: -1 }).select("companyId workspaceId").lean();

  await Promise.all([
    User.updateOne({ _id: userObjectId, role: LEGACY_COMPANY_OWNER_ROLE }, { $set: { role: "COMPANY_ADMIN" } }),
    User.updateOne({ _id: userObjectId, platformAdminPreviousRole: LEGACY_COMPANY_OWNER_ROLE }, { $set: { platformAdminPreviousRole: "COMPANY_ADMIN" } }),
    Membership.updateMany({ userId: userObjectId, role: LEGACY_COMPANY_OWNER_ROLE }, { $set: { role: "COMPANY_ADMIN" } }),
    Session.updateMany(
      { userId: userObjectId, role: LEGACY_COMPANY_OWNER_ROLE, companyId: { $exists: true, $ne: null } },
      { $set: { role: "COMPANY_ADMIN" } }
    ),
    Session.updateMany(
      { userId: userObjectId, role: LEGACY_COMPANY_OWNER_ROLE, $or: [{ companyId: { $exists: false } }, { companyId: null }] },
      { $set: {
        role: "COMPANY_ADMIN",
        ...(membership ? { companyId: membership.companyId, workspaceId: membership.workspaceId } : {})
      } }
    )
  ]);
}

export type AuthSession = {
  userId: string;
  role: UserRole;
  companyId?: string;
  workspaceId?: string;
  email: string;
  name: string;
  image?: string;
};

async function validateScope(input: {
  userId: string;
  role: UserRole;
  companyId?: string;
  workspaceId?: string;
}) {
  const user = await User.findById(input.userId).select("active role").lean();
  if (!user || user.active === false || !normalizeRole(user.role)) throw new Error("USER_INACTIVE");
  const accountRole = normalizeRole(user.role);
  if (accountRole === "PLATFORM_ADMIN" && input.role !== "PLATFORM_ADMIN") throw new Error("FORBIDDEN");
  if (input.role === "PLATFORM_ADMIN" && accountRole !== "PLATFORM_ADMIN") throw new Error("FORBIDDEN");

  if (input.role === "CUSTOMER") {
    if (input.companyId || input.workspaceId) throw new Error("FORBIDDEN");
    return;
  }
  if (input.role === "PLATFORM_ADMIN") {
    if (!input.companyId && !input.workspaceId) return;
    if (!input.companyId || !input.workspaceId || !Types.ObjectId.isValid(input.companyId) || !Types.ObjectId.isValid(input.workspaceId)) {
      throw new Error("COMPANY_NOT_CONFIGURED");
    }
    const workspace = await Workspace.findOne({ _id: input.workspaceId, companyId: input.companyId, active: true }).select("_id").lean();
    if (!workspace) throw new Error("FORBIDDEN");
    return;
  }

  // A company admin may have an unscoped onboarding session solely to create a company.
  if (input.role === "COMPANY_ADMIN" && !input.companyId && !input.workspaceId) return;
  if (!input.companyId || !input.workspaceId || !Types.ObjectId.isValid(input.companyId) || !Types.ObjectId.isValid(input.workspaceId)) {
    throw new Error("COMPANY_NOT_CONFIGURED");
  }

  const [membership, workspace] = await Promise.all([
    Membership.findOne({
      companyId: new Types.ObjectId(input.companyId),
      workspaceId: new Types.ObjectId(input.workspaceId),
      userId: new Types.ObjectId(input.userId),
      active: true,
      role: input.role
    }).select("_id").lean(),
    Workspace.findOne({ _id: input.workspaceId, companyId: input.companyId, active: true }).select("_id").lean()
  ]);
  if (!membership || !workspace) throw new Error("FORBIDDEN");
}

export async function createSession(input: {
  userId: string;
  role: string;
  companyId?: string;
  workspaceId?: string;
}) {
  await getMongo();
  const role = normalizeRole(input.role);
  if (!role) throw new Error("FORBIDDEN");
  if (input.role === LEGACY_COMPANY_OWNER_ROLE) await normalizeLegacyRoleData(input.userId);
  const normalizedInput = { ...input, role };
  await validateScope(normalizedInput);

  const rawToken = randomToken(48);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await Session.create({
    tokenHash: sha256(rawToken),
    userId: input.userId,
    role,
    companyId: input.companyId,
    workspaceId: input.workspaceId,
    expiresAt,
    lastSeenAt: new Date()
  });

  const store = await cookies();
  store.set(COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt
  });
}

export async function clearSession() {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (raw) {
    await getMongo();
    await Session.deleteOne({ tokenHash: sha256(raw) });
  }
  store.delete(COOKIE_NAME);
  store.delete(ADMIN_MANAGED_COMPANY_COOKIE);
}

async function getManagedCompanyScope(userId: unknown, isPlatformAdmin: boolean, store: Awaited<ReturnType<typeof cookies>>) {
  if (!isPlatformAdmin) return null;

  const rawCompanyId = store.get(ADMIN_MANAGED_COMPANY_COOKIE)?.value?.trim();
  if (!rawCompanyId || !Types.ObjectId.isValid(rawCompanyId)) return null;

  const company = await Company.findById(rawCompanyId).select("_id").lean();
  if (!company) return null;

  const workspace = await Workspace.findOne({ companyId: company._id, active: true }).select("_id").sort({ createdAt: 1 }).lean();
  if (!workspace) return null;

  return {
    companyId: String(company._id),
    workspaceId: String(workspace._id),
    userId: String(userId)
  };
}

export async function getSession(): Promise<AuthSession | null> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;

  await getMongo();
  let session = await Session.findOne({ tokenHash: sha256(raw), expiresAt: { $gt: new Date() } })
    .select("_id userId role companyId workspaceId expiresAt lastSeenAt").lean();
  if (!session) return null;

  const user = await User.findById(session.userId).select("active role email name image").lean();
  if (!user || user.active === false) return null;

  if (session.role === LEGACY_COMPANY_OWNER_ROLE || user.role === LEGACY_COMPANY_OWNER_ROLE) {
    await normalizeLegacyRoleData(String(user._id));
    session = await Session.findById(session._id).select("_id userId role companyId workspaceId expiresAt lastSeenAt").lean();
    if (!session) return null;
  }

  const role = normalizeRole(session.role);
  const accountRole = normalizeRole(user.role);
  if (!role || !accountRole) {
    await Session.deleteOne({ _id: session._id });
    return null;
  }

  if (accountRole === "PLATFORM_ADMIN") {
    if (role !== "PLATFORM_ADMIN") {
      await Session.updateOne({ _id: session._id }, { $set: { role: "PLATFORM_ADMIN", lastSeenAt: new Date() } });
    }
    // Tenant access is an explicit, temporary platform-admin action only.
    // Never infer tenant scope from an old session or a personal membership:
    // removing the managed-company cookie must immediately restore platform-only access.
    const managed = await getManagedCompanyScope(user._id, true, store);
    const scopedCompanyId = managed?.companyId;
    const scopedWorkspaceId = managed?.workspaceId;

    if (scopedCompanyId && (!Types.ObjectId.isValid(scopedCompanyId) || !scopedWorkspaceId || !Types.ObjectId.isValid(scopedWorkspaceId))) {
      return { userId: String(user._id), role: "PLATFORM_ADMIN", email: String(user.email), name: String(user.name), image: googleAvatarUrl(user.image) || undefined };
    }
    if (scopedCompanyId && scopedWorkspaceId) {
      const workspace = await Workspace.findOne({ _id: scopedWorkspaceId, companyId: scopedCompanyId, active: true }).select("_id").lean();
      if (!workspace) {
        return { userId: String(user._id), role: "PLATFORM_ADMIN", email: String(user.email), name: String(user.name), image: googleAvatarUrl(user.image) || undefined };
      }
    }
    return {
      userId: String(user._id), role: "PLATFORM_ADMIN", companyId: scopedCompanyId, workspaceId: scopedWorkspaceId,
      email: String(user.email), name: String(user.name), image: googleAvatarUrl(user.image) || undefined
    };
  }

  if (role === "PLATFORM_ADMIN") {
    await Session.deleteOne({ _id: session._id });
    return null;
  }

  if (role === "COMPANY_ADMIN" || role === "EMPLOYEE") {
    const onboardingAdmin = role === "COMPANY_ADMIN" && !session.companyId && !session.workspaceId;
    if (!onboardingAdmin) {
      if (!session.companyId || !session.workspaceId || !Types.ObjectId.isValid(String(session.companyId)) || !Types.ObjectId.isValid(String(session.workspaceId))) {
        await Session.deleteOne({ _id: session._id });
        return null;
      }
      const [membership, activeWorkspace] = await Promise.all([
        Membership.findOne({
          companyId: new Types.ObjectId(String(session.companyId)),
          workspaceId: new Types.ObjectId(String(session.workspaceId)),
          userId: new Types.ObjectId(String(session.userId)),
          active: true,
          role
        }).select("_id").lean(),
        Workspace.findOne({
          _id: new Types.ObjectId(String(session.workspaceId)),
          companyId: new Types.ObjectId(String(session.companyId)),
          active: true
        }).select("_id").lean()
      ]);
      if (!membership || !activeWorkspace) {
        await Session.deleteOne({ _id: session._id });
        return null;
      }
    }
  } else if (role === "CUSTOMER" && (session.companyId || session.workspaceId)) {
    await Session.deleteOne({ _id: session._id });
    return null;
  }

  const lastSeenThreshold = new Date(Date.now() - 5 * 60 * 1000);
  if (!session.lastSeenAt || new Date(session.lastSeenAt).getTime() < lastSeenThreshold.getTime()) {
    await Session.updateOne(
      { _id: session._id, $or: [{ lastSeenAt: { $lt: lastSeenThreshold } }, { lastSeenAt: { $exists: false } }] },
      { $set: { lastSeenAt: new Date() } }
    );
  }
  return {
    userId: String(user._id), role,
    companyId: session.companyId ? String(session.companyId) : undefined,
    workspaceId: session.workspaceId ? String(session.workspaceId) : undefined,
    email: String(user.email), name: String(user.name), image: googleAvatarUrl(user.image) || undefined
  };
}

export async function requireSession(roles?: readonly string[]) {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHENTICATED");
  if (roles && !roles.includes(session.role)) throw new Error("FORBIDDEN");
  return session;
}

export async function updateSessionScope(userId: string, scope: { companyId?: string; workspaceId?: string; role?: UserRole }) {
  await getMongo();
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return;
  await Session.updateOne(
    { tokenHash: sha256(raw), userId },
    {
      $set: {
        ...(scope.companyId !== undefined ? { companyId: scope.companyId } : {}),
        ...(scope.workspaceId !== undefined ? { workspaceId: scope.workspaceId } : {}),
        ...(scope.role !== undefined ? { role: scope.role } : {}),
        lastSeenAt: new Date()
      }
    }
  );
}
