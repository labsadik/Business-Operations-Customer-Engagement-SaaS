import { getRedis } from "./redis.ts";
import { randomToken } from "./security.ts";

export async function withRedisLock<T>(key: string, ttlMs: number, fn: () => Promise<T>) {
  let redis: Awaited<ReturnType<typeof getRedis>>;
  try {
    redis = await getRedis();
  } catch (error) {
    if (process.env.NODE_ENV !== "production") throw error;
    const code = error instanceof Error ? error.message : "REDIS_CONNECTION_FAILED";
    console.error("[Conventus] Redis lock unavailable", { code });
    throw new Error("REDIS_UNAVAILABLE");
  }

  if (!redis) {
    if (process.env.NODE_ENV === "production") {
      console.error("[Conventus] Redis lock unavailable", { code: "REDIS_NOT_CONFIGURED" });
      throw new Error("REDIS_UNAVAILABLE");
    }
    return fn();
  }

  const token = randomToken(16);
  let acquired: string | null;
  try {
    acquired = await redis.set(key, token, { NX: true, PX: ttlMs });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") throw error;
    const code = error instanceof Error ? error.message : "REDIS_SET_FAILED";
    console.error("[Conventus] Redis lock unavailable", { code });
    throw new Error("REDIS_UNAVAILABLE");
  }
  if (!acquired) throw new Error("RESOURCE_BUSY");

  try {
    return await fn();
  } finally {
    try {
      await redis.compareAndDelete(key, token);
    } catch (error) {
      const code = error instanceof Error ? error.message : "REDIS_LOCK_RELEASE_FAILED";
      console.warn("[Conventus] Redis lock release failed", { code });
    }
  }
}