import { getRedis } from "@/lib/redis";

export const EMPLOYEE_PRESENCE_STATUSES = ["AVAILABLE", "BUSY", "NOT_AVAILABLE"] as const;
export type EmployeePresenceStatus = (typeof EMPLOYEE_PRESENCE_STATUSES)[number];

const PRESENCE_PREFIX = "conventus:employee-presence";
const HEARTBEAT_TTL_SECONDS = 90;
const NOT_AVAILABLE_TTL_SECONDS = 30 * 24 * 60 * 60;

function key(companyId: string, userId: string) {
  return PRESENCE_PREFIX + ":" + companyId + ":" + userId;
}

function validStatus(value: string | null): EmployeePresenceStatus | null {
  return value && (EMPLOYEE_PRESENCE_STATUSES as readonly string[]).includes(value)
    ? value as EmployeePresenceStatus
    : null;
}

export async function getEmployeePresence(companyId: string, userId: string) {
  const redis = await getRedis();
  if (!redis) return { status: "NOT_AVAILABLE" as const, redisAvailable: false };

  const status = validStatus(await redis.get(key(companyId, userId)));
  return { status: status ?? "NOT_AVAILABLE", redisAvailable: true };
}

export async function setEmployeePresence(companyId: string, userId: string, status: EmployeePresenceStatus) {
  const redis = await getRedis();
  if (!redis) throw new Error("REDIS_NOT_AVAILABLE");

  const ttl = status === "NOT_AVAILABLE" ? NOT_AVAILABLE_TTL_SECONDS : HEARTBEAT_TTL_SECONDS;
  await redis.set(key(companyId, userId), status, { PX: ttl * 1000 });
  return { status, redisAvailable: true, ttlSeconds: ttl };
}

export async function heartbeatEmployeePresence(companyId: string, userId: string) {
  const redis = await getRedis();
  if (!redis) return { status: "NOT_AVAILABLE" as const, redisAvailable: false };

  const current = validStatus(await redis.get(key(companyId, userId))) ?? "AVAILABLE";
  const ttl = current === "NOT_AVAILABLE" ? NOT_AVAILABLE_TTL_SECONDS : HEARTBEAT_TTL_SECONDS;
  await redis.set(key(companyId, userId), current, { PX: ttl * 1000 });
  return { status: current, redisAvailable: true, ttlSeconds: ttl };
}

export async function ensureEmployeePresence(companyId: string, userId: string) {
  const redis = await getRedis();
  if (!redis) return { status: "NOT_AVAILABLE" as const, redisAvailable: false };

  const existing = validStatus(await redis.get(key(companyId, userId)));
  if (existing) return { status: existing, redisAvailable: true };

  await redis.set(key(companyId, userId), "AVAILABLE", { PX: HEARTBEAT_TTL_SECONDS * 1000 });
  return { status: "AVAILABLE" as const, redisAvailable: true, ttlSeconds: HEARTBEAT_TTL_SECONDS };
}

export async function markEmployeeNotAvailable(companyId: string, userId: string) {
  const redis = await getRedis();
  if (!redis) return;
  await redis.set(key(companyId, userId), "NOT_AVAILABLE", { PX: NOT_AVAILABLE_TTL_SECONDS * 1000 });
}

export async function getEmployeePresenceMap(companyId: string, userIds: string[]) {
  const redis = await getRedis();
  const result = new Map<string, EmployeePresenceStatus>();
  if (!redis) {
    userIds.forEach((userId) => result.set(userId, "NOT_AVAILABLE"));
    return { result, redisAvailable: false };
  }

  await Promise.all(userIds.map(async (userId) => {
    const status = validStatus(await redis.get(key(companyId, userId)));
    result.set(userId, status ?? "NOT_AVAILABLE");
  }));
  return { result, redisAvailable: true };
}