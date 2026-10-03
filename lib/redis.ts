import { createClient, type RedisClientType } from "redis";

declare global {
  // eslint-disable-next-line no-var
  var __conventusRedis: RedisClientType | undefined;
  // eslint-disable-next-line no-var
  var __conventusRedisConnect: Promise<RedisClientType> | undefined;
}

export async function getRedis() {
  const url = process.env.REDIS_URL;

  if (!url) return null;

  if (!globalThis.__conventusRedis) {
    globalThis.__conventusRedis = createClient({ url });
    globalThis.__conventusRedis.on("error", (error) => {
      console.error("Conventus Redis error", error);
    });
  }

  if (globalThis.__conventusRedis.isReady) {
    return globalThis.__conventusRedis;
  }

  globalThis.__conventusRedisConnect ??= globalThis.__conventusRedis.connect().then(() => globalThis.__conventusRedis!);
  return globalThis.__conventusRedisConnect;
}