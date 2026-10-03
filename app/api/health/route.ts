import { NextResponse } from "next/server";
import { getMongo } from "@/lib/mongodb";
import { getRedis } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();

  let mongo: "ok" | "not_configured" | "error" = "not_configured";
  let redis: "ok" | "not_configured" | "error" = "not_configured";

  if (process.env.MONGODB_URI) {
    try {
      const db = await getMongo();
      await db.connection.db?.command({ ping: 1 });
      mongo = "ok";
    } catch {
      mongo = "error";
    }
  }

  if (process.env.REDIS_URL) {
    try {
      const client = await getRedis();
      if (client) {
        await client.ping();
        redis = "ok";
      }
    } catch {
      redis = "error";
    }
  }

  const healthy = mongo === "ok" && redis === "ok";

  return NextResponse.json(
    {
      service: "conventus",
      status: healthy ? "ok" : "degraded",
      checks: { mongo, redis },
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString()
    },
    { status: healthy ? 200 : 503 }
  );
}