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
    const current = await redis.get(key);
    if (current === token) {
      await redis.del(key);
    }
  }
}