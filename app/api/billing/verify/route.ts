import { getMongo } from "@/lib/mongodb";
import { getSession } from "@/lib/session";
import { Payment } from "@/models/payment";
import { verifyRazorpayPaymentSignature, fetchRazorpayPayment } from "@/lib/razorpay";
import { activatePaidPlan } from "@/lib/billing";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return jsonError("UNAUTHENTICATED", 401);
  if (!["COMPANY_OWNER", "COMPANY_ADMIN"].includes(session.role) || !session.companyId) {
    return jsonError("FORBIDDEN", 403);
  }

  await getMongo();
  const body = await request.json().catch(() => null) as {
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    razorpay_signature?: string;
  } | null;

  const orderId = body?.razorpay_order_id?.trim();
  const paymentId = body?.razorpay_payment_id?.trim();
  const signature = body?.razorpay_signature?.trim();

  if (!orderId || !paymentId || !signature) return jsonError("PAYMENT_RESPONSE_INVALID", 400);

  const payment = await Payment.findOne({
    providerOrderId: orderId,
    companyId: session.companyId
  });
  if (!payment) return jsonError("PAYMENT_NOT_FOUND", 404);

  if (!verifyRazorpayPaymentSignature(orderId, paymentId, signature)) {
    return jsonError("PAYMENT_SIGNATURE_INVALID", 400);
  }

  const remotePayment = await fetchRazorpayPayment(paymentId);
  if (remotePayment.order_id !== orderId) return jsonError("PAYMENT_ORDER_MISMATCH", 400);
  if (remotePayment.amount !== payment.amount) return jsonError("PAYMENT_AMOUNT_MISMATCH", 400);
  if (remotePayment.currency !== payment.currency) return jsonError("PAYMENT_CURRENCY_MISMATCH", 400);
  if (remotePayment.status !== "captured") return jsonError("PAYMENT_NOT_CAPTURED", 409);

  payment.providerPaymentId = paymentId;
  await payment.save();
  await activatePaidPlan(String(payment._id));

  return jsonOk({ status: "CAPTURED", planId: payment.planId });
}
