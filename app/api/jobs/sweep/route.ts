import { NextResponse } from "next/server";
import { getMongo } from "@/lib/mongodb";
import { BookingRequest } from "@/models/booking-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

  await getMongo();
  const now = new Date();

  const expired = await BookingRequest.updateMany(
    { status: { $in: ["REQUESTED", "RETRYING", "ASSIGNED", "CREATING_MEETING"] }, expiresAt: { $lte: now } },
    { $set: { status: "EXPIRED", assignedEmployeeId: null } }
  );

  const retry = await BookingRequest.updateMany(
    { status: "RETRYING", expiresAt: { $gt: now }, nextRetryAt: { $lte: now } },
    { $set: { status: "REQUESTED", nextRetryAt: null, assignedEmployeeId: null, declinedBy: [] } }
  );

  return NextResponse.json({
    ok: true,
    expired: expired.modifiedCount,
    retried: retry.modifiedCount,
    timestamp: now.toISOString()
  });
}