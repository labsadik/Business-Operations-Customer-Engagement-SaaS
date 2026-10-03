import { getMongo } from "@/lib/mongodb";
import { BookingRequest } from "@/models/booking-request";
import { requireCompanyMember } from "@/lib/authz";
import { jsonError, jsonOk } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  try {
    assertSameOrigin(_request);
  } catch {
    return jsonError("CSRF_ORIGIN_INVALID", 403);
  }

  let session: { userId: string; companyId?: string };
  try {
    const result = await requireCompanyMember(["EMPLOYEE", "COMPANY_OWNER", "COMPANY_ADMIN"]);
    session = result.session;
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNAUTHENTICATED";
    return jsonError(code, code === "UNAUTHENTICATED" ? 401 : 403);
  }
  if (!session.companyId) return jsonError("COMPANY_NOT_CONFIGURED", 403);

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