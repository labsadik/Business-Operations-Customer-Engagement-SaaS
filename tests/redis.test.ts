import assert from "node:assert/strict";
import test from "node:test";
import { getRedis } from "../lib/redis.ts";
import { withRedisLock } from "../lib/redis-lock.ts";

function resetRedisState() {
  globalThis.__conventusRedis = undefined;
  globalThis.__conventusRedisConnect = undefined;
}

test("Redis is optional when no URL is configured", async () => {
  const previousUrl = process.env.REDIS_URL;
  const previousUpstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.REDIS_URL;
  delete process.env.UPSTASH_REDIS_REST_URL;
  resetRedisState();

  try {
    assert.equal(await getRedis(), null);
  } finally {
    if (previousUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = previousUrl;
    if (previousUpstashUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = previousUpstashUrl;
    resetRedisState();
  }
});

test("Upstash REST URL environment name is accepted", async () => {
  const previousUrl = process.env.REDIS_URL;
  const previousUpstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const previousToken = process.env.REDIS_TOKEN;
  const previousUpstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const originalFetch = globalThis.fetch;

  delete process.env.REDIS_URL;
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
  delete process.env.REDIS_TOKEN;
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  resetRedisState();
  globalThis.fetch = async () => new Response(JSON.stringify({ result: "PONG" }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });

  try {
    const redis = await getRedis();
    assert.ok(redis);
    assert.equal(await redis.ping(), "PONG");
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = previousUrl;
    if (previousUpstashUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = previousUpstashUrl;
    if (previousToken === undefined) delete process.env.REDIS_TOKEN;
    else process.env.REDIS_TOKEN = previousToken;
    if (previousUpstashToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = previousUpstashToken;
    resetRedisState();
  }
});

test("production distributed locks fail closed when Redis is not configured", async () => {
  const previousUrl = process.env.REDIS_URL;
  const previousUpstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const mutableEnv = process.env as Record<string, string | undefined>;
  const previousNodeEnv = mutableEnv.NODE_ENV;
  delete process.env.REDIS_URL;
  delete process.env.UPSTASH_REDIS_REST_URL;
  mutableEnv.NODE_ENV = "production";
  resetRedisState();
  let callbackRan = false;

  try {
    await assert.rejects(
      () => withRedisLock("test:production-lock", 1000, async () => {
        callbackRan = true;
      }),
      /REDIS_UNAVAILABLE/
    );
    assert.equal(callbackRan, false);
  } finally {
    if (previousUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = previousUrl;
    if (previousUpstashUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = previousUpstashUrl;
    if (previousNodeEnv === undefined) delete mutableEnv.NODE_ENV;
    else mutableEnv.NODE_ENV = previousNodeEnv;
    resetRedisState();
  }
});

test("Redis REST failures remain explicit and never expose credentials", async () => {
  const previousUrl = process.env.REDIS_URL;
  const previousToken = process.env.REDIS_TOKEN;
  const originalFetch = globalThis.fetch;

  process.env.REDIS_URL = "https://redis.example.test";
  process.env.REDIS_TOKEN = "test-token";
  resetRedisState();

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: "temporary failure" }), {
      status: 503,
      headers: { "content-type": "application/json" }
    });

  try {
    const redis = await getRedis();
    assert.ok(redis);
    await assert.rejects(redis.ping(), /UPSTASH_REDIS_503/);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = previousUrl;
    if (previousToken === undefined) delete process.env.REDIS_TOKEN;
    else process.env.REDIS_TOKEN = previousToken;
    resetRedisState();
  }
});

test("Redis lock release uses the existing lock value safely", async () => {
  const previousUrl = process.env.REDIS_URL;
  const previousToken = process.env.REDIS_TOKEN;
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  process.env.REDIS_URL = "https://redis.example.test";
  process.env.REDIS_TOKEN = "test-token";
  resetRedisState();

  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), init });

    if (init?.method === "POST" && String(input) === "https://redis.example.test") {
      const command = JSON.parse(String(init.body)) as unknown[];
      assert.equal(command[0], "EVAL");
      assert.equal(command[2], 1);
      return new Response(JSON.stringify({ result: 1 }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ result: "OK" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  try {
    await withRedisLock("test:lock", 1000, async () => "ok");
    assert.equal(
      calls.some((call) => call.init?.method === "POST" && call.url === "https://redis.example.test"),
      true
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = previousUrl;
    if (previousToken === undefined) delete process.env.REDIS_TOKEN;
    else process.env.REDIS_TOKEN = previousToken;
    resetRedisState();
  }
});
