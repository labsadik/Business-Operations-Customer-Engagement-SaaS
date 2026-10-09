import { getMongo } from "@/lib/mongodb";
import { getSession } from "@/lib/session";
import { Payment } from "@/models/payment";
import {
  fetchRazorpayPayment,
  verifyRazorpayPaymentSignature
} from "@/lib/razorpay";
import { activatePaidPlan } from "@/lib/billing";
import { jsonError, jsonOk } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);

    const session = await getSession();
    if (!session) return jsonError("UNAUTHENTICATED", 401);
    if (!["COMPANY_ADMIN"].includes(session.role) || !session.companyId) {
      return jsonError("FORBIDDEN", 403);
    }

    const body = await request.json().catch(() => null) as {
      razorpay_order_id?: string;
      razorpay_payment_id?: string;
      razorpay_signature?: string;
    } | null;

    const orderId = body?.razorpay_order_id?.trim();
    const providerPaymentId = body?.razorpay_payment_id?.trim();
    const signature = body?.razorpay_signature?.trim();

    if (!orderId || !providerPaymentId || !signature) {
      return jsonError("PAYMENT_RESPONSE_INVALID", 400);
    }

    await getMongo();

    const payment = await Payment.findOne({
      providerOrderId: orderId,
      companyId: session.companyId,
      merchantAccount: "CONVENTUS"
    });

    if (!payment) return jsonError("PAYMENT_NOT_FOUND", 404);
    if (payment.status === "REFUNDED") return jsonError("PAYMENT_REFUNDED", 409);

    if (!verifyRazorpayPaymentSignature(orderId, providerPaymentId, signature)) {
      return jsonError("PAYMENT_SIGNATURE_INVALID", 400);
    }

    const alreadyUsed = await Payment.findOne({
      providerPaymentId,
      _id: { $ne: payment._id }
    }).select("_id providerOrderId companyId").lean();

    if (alreadyUsed) {
      return jsonError("PAYMENT_ALREADY_RECORDED", 409);
    }

    const remotePayment = await fetchRazorpayPayment(providerPaymentId);

    if (remotePayment.order_id !== orderId) {
      return jsonError("PAYMENT_ORDER_MISMATCH", 400);
    }
    if (remotePayment.amount !== payment.amount) {
      return jsonError("PAYMENT_AMOUNT_MISMATCH", 400);
    }
    if (remotePayment.currency !== payment.currency) {
      return jsonError("PAYMENT_CURRENCY_MISMATCH", 400);
    }
    if (remotePayment.status !== "captured") {
      return jsonError("PAYMENT_NOT_CAPTURED", 409);
    }

    // FAILED is a provider-attempt state. The successful payment ID belongs in
    // providerPaymentId; a previous failed ID is kept separately for auditing.
    if (
      payment.status === "FAILED" &&
      payment.providerPaymentId &&
      payment.providerPaymentId !== providerPaymentId
    ) {
      payment.failurePaymentId ??= payment.providerPaymentId;
      payment.providerPaymentId = undefined;
    }

    if (
      payment.status === "CAPTURED" &&
      payment.providerPaymentId &&
      payment.providerPaymentId !== providerPaymentId
    ) {
      return jsonError("PAYMENT_PROVIDER_ID_CONFLICT", 409);
    }

    payment.providerPaymentId = providerPaymentId;
    payment.paidAt = remotePayment.created_at
      ? new Date(remotePayment.created_at * 1000)
      : payment.paidAt ?? new Date();

    await payment.save();

    try {
      await activatePaidPlan(String(payment._id));
    } catch (error) {
      const activationCode = error instanceof Error ? error.message : "PAYMENT_ACTIVATION_FAILED";
      const refreshed = await Payment.findById(payment._id).select("status").lean();
      if (activationCode === "PLAN_CONFIGURATION_CHANGED" && refreshed?.status === "REFUNDED") {
        return jsonError("PLAN_CONFIGURATION_CHANGED", 409);
      }
      throw error;
    }

    return jsonOk({
      status: "CAPTURED",
      planId: payment.planId,
      paymentId: providerPaymentId
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PAYMENT_VERIFICATION_FAILED";
    const status =
      code === "CSRF_ORIGIN_INVALID" || code === "PAYMENT_MERCHANT_INVALID" ? 403 :
      code === "PAYMENT_NOT_CAPTURED" ? 409 :
      code === "PAYMENT_ALREADY_RECORDED" || code === "PAYMENT_PROVIDER_ID_CONFLICT" || code === "PAYMENT_REFUNDED" || code === "PLAN_CONFIGURATION_CHANGED" ? 409 :
      code.startsWith("RAZORPAY_API_") ? 502 :
      500;
    return jsonError(code, status);
  }
}
