import { Types } from "mongoose";
import { getMongo } from "@/lib/mongodb";
import { Company } from "@/models/company";
import { BookingRequest } from "@/models/booking-request";
import { Feedback } from "@/models/feedback";
import { getSession } from "@/lib/session";
import { withRedisLock } from "@/lib/redis-lock";
import { assertSameOrigin } from "@/lib/security";
import { jsonError, jsonOk } from "@/lib/http";
import { validateFeedbackInput } from "@/lib/platform-communication";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CUSTOMER_FEEDBACK_COOLDOWN_MS = 10 * 60 * 1000;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ companySlug: string }> }
) {
  try {
    assertSameOrigin(request);

    const session = await getSession();
    if (!session || session.role !== "CUSTOMER") {
      return jsonError("CUSTOMER_LOGIN_REQUIRED", 401);
    }

    const { companySlug } = await params;
    await getMongo();

    const company = await Company.findOne({
      slug: companySlug.toLowerCase(),
      publicBookingEnabled: true
    }).select("_id").lean();

    if (!company) return jsonError("COMPANY_NOT_FOUND", 404);

    const body = await request.json().catch(() => null) as {
      rating?: unknown;
      description?: unknown;
      bookingId?: unknown;
    } | null;

    const input = validateFeedbackInput(body?.rating, body?.description);

    if (body?.bookingId !== undefined && typeof body.bookingId !== "string") {
      return jsonError("INVALID_BOOKING_REFERENCE", 400);
    }

    const bookingReference =
      typeof body?.bookingId === "string" && Types.ObjectId.isValid(body.bookingId)
        ? body.bookingId
        : "";

    const feedback = await withRedisLock(
      "feedback:customer:" + session.userId + ":" + String(company._id),
      10_000,
      async () => {
        const cutoff = new Date(Date.now() - CUSTOMER_FEEDBACK_COOLDOWN_MS);
        const recent = await Feedback.findOne({
          source: "CUSTOMER_BOOKING",
          companyId: company._id,
          submitterUserId: session.userId,
          createdAt: { $gte: cutoff }
        }).select("_id").lean();

        if (recent) throw new Error("FEEDBACK_COOLDOWN_ACTIVE");

        const eligibleBookingStatuses = ["CONFIRMED", "IN_PROGRESS", "COMPLETED"] as const;
        let bookingRequestId: Types.ObjectId | undefined;

        const eligibleBooking = await BookingRequest.findOne({
          companyId: company._id,
          customerId: session.userId,
          status: { $in: eligibleBookingStatuses }
        })
          .sort({ requestedStartAt: -1, _id: -1 })
          .select("_id")
          .lean();

        if (!eligibleBooking) throw new Error("BOOKING_REQUIRED_FOR_FEEDBACK");

        if (bookingReference) {
          const requestedBooking = await BookingRequest.findOne({
            _id: bookingReference,
            companyId: company._id,
            customerId: session.userId,
            status: { $in: eligibleBookingStatuses }
          }).select("_id").lean();

          bookingRequestId = requestedBooking?._id ?? eligibleBooking._id;
        } else {
          bookingRequestId = eligibleBooking._id;
        }

        return Feedback.create({
          source: "CUSTOMER_BOOKING",
          companyId: company._id,
          submitterUserId: new Types.ObjectId(session.userId),
          ...(bookingRequestId ? { bookingRequestId } : {}),
          rating: input.rating,
          description: input.description,
          submitterName: session.name || undefined,
          submitterEmail: session.email || undefined,
          submitterImage: session.image || undefined,
          reviewStatus: "NEW"
        });
      }
    );

    return jsonOk({ id: String(feedback._id), created: true }, 201);
  } catch (error) {
    const code = error instanceof Error ? error.message : "FEEDBACK_SUBMISSION_FAILED";
    const status =
      code === "CSRF_ORIGIN_INVALID" ? 403 :
      code === "CUSTOMER_LOGIN_REQUIRED" ? 401 :
      code === "COMPANY_NOT_FOUND" ? 404 :
      code === "FEEDBACK_COOLDOWN_ACTIVE" ? 429 :
      code === "BOOKING_REQUIRED_FOR_FEEDBACK" ? 403 :
      code.includes("INVALID") || code.includes("TOO_LONG") ? 400 : 500;

    return jsonError(code, status);
  }
}
