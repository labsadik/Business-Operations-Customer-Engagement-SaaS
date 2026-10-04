"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Loader2, CreditCard, ArrowRight } from "lucide-react";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, handler: (response: unknown) => void) => void;
    };
  }
}

let razorpayLoadPromise: Promise<void> | null = null;

async function ensureRazorpayLoaded() {
  if (window.Razorpay) return;

  if (razorpayLoadPromise) {
    await razorpayLoadPromise;
    return;
  }

  razorpayLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://checkout.razorpay.com/v1/checkout.js"]'
    );

    if (existing) {
      const check = () => {
        if (window.Razorpay) resolve();
        else reject(new Error("RAZORPAY_CHECKOUT_NOT_READY"));
      };
      existing.addEventListener("load", check, { once: true });
      existing.addEventListener("error", () => reject(new Error("RAZORPAY_SCRIPT_FAILED")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = checkRazorpayReady(resolve, reject);
    script.onerror = () => reject(new Error("RAZORPAY_SCRIPT_FAILED"));
    document.head.appendChild(script);
  });

  try {
    await razorpayLoadPromise;
  } catch (error) {
    razorpayLoadPromise = null;
    throw error;
  }
}

function checkRazorpayReady(resolve: () => void, reject: (reason?: unknown) => void) {
  return () => {
    if (window.Razorpay) resolve();
    else reject(new Error("RAZORPAY_CHECKOUT_NOT_READY"));
  };
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
  planName,
  currentPlanId,
  disabled = false,
  mode = "navigate",
  onComplete,
  onError
}: {
  planId: string;
  planName?: string;
  currentPlanId: string | null;
  disabled?: boolean;
  mode?: "navigate" | "pay";
  onComplete?: () => void;
  onError?: (message: string) => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const displayName = planName || "selected plan";
  const isCurrent = Boolean(currentPlanId && planId === currentPlanId);

  async function startCheckout() {
    if (loading || disabled) return;

    if (mode === "navigate") {
      router.push(("/billing/checkout?plan=" + encodeURIComponent(planId)) as Route);
      return;
    }

    setLoading(true);

    try {
      // Create/reuse the server-side order first. This keeps the amount,
      // company, tax, and plan authoritative on the server.
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ planId })
      });

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        const details = body.details as { missingFields?: string[] } | undefined;
        const message =
          body.error === "COMPANY_PROFILE_INCOMPLETE"
            ? "Complete company name, email, and phone in Company Profile before paying."
            : body.error === "PAYMENT_IN_PROGRESS"
              ? "A payment is already in progress for another plan. Complete or close that checkout first."
              : body.error === "PLAN_ALREADY_ACTIVE"
                ? "This plan is already active."
                : body.error === "PAID_PLAN_ACTIVE"
                  ? "Your current paid plan is still active."
                  : body.error || "CHECKOUT_FAILED";

        if (details?.missingFields?.length) {
          throw new Error(message + " Missing: " + details.missingFields.join(", "));
        }

        throw new Error(message);
      }

      const checkoutData = body.data as {
        keyId: string;
        amount: number;
        currency: string;
        orderId: string;
        merchant?: { name?: string };
        planName?: string;
        customer?: { name?: string; email?: string; phone?: string };
        pricing?: {
          baseAmount: number;
          gstAmount: number;
          gstRatePercent: number;
          totalAmount: number;
          gstInclusive: boolean;
          discountAmount?: number;
        };
      };

      await ensureRazorpayLoaded();

      if (!window.Razorpay) throw new Error("RAZORPAY_CHECKOUT_NOT_READY");

      const checkout = new window.Razorpay({
        key: checkoutData.keyId,
        amount: checkoutData.amount,
        currency: checkoutData.currency,
        name: checkoutData.merchant?.name || "Conventus",
        image: new URL("/favicon.svg", window.location.origin).toString(),
        description:
          (checkoutData.planName || displayName) +
          " · " +
          money(checkoutData.pricing?.totalAmount ?? checkoutData.amount, checkoutData.currency) +
          " total",
        order_id: checkoutData.orderId,
        prefill: {
          name: checkoutData.customer?.name,
          email: checkoutData.customer?.email,
          contact: checkoutData.customer?.phone
        },
        notes: checkoutData.pricing ? {
          "Base price": money(checkoutData.pricing.baseAmount, checkoutData.currency),
          "Discount": money(checkoutData.pricing.discountAmount ?? 0, checkoutData.currency),
          "GST": checkoutData.pricing.gstAmount > 0
            ? money(checkoutData.pricing.gstAmount, checkoutData.currency) +
              " @ " +
              checkoutData.pricing.gstRatePercent +
              "%"
            : "Not applied",
          "Total": money(checkoutData.pricing.totalAmount, checkoutData.currency)
        } : undefined,
        theme: { color: "#2563EB" },
        modal: {
          ondismiss: () => setLoading(false)
        },
        handler: async (paymentResponse: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          try {
            const verify = await fetch("/api/billing/verify", {
              method: "POST",
              headers: { "content-type": "application/json" },
              credentials: "same-origin",
              cache: "no-store",
              body: JSON.stringify(paymentResponse)
            });

            const result = await verify.json().catch(() => ({}));

            if (!verify.ok) {
              throw new Error(result.error || "PAYMENT_VERIFICATION_FAILED");
            }

            onComplete?.();

            router.push(
              ("/billing/result?paymentId=" +
                encodeURIComponent(paymentResponse.razorpay_payment_id)) as Route
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
      disabled={disabled || loading}
      className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {loading ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : mode === "pay" ? (
        <CreditCard className="size-3.5" />
      ) : isCurrent ? (
        <Check className="size-3.5" />
      ) : (
        <ArrowRight className="size-3.5" />
      )}

      {loading
        ? mode === "pay" ? "Preparing payment..." : "Opening checkout..."
        : mode === "pay"
          ? isCurrent ? "Proceed to renewal" : "Proceed to Razorpay"
          : isCurrent ? "Renew " + displayName : "Choose " + displayName}
    </button>
  );
}
