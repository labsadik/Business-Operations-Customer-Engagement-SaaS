import { NextResponse } from "next/server";
import { getMongo } from "@/lib/mongodb";
import { getRedis } from "@/lib/redis";

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
    const db = await getMongo();
    await withTimeout(
      db.connection.db?.command({ ping: 1 }) ?? Promise.reject(new Error("MONGO_DB_UNAVAILABLE")),
      HEALTH_TIMEOUT_MS
    );
    return "ok";
  } catch {
    return "error";
  }
}

async function checkRedis(): Promise<"ok" | "not_configured" | "error"> {
  if (!process.env.REDIS_URL) return "not_configured";

  try {
    const client = await withTimeout(getRedis(), HEALTH_TIMEOUT_MS);
    if (!client) return "not_configured";
    await withTimeout(client.ping(), HEALTH_TIMEOUT_MS);
    return "ok";
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
