import { createClient, type RedisClientType } from "redis";

type RedisSetOptions = { NX?: boolean; PX?: number };
export type ConventusRedis = {
  isReady: boolean;
  connect(): Promise<ConventusRedis>;
  ping(): Promise<string>;
  set(key: string, value: string, options?: RedisSetOptions): Promise<string | null>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
};

class UpstashRestRedis implements ConventusRedis {
  isReady = true;
  constructor(private readonly baseUrl: string, private readonly token: string) {}

  async connect() { return this; }

  private async command(path: string, init?: RequestInit) {
    const response = await fetch(this.baseUrl.replace(/\\/$/, "") + path, {
      ...init,
      headers: {
        Authorization: "Bearer " + this.token,
        "content-type": "application/json",
        ...(init?.headers ?? {})
      },
      cache: "no-store"
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error("UPSTASH_REDIS_" + response.status + ":" + body.slice(0, 300));
    }
    return (await response.json()) as { result?: unknown };
  }

  async ping() {
    const body = await this.command("/ping");
    return String(body.result ?? "PONG");
  }

  async set(key: string, value: string, options?: RedisSetOptions) {
    const pathParts = ["/set", encodeURIComponent(key), encodeURIComponent(value)];
    if (options?.NX) pathParts.push("NX");
    if (options?.PX) pathParts.push("PX", String(options.PX));
    const path = pathParts.join("/");
    const body = await this.command(path);
    return body.result == null ? null : String(body.result);
  }

  async get(key: string) {
    const body = await this.command("/get/" + encodeURIComponent(key));
    return body.result == null ? null : String(body.result);
  }

  async del(key: string) {
    const body = await this.command("/del/" + encodeURIComponent(key));
    return Number(body.result ?? 0);
  }
}

declare global {
  var __conventusRedis: ConventusRedis | undefined;
  var __conventusRedisConnect: Promise<ConventusRedis> | undefined;
}

function createRedisClient(): ConventusRedis {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_NOT_CONFIGURED");

  const restToken = process.env.REDIS_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url.startsWith("https://") || url.startsWith("http://")) {
    if (!restToken) throw new Error("REDIS_REST_TOKEN_NOT_CONFIGURED");
    return new UpstashRestRedis(url, restToken);
  }

  const client = createClient({ url }) as RedisClientType;
  client.on("error", (error) => console.error("Conventus Redis error", error));
  return {
    get isReady() { return client.isReady; },
    async connect() { if (!client.isReady) await client.connect(); return this; },
    async ping() { return client.ping(); },
    async set(key, value, options) { return client.set(key, value, { NX: options?.NX, PX: options?.PX }); },
    async get(key) { return client.get(key); },
    async del(key) { return client.del(key); }
  };
}

export async function getRedis(): Promise<ConventusRedis | null> {
  if (!process.env.REDIS_URL) return null;
  globalThis.__conventusRedis ??= createRedisClient();
  if (globalThis.__conventusRedis.isReady) return globalThis.__conventusRedis;
  globalThis.__conventusRedisConnect ??= globalThis.__conventusRedis.connect().then(() => globalThis.__conventusRedis!);
  return globalThis.__conventusRedisConnect;
}