import { cookies } from "next/headers";
import { getMongo } from "@/lib/mongodb";
import { Session } from "@/models/session";
import { User } from "@/models/user";
import { Membership } from "@/models/membership";
import { randomToken, sha256 } from "@/lib/security";

const COOKIE_NAME = "conventus_session";
const SESSION_DAYS = 30;
const COMPANY_ROLES = ["COMPANY_OWNER", "COMPANY_ADMIN", "EMPLOYEE"] as const;

export type AuthSession = {
  userId: string;
  role: string;
  companyId?: string;
  workspaceId?: string;
  email: string;
  name: string;
  image?: string;
};

async function validateScope(input: {
  userId: string;
  role: string;
  companyId?: string;
  workspaceId?: string;
}) {
  const user = await User.findById(input.userId).select("active role").lean();
  if (!user || user.active === false) throw new Error("USER_INACTIVE");

  if (input.role === "PLATFORM_ADMIN" && user.role !== "PLATFORM_ADMIN") {
    throw new Error("FORBIDDEN");
  }

  if (input.companyId && COMPANY_ROLES.includes(input.role as typeof COMPANY_ROLES[number])) {
    const membership = await Membership.findOne({
      companyId: input.companyId,
      userId: input.userId,
      active: true,
      role: input.role
    }).lean();

    if (!membership) throw new Error("FORBIDDEN");
    if (input.workspaceId && String(membership.workspaceId) !== input.workspaceId) {
      throw new Error("FORBIDDEN");
    }
  }
}

export async function createSession(input: {
  userId: string;
  role: string;
  companyId?: string;
  workspaceId?: string;
}) {
  await getMongo();
  await validateScope(input);

  const rawToken = randomToken(48);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await Session.create({
    tokenHash: sha256(rawToken),
    userId: input.userId,
    role: input.role,
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
}

export async function getSession(): Promise<AuthSession | null> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;

  await getMongo();
  const session = await Session.findOne({
    tokenHash: sha256(raw),
    expiresAt: { $gt: new Date() }
  }).lean();

  if (!session) return null;

  const user = await User.findById(session.userId).lean();
  if (!user || user.active === false) return null;

  if (session.role === "PLATFORM_ADMIN" && user.role !== "PLATFORM_ADMIN") {
    await Session.deleteOne({ _id: session._id });
    return null;
  }

  if (session.companyId && COMPANY_ROLES.includes(session.role as typeof COMPANY_ROLES[number])) {
    const membership = await Membership.findOne({
      companyId: session.companyId,
      userId: session.userId,
      active: true,
      role: session.role
    }).lean();

    if (!membership || (session.workspaceId && String(membership.workspaceId) !== String(session.workspaceId))) {
      await Session.deleteOne({ _id: session._id });
      return null;
    }
  }

  await Session.updateOne(
    { _id: session._id },
    { $set: { lastSeenAt: new Date() } }
  );

  return {
    userId: String(user._id),
    role: String(session.role),
    companyId: session.companyId ? String(session.companyId) : undefined,
    workspaceId: session.workspaceId ? String(session.workspaceId) : undefined,
    email: String(user.email),
    name: String(user.name),
    image: user.image ?? undefined
  };
}

export async function requireSession(roles?: string[]) {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHENTICATED");
  if (roles && !roles.includes(session.role)) throw new Error("FORBIDDEN");
  return session;
}

export async function updateSessionScope(userId: string, scope: { companyId?: string; workspaceId?: string; role?: string }) {
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
