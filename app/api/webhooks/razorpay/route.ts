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

    if (event.event === "payment.captured") {
      const entity = event.payload?.payment?.entity;
      if (entity?.order_id && entity.id) {
        const payment = await Payment.findOne({ providerOrderId: entity.order_id });
        if (payment && (!payment.merchantAccount || payment.merchantAccount === "CONVENTUS")) {
          payment.providerPaymentId = entity.id;
          if (entity.created_at) payment.paidAt = new Date(entity.created_at * 1000);
          await payment.save();
          await activatePaidPlan(String(payment._id));
        }
      }
    }

    if (event.event === "payment.failed") {
      const entity = event.payload?.payment?.entity;
      if (entity?.order_id) {
        await Payment.updateOne(
          { providerOrderId: entity.order_id, status: "PENDING" },
          {
            $set: {
              status: "FAILED",
              providerPaymentId: entity.id,
              failureReason: entity.error_description?.slice(0, 500)
            }
          }
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "WEBHOOK_PROCESSING_FAILED";
    return NextResponse.json({ ok: false, error: code }, { status: 500 });
  }
}
