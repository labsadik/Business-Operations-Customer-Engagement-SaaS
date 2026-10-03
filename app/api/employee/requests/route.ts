import { getMongo } from "@/lib/mongodb";
import { BookingRequest } from "@/models/booking-request";
import { User } from "@/models/user";
import { getSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session || !session.companyId) return jsonError("UNAUTHENTICATED", 401);
  if (!["EMPLOYEE", "COMPANY_OWNER", "COMPANY_ADMIN"].includes(session.role)) return jsonError("FORBIDDEN", 403);

  await getMongo();
  const bookings = await BookingRequest.find({
    companyId: session.companyId,
    status: { $in: ["REQUESTED", "RETRYING"] },
    expiresAt: { $gt: new Date() },
    declinedBy: { $ne: session.userId }
  }).sort({ expiresAt: 1, requestedStartAt: 1 }).limit(50).lean();

  const customers = await User.find({ _id: { $in: bookings.map((b) => b.customerId) } }).select("name email image").lean();
  const map = new Map(customers.map((u) => [String(u._id), u]));

  return jsonOk(bookings.map((booking) => {
    const customer = map.get(String(booking.customerId));
    return {
      id: String(booking._id),
      startAt: booking.requestedStartAt,
      endAt: booking.requestedEndAt,
      durationMinutes: booking.requestedDurationMinutes,
      status: booking.status,
      expiresAt: booking.expiresAt,
      customer: customer ? { name: customer.name, email: customer.email, image: customer.image } : null
    };
  }));
}