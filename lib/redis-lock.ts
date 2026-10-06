import { getRedis } from "@/lib/redis";
import { randomToken } from "@/lib/security";

export async function withRedisLock<T>(key: string, ttlMs: number, fn: () => Promise<T>) {
  const redis = await getRedis();
  if (!redis) return fn();

  const token = randomToken(16);
  const acquired = await redis.set(key, token, { NX: true, PX: ttlMs });
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