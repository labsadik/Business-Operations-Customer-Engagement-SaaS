import { getMongo } from "@/lib/mongodb";
import { Payment } from "@/models/payment";
import { verifyRazorpayWebhookSignature } from "@/lib/razorpay";
import { activatePaidPlan } from "@/lib/billing";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RazorpayWebhookEvent = {
  event?: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
        status?: string;
        amount?: number;
        currency?: string;
        created_at?: number;
        error_description?: string;
      };
    };
  };
};

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature") ?? "";

  if (!verifyRazorpayWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ ok: false, error: "INVALID_SIGNATURE" }, { status: 400 });
  }

  let event: RazorpayWebhookEvent;
  try {
    event = JSON.parse(rawBody) as RazorpayWebhookEvent;
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
  }

  try {
    await getMongo();

    const entity = event.payload?.payment?.entity;

    if (event.event === "payment.captured") {
      if (!entity?.order_id || !entity.id) {
        return NextResponse.json({ ok: false, error: "CAPTURE_PAYLOAD_INVALID" }, { status: 400 });
      }

      const payment = await Payment.findOne({
        providerOrderId: entity.order_id,
        merchantAccount: "CONVENTUS"
      });

      if (!payment) {
        // Unknown provider orders are acknowledged so Razorpay does not
        // repeatedly retry an event that cannot belong to this platform.
        return NextResponse.json({ ok: true, ignored: true });
      }

      if (entity.amount !== payment.amount) {
        return NextResponse.json({ ok: false, error: "PAYMENT_AMOUNT_MISMATCH" }, { status: 400 });
      }

      if (entity.currency !== payment.currency) {
        return NextResponse.json({ ok: false, error: "PAYMENT_CURRENCY_MISMATCH" }, { status: 400 });
      }

      if (
        payment.status === "CAPTURED" &&
        payment.providerPaymentId &&
        payment.providerPaymentId !== entity.id
      ) {
        return NextResponse.json({ ok: false, error: "PAYMENT_PROVIDER_ID_CONFLICT" }, { status: 409 });
      }

      // Older failed records stored the failed provider ID in the success
      // field. Move that ID to the audit field before recording the capture.
      if (
        payment.status === "FAILED" &&
        payment.providerPaymentId &&
        payment.providerPaymentId !== entity.id
      ) {
        payment.failurePaymentId ??= payment.providerPaymentId;
        payment.providerPaymentId = undefined;
      }

      payment.providerPaymentId = entity.id;
      payment.paidAt = entity.created_at
        ? new Date(entity.created_at * 1000)
        : payment.paidAt ?? new Date();
      await payment.save();

      await activatePaidPlan(String(payment._id));
    }

    if (event.event === "payment.failed") {
      if (!entity?.order_id) {
        return NextResponse.json({ ok: false, error: "FAILURE_PAYLOAD_INVALID" }, { status: 400 });
      }

      await Payment.updateOne(
        {
          providerOrderId: entity.order_id,
          merchantAccount: "CONVENTUS",
          status: "PENDING"
        },
        {
          $set: {
            status: "FAILED",
            ...(entity.id ? { failurePaymentId: entity.id } : {}),
            failureReason: entity.error_description?.slice(0, 500)
          },
          $unset: {
            providerPaymentId: "",
            paidAt: "",
            activatedAt: "",
            checkoutKey: ""
          }
        }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "WEBHOOK_PROCESSING_FAILED";
    const status =
      code === "PAYMENT_AMOUNT_MISMATCH" ||
      code === "PAYMENT_CURRENCY_MISMATCH" ||
      code === "PAYMENT_PROVIDER_ID_CONFLICT"
        ? 409
        : 500;
    return NextResponse.json({ ok: false, error: code }, { status });
  }
}
