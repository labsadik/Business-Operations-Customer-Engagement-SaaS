import { getMongo } from "@/lib/mongodb";
import { BookingRequest } from "@/models/booking-request";
import { getSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const session = await getSession();
  if (!session || !session.companyId) return jsonError("UNAUTHENTICATED", 401);
  if (!["EMPLOYEE", "COMPANY_OWNER", "COMPANY_ADMIN"].includes(session.role)) return jsonError("FORBIDDEN", 403);

  await getMongo();
  const { bookingId } = await params;

  const booking = await BookingRequest.findOneAndUpdate(
    {
      _id: bookingId,
      companyId: session.companyId,
      status: { $in: ["REQUESTED", "RETRYING"] },
      expiresAt: { $gt: new Date() }
    },
    {
      $addToSet: { declinedBy: session.userId },
      $set: { status: "RETRYING", nextRetryAt: new Date(Date.now() + 20_000) }
    },
    { new: true }
  );

  if (!booking) return jsonError("BOOKING_NO_LONGER_AVAILABLE", 409);

  return jsonOk({ bookingId: String(booking._id), status: booking.status, nextRetryAt: booking.nextRetryAt });
}