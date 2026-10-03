"use client";

import Script from "next/script";
import { useState } from "react";
import { Check, Loader2, CreditCard } from "lucide-react";
import { PLANS, type PlanId } from "@/lib/plans";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, handler: (response: unknown) => void) => void;
    };
  }
}

export default function RazorpayPlanButton({
  planId,
  currentPlanId,
  disabled = false,
  onComplete,
  onError
}: {
  planId: PlanId;
  currentPlanId: PlanId;
  disabled?: boolean;
  onComplete?: () => void;
  onError?: (message: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const plan = PLANS[planId];
  const isCurrent = planId === currentPlanId;

  async function startCheckout() {
    if (loading || isCurrent || disabled) return;
    setLoading(true);

    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planId })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "CHECKOUT_FAILED");

      if (!window.Razorpay) throw new Error("RAZORPAY_CHECKOUT_NOT_READY");

      const checkout = new window.Razorpay({
        key: body.data.keyId,
        amount: body.data.amount,
        currency: body.data.currency,
        name: "Conventus",
        description: plan.name + " plan · 1 month",
        order_id: body.data.orderId,
        prefill: {
          name: body.data.customer?.name,
          email: body.data.customer?.email
        },
        theme: { color: "#2563EB" },
        handler: async (paymentResponse: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          try {
            const verify = await fetch("/api/billing/verify", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(paymentResponse)
            });
            const result = await verify.json().catch(() => ({}));
            if (!verify.ok) throw new Error(result.error || "PAYMENT_VERIFICATION_FAILED");
            onComplete?.();
          } catch (error) {
            onError?.(error instanceof Error ? error.message : "PAYMENT_VERIFICATION_FAILED");
          } finally {
            setLoading(false);
          }
        }
      });

      checkout.on("payment.failed", () => {
        setLoading(false);
      });
      checkout.open();
    } catch (error) {
      setLoading(false);
      throw error;
    }
  }

  return (
    <>
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="afterInteractive"
        onLoad={() => setReady(true)}
      />
      <button
        type="button"
        onClick={() => {
          void startCheckout().catch((error) => {
            setLoading(false);
            onError?.(error instanceof Error ? error.message : "CHECKOUT_FAILED");
          });
        }}
        disabled={disabled || isCurrent || loading || !ready}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {loading ? <Loader2 className="size-3.5 animate-spin" /> : isCurrent ? <Check className="size-3.5" /> : <CreditCard className="size-3.5" />}
        {loading ? "Opening checkout..." : isCurrent ? "Current plan" : "Choose " + plan.name}
      </button>
    </>
  );
}
