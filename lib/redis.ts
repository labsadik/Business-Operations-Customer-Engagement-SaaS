type RedisSetOptions = { NX?: boolean; PX?: number; EX?: number };
export type ConventusRedis = {
  isReady: boolean;
  connect(): Promise<ConventusRedis>;
  ping(): Promise<string>;
  set(key: string, value: string, options?: RedisSetOptions): Promise<string | null>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
};

const REDIS_CONNECT_TIMEOUT_MS = 5000;
const REDIS_COMMAND_TIMEOUT_MS = 10000;

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

class UpstashRestRedis implements ConventusRedis {
  isReady = true;

  constructor(
    private readonly baseUrl: string,
    private readonly token: string
  ) {}

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
}

declare global {
  var __conventusRedis: ConventusRedis | undefined;
  var __conventusRedisConnect: Promise<ConventusRedis> | undefined;
}

async function createRedisClient(): Promise<ConventusRedis> {
  const url = process.env.REDIS_URL;
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
    console.error("Conventus Redis error", error)
  );

  const wrapped: ConventusRedis = {
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
    }
  };

  client.on("end", () => {
    if (globalThis.__conventusRedis === wrapped) {
      globalThis.__conventusRedis = undefined;
      globalThis.__conventusRedisConnect = undefined;
    }
  });

  return wrapped;
}

async function createAndConnectRedis(): Promise<ConventusRedis> {
  const client = await createRedisClient();
  globalThis.__conventusRedis = client;
  if (client.isReady) return client;
  return client.connect();
}

export async function getRedis(): Promise<ConventusRedis | null> {
  if (!process.env.REDIS_URL) return null;

  if (globalThis.__conventusRedis?.isReady) {
    return globalThis.__conventusRedis;
  }

  const existingConnect = globalThis.__conventusRedisConnect;
  const connectPromise =
    existingConnect ??
    (globalThis.__conventusRedis
      ? globalThis.__conventusRedis.connect()
      : createAndConnectRedis());

  globalThis.__conventusRedisConnect = connectPromise;

  try {
    return await connectPromise;
  } catch (error) {
    globalThis.__conventusRedisConnect = undefined;
    if (globalThis.__conventusRedis?.isReady !== true) {
      globalThis.__conventusRedis = undefined;
    }
    throw error;
  } finally {
    if (globalThis.__conventusRedisConnect === connectPromise) {
      globalThis.__conventusRedisConnect = undefined;
    }
  }
}
