import { createHmac, timingSafeEqual } from "node:crypto";

const TICKET_TTL_MS = 90_000;
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const ALLOWED_ROLES = new Set(["COMPANY_ADMIN", "EMPLOYEE", "PLATFORM_ADMIN"]);

export type TaskRealtimeTicketPayload = {
  version: 1;
  userId: string;
  companyId: string;
  workspaceId: string;
  role: "COMPANY_ADMIN" | "EMPLOYEE" | "PLATFORM_ADMIN";
  expiresAt: number;
};
function signingSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("TASK_REALTIME_AUTH_NOT_CONFIGURED");
  return secret;
}
function signature(value: string) {
  return createHmac("sha256", signingSecret()).update(value).digest("base64url");
}
export function createTaskRealtimeTicket(input: {
  userId: string;
  companyId: string;
  workspaceId: string;
  role: string;
}, now = Date.now()) {
  if (!OBJECT_ID_PATTERN.test(input.userId) || !OBJECT_ID_PATTERN.test(input.companyId) ||
      !OBJECT_ID_PATTERN.test(input.workspaceId) || !ALLOWED_ROLES.has(input.role)) {
    throw new Error("TASK_REALTIME_SCOPE_INVALID");
  }
  const payload: TaskRealtimeTicketPayload = {
    version: 1,
    userId: input.userId.toLowerCase(),
    companyId: input.companyId.toLowerCase(),
    workspaceId: input.workspaceId.toLowerCase(),
    role: input.role as TaskRealtimeTicketPayload["role"],
    expiresAt: now + TICKET_TTL_MS
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return { ticket: encoded + "." + signature(encoded), expiresAt: payload.expiresAt };
}
export function verifyTaskRealtimeTicket(ticket: string, now = Date.now()): TaskRealtimeTicketPayload | null {
  try {
    const [encoded, suppliedSignature, extra] = ticket.split(".");
    if (!encoded || !suppliedSignature || extra !== undefined) return null;
    const expected = Buffer.from(signature(encoded));
    const supplied = Buffer.from(suppliedSignature);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<TaskRealtimeTicketPayload>;
    if (payload.version !== 1 ||
        typeof payload.userId !== "string" || !OBJECT_ID_PATTERN.test(payload.userId) ||
        typeof payload.companyId !== "string" || !OBJECT_ID_PATTERN.test(payload.companyId) ||
        typeof payload.workspaceId !== "string" || !OBJECT_ID_PATTERN.test(payload.workspaceId) ||
        typeof payload.role !== "string" || !ALLOWED_ROLES.has(payload.role) ||
        typeof payload.expiresAt !== "number" || payload.expiresAt <= now ||
        payload.expiresAt > now + 2 * 60_000) return null;
    return payload as TaskRealtimeTicketPayload;
  } catch {
    return null;
  }
}
