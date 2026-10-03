"use client";

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

async function ensureRazorpayLoaded() {
  if (window.Razorpay) return;

  const existing = document.querySelector<HTMLScriptElement>(
    'script[src="https://checkout.razorpay.com/v1/checkout.js"]'
  );

  if (existing) {
    await new Promise<void>((resolve, reject) => {
      if (window.Razorpay) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("RAZORPAY_SCRIPT_FAILED")), { once: true });
    });
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("RAZORPAY_SCRIPT_FAILED"));
    document.head.appendChild(script);
  });
}

function money(minor: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(minor / 100);
}

export default function RazorpayPlanButton({
  planId,
  currentPlanId,
  disabled = false,
  onComplete,
  onError
}: {
  planId: PlanId;
  currentPlanId: PlanId | null;
  disabled?: boolean;
  onComplete?: () => void;
  onError?: (message: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const plan = PLANS[planId];
  const isCurrent = Boolean(currentPlanId && planId === currentPlanId);

  async function startCheckout() {
    if (loading || isCurrent || disabled) return;
    setLoading(true);

    try {
      await ensureRazorpayLoaded();

      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planId })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const details = body.details as { missingFields?: string[] } | undefined;
        const message =
          body.error === "COMPANY_PROFILE_INCOMPLETE"
            ? "Complete company name, email, and phone in Company Profile before paying."
            : body.error === "PLAN_ALREADY_ACTIVE"
              ? "This plan is already active."
              : body.error || "CHECKOUT_FAILED";
        if (details?.missingFields?.length) {
          throw new Error(message + " Missing: " + details.missingFields.join(", "));
        }
        throw new Error(message);
      }

      if (!window.Razorpay) throw new Error("RAZORPAY_CHECKOUT_NOT_READY");

      const customer = body.data.customer as
        | { name?: string; email?: string; phone?: string }
        | null
        | undefined;
      const pricing = body.data.pricing as
        | { baseAmount: number; gstAmount: number; gstRatePercent: number; totalAmount: number; gstInclusive: boolean }
        | undefined;

      const checkout = new window.Razorpay({
        key: body.data.keyId,
        amount: body.data.amount,
        currency: body.data.currency,
        name: body.data.merchant?.name || "Conventus",
        image: body.data.logoUrl,
        description:
          plan.name +
          " · " +
          money(pricing?.totalAmount ?? body.data.amount, body.data.currency) +
          " total",
        order_id: body.data.orderId,
        prefill: {
          name: customer?.name,
          email: customer?.email,
          contact: customer?.phone
        },
        notes: pricing ? {
          "Base price": money(pricing.baseAmount, body.data.currency),
          "GST": pricing.gstAmount > 0
            ? money(pricing.gstAmount, body.data.currency) + " @ " + pricing.gstRatePercent + "%"
            : "Not applied",
          "Total": money(pricing.totalAmount, body.data.currency)
        } : undefined,
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
            window.location.assign(
              "/billing/result?paymentId=" +
              encodeURIComponent(paymentResponse.razorpay_payment_id)
            );
          } catch (error) {
            onError?.(
              error instanceof Error
                ? error.message
                : "PAYMENT_VERIFICATION_FAILED"
            );
          } finally {
            setLoading(false);
          }
        }
      });

      checkout.on("payment.failed", () => {
        setLoading(false);
        onError?.("PAYMENT_FAILED");
      });
      checkout.open();
    } catch (error) {
      setLoading(false);
      onError?.(error instanceof Error ? error.message : "CHECKOUT_FAILED");
    }
  }

  return (
    <button
      type="button"
      onClick={() => void startCheckout()}
      disabled={disabled || isCurrent || loading}
      className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {loading ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : isCurrent ? (
        <Check className="size-3.5" />
      ) : (
        <CreditCard className="size-3.5" />
      )}
      {loading ? "Opening checkout..." : isCurrent ? "Current plan" : "Choose " + plan.name}
    </button>
  );
}
