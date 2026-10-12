import { NextResponse } from "next/server";
import { getMongo } from "@/lib/mongodb";
import { getRedis, isRedisConfigured } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEALTH_TIMEOUT_MS = 3000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("HEALTH_CHECK_TIMEOUT"));
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

async function checkMongo(): Promise<"ok" | "not_configured" | "error"> {
  if (!process.env.MONGODB_URI) return "not_configured";

  try {
    return await withTimeout(
      (async () => {
        const db = await getMongo();
        if (!db.connection.db) {
          throw new Error("MONGO_DB_UNAVAILABLE");
        }
        await db.connection.db.command({ ping: 1 });
        return "ok" as const;
      })(),
      HEALTH_TIMEOUT_MS
    );
  } catch {
    return "error";
  }
}

async function checkRedis(): Promise<"ok" | "not_configured" | "error"> {
  if (!isRedisConfigured()) return "not_configured";

  try {
    return await withTimeout(
      (async () => {
        const client = await getRedis();
        if (!client) return "not_configured" as const;
        await client.ping();
        return "ok" as const;
      })(),
      HEALTH_TIMEOUT_MS
    );
  } catch {
    return "error";
  }
}

export async function GET() {
  const startedAt = Date.now();

  const [mongo, redis] = await Promise.all([
    checkMongo(),
    checkRedis()
  ]);

  const healthy = mongo === "ok" && redis === "ok";

  return NextResponse.json(
    {
      service: "conventus",
      status: healthy ? "ok" : "degraded",
      checks: { mongo, redis },
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString()
    },
    {
      status: healthy ? 200 : 503,
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
