type RedisSetOptions = { NX?: boolean; PX?: number; EX?: number };
export type CanvasRedis = {
  isReady: boolean;
  connect(): Promise<CanvasRedis>;
  ping(): Promise<string>;
  set(key: string, value: string, options?: RedisSetOptions): Promise<string | null>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
  compareAndDelete(key: string, value: string): Promise<boolean>;
};

const REDIS_CONNECT_TIMEOUT_MS = 5000;
const REDIS_COMMAND_TIMEOUT_MS = 10000;

function configuredRedisUrl(): string | null {
  const url =
    process.env.REDIS_URL?.trim() ||
    process.env.UPSTASH_REDIS_REST_URL?.trim();
  return url || null;
}

export function isRedisConfigured() {
  return configuredRedisUrl() !== null;
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout?: () => void
) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout?.();
      reject(new Error("REDIS_CONNECTION_TIMEOUT"));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

class UpstashRestRedis implements CanvasRedis {
  isReady = true;
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  async connect() {
    return this;
  }

  private async command(path: string, init?: RequestInit) {
    const response = await fetch(this.baseUrl.replace(/\/$/, "") + path, {
      ...init,
      headers: {
        Authorization: "Bearer " + this.token,
        "content-type": "application/json",
        ...(init?.headers ?? {})
      },
      cache: "no-store",
      signal: init?.signal ?? AbortSignal.timeout(REDIS_COMMAND_TIMEOUT_MS)
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        "UPSTASH_REDIS_" + response.status + ":" + body.slice(0, 300)
      );
    }

    return (await response.json()) as { result?: unknown };
  }

  async ping() {
    const body = await this.command("/ping");
    return String(body.result ?? "PONG");
  }

  async set(key: string, value: string, options?: RedisSetOptions) {
    const pathParts = [
      "/set",
      encodeURIComponent(key),
      encodeURIComponent(value)
    ];
    if (options?.NX) pathParts.push("NX");
    if (options?.PX) pathParts.push("PX", String(options.PX));
    if (options?.EX) pathParts.push("EX", String(options.EX));
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

  async compareAndDelete(key: string, value: string) {
    const script =
      "if redis.call('GET', KEYS[1]) == ARGV[1] then " +
      "return redis.call('DEL', KEYS[1]) " +
      "else return 0 end";

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + this.token,
        "content-type": "application/json"
      },
      body: JSON.stringify(["EVAL", script, 1, key, value]),
      cache: "no-store",
      signal: AbortSignal.timeout(REDIS_COMMAND_TIMEOUT_MS)
    });

    const body = (await response.json().catch(() => ({}))) as {
      result?: unknown;
      error?: unknown;
    };

    if (!response.ok || body.error !== undefined) {
      const detail = typeof body.error === "string" ? ":" + body.error.slice(0, 200) : "";
      throw new Error("UPSTASH_REDIS_EVAL_FAILED" + detail);
    }

    return Number(body.result ?? 0) === 1;
  }
}

declare global {
  var __canvasRedis: CanvasRedis | undefined;
  var __canvasRedisConnect: Promise<CanvasRedis> | undefined;
}

async function createRedisClient(): Promise<CanvasRedis> {
  const url = configuredRedisUrl();
  if (!url) throw new Error("REDIS_NOT_CONFIGURED");

  const restToken =
    process.env.REDIS_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url.startsWith("https://") || url.startsWith("http://")) {
    if (!restToken) throw new Error("REDIS_REST_TOKEN_NOT_CONFIGURED");
    return new UpstashRestRedis(url, restToken);
  }

  const { createClient } = await import("redis");
  const client = createClient({
    url,
    disableOfflineQueue: true,
    socket: {
      connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
      socketTimeout: REDIS_COMMAND_TIMEOUT_MS,
      reconnectStrategy: false,
      keepAlive: false
    }
  });

  client.on("error", (error) =>
    console.error("Canvas Redis error", error)
  );

  const wrapped: CanvasRedis = {
    get isReady() {
      return client.isReady;
    },
    async connect() {
      if (client.isReady) return wrapped;

      try {
        await withTimeout(
          client.connect(),
          REDIS_CONNECT_TIMEOUT_MS,
          () => {
            try {
              if (client.isOpen) client.destroy();
            } catch {
              // The connection is already closed.
            }
          }
        );
        return wrapped;
      } catch (error) {
        try {
          if (client.isOpen) client.destroy();
        } catch {
          // The connection is already closed.
        }
        throw error;
      }
    },
    async ping() {
      return client.ping();
    },
    async set(key, value, options) {
      return client.set(key, value, {
        NX: options?.NX,
        PX: options?.PX,
        EX: options?.EX
      });
    },
    async get(key) {
      return client.get(key);
    },
    async del(key) {
      return client.del(key);
    },
    async compareAndDelete(key, value) {
      const script =
        "if redis.call('GET', KEYS[1]) == ARGV[1] then " +
        "return redis.call('DEL', KEYS[1]) " +
        "else return 0 end";

      const result = await client.eval(script, {
        keys: [key],
        arguments: [value]
      });
      return Number(result) === 1;
    }
  };

  client.on("end", () => {
    if (globalThis.__canvasRedis === wrapped) {
      globalThis.__canvasRedis = undefined;
      globalThis.__canvasRedisConnect = undefined;
    }
  });

  return wrapped;
}

async function createAndConnectRedis(): Promise<CanvasRedis> {
  const client = await createRedisClient();
  globalThis.__canvasRedis = client;
  if (client.isReady) return client;
  return client.connect();
}

export async function getRedis(): Promise<CanvasRedis | null> {
  if (!configuredRedisUrl()) return null;

  if (globalThis.__canvasRedis?.isReady) {
    return globalThis.__canvasRedis;
  }

  const existingConnect = globalThis.__canvasRedisConnect;
  const connectPromise =
    existingConnect ??
    (globalThis.__canvasRedis
      ? globalThis.__canvasRedis.connect()
      : createAndConnectRedis());

  globalThis.__canvasRedisConnect = connectPromise;

  try {
    return await connectPromise;
  } catch (error) {
    globalThis.__canvasRedisConnect = undefined;
    if (globalThis.__canvasRedis?.isReady !== true) {
      globalThis.__canvasRedis = undefined;
    }
    throw error;
  } finally {
    if (globalThis.__canvasRedisConnect === connectPromise) {
      globalThis.__canvasRedisConnect = undefined;
    }
  }
}
