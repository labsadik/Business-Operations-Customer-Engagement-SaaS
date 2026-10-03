import { cookies } from "next/headers";
import { getMongo } from "@/lib/mongodb";
import { Session } from "@/models/session";
import { User } from "@/models/user";
import { randomToken, sha256 } from "@/lib/security";

const COOKIE_NAME = "conventus_session";
const SESSION_DAYS = 14;

export type AuthSession = {
  userId: string;
  role: string;
  companyId?: string;
  workspaceId?: string;
  email: string;
  name: string;
  image?: string;
};

export async function createSession(input: {
  userId: string;
  role: string;
  companyId?: string;
  workspaceId?: string;
}) {
  await getMongo();
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