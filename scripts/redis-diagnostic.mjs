#!/usr/bin/env node

import { randomUUID } from "node:crypto";

const REDIS_COMMAND_TIMEOUT_MS = 5_000;
const DIAGNOSTIC_TTL_SECONDS = 30;

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function endpointLabel(rawUrl) {
  try {
    const value = new URL(rawUrl);
    const protocol = value.protocol.replace(":", "");
    const db = value.pathname.replace(/^\//, "");
    return {
      protocol,
      host: value.hostname,
      database: db ? Number(db) : "default"
    };
  } catch {
    return { protocol: "tcp", host: "unparseable", database: "default" };
  }
}

async function main() {
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    fail("REDIS_DIAGNOSTIC: REDIS_URL is not configured");
    return;
  }

  if (
    process.env.NODE_ENV === "production" &&
    process.env.CONVENTUS_ALLOW_REDIS_DIAGNOSTIC !== "1"
  ) {
    fail(
      "REDIS_DIAGNOSTIC: production writes require CONVENTUS_ALLOW_REDIS_DIAGNOSTIC=1"
    );
    return;
  }

  const label = endpointLabel(url);
  const token = process.env.REDIS_TOKEN?.trim() || process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  const key = `conventus:diagnostic:${Date.now()}:${randomUUID()}`;
  const value = `ok:${randomUUID()}`;
  const startedAt = Date.now();

  console.log(
    `Redis endpoint: protocol=${label.protocol} host=${label.host} database=${label.database}`
  );

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    REDIS_COMMAND_TIMEOUT_MS
  );

  async function restCommand(path) {
    if (!token) throw new Error("REDIS_REST_TOKEN_NOT_CONFIGURED");
    const response = await fetch(
      url.replace(/\/$/, "") + path,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "content-type": "application/json"
        },
        cache: "no-store",
        signal: controller.signal
      }
    );
    if (!response.ok) {
      throw new Error(`HTTP_${response.status}`);
    }
    return (await response.json()).result;
  }

  try {
    let ping;
    let get;
    let setResult;
    let deleteResult;

    if (url.startsWith("http://") || url.startsWith("https://")) {
      ping = await restCommand("/ping");
      setResult = await restCommand(
        `/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}/NX/EX/${DIAGNOSTIC_TTL_SECONDS}`
      );
      get = await restCommand(`/get/${encodeURIComponent(key)}`);
      deleteResult = await restCommand(`/del/${encodeURIComponent(key)}`);
    } else {
      const { createClient } = await import("redis");
      const client = createClient({
        url,
        disableOfflineQueue: true,
        socket: {
          connectTimeout: REDIS_COMMAND_TIMEOUT_MS,
          socketTimeout: REDIS_COMMAND_TIMEOUT_MS,
          reconnectStrategy: false
        }
      });

      try {
        await client.connect();
        ping = await client.ping();
        setResult = await client.set(key, value, {
          NX: true,
          EX: DIAGNOSTIC_TTL_SECONDS
        });
        get = await client.get(key);
        deleteResult = await client.del(key);
      } finally {
        await client.quit().catch(() => client.destroy());
      }
    }

    if (get !== value) {
      throw new Error("REDIS_ROUNDTRIP_MISMATCH");
    }

    console.log(
      `Redis round-trip: ping=${String(ping)} set=${String(setResult)} get=match delete=${String(deleteResult)} latencyMs=${Date.now() - startedAt}`
    );
    console.log(
      `Diagnostic key: temporary, namespaced, TTL=${DIAGNOSTIC_TTL_SECONDS}s, cleaned up=${Number(deleteResult) > 0}`
    );
  } catch (error) {
    const code =
      error instanceof Error && error.name === "AbortError"
        ? "REDIS_DIAGNOSTIC_TIMEOUT"
        : error instanceof Error
          ? error.message
          : "REDIS_DIAGNOSTIC_FAILED";
    fail(`REDIS_DIAGNOSTIC: ${code}`);
  } finally {
    clearTimeout(timeout);
  }
}

await main();
