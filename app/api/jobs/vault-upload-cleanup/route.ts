import { NextResponse } from "next/server";
import { getMongo } from "@/lib/mongodb";
import { cleanupExpiredVaultUploads } from "@/features/company-vault/server/vault-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const CLEANUP_BATCH_LIMIT = 25;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    await getMongo();
    // Sweep a small global batch per invocation; never scan every expired upload
    // as part of an interactive user's upload request.
    const result = await cleanupExpiredVaultUploads(undefined, CLEANUP_BATCH_LIMIT);
    return NextResponse.json({
      ok: true,
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Vault upload cleanup job failed", {
      code: error instanceof Error ? error.message : "UNKNOWN_ERROR"
    });
    return NextResponse.json(
      { ok: false, error: "VAULT_UPLOAD_CLEANUP_FAILED" },
      { status: 500 }
    );
  }
}
