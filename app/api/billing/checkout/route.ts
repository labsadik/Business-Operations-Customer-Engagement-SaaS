import { getMongo } from "@/lib/mongodb";
import { getSession } from "@/lib/session";
import { Company } from "@/models/company";
import { Membership } from "@/models/membership";
import { Payment } from "@/models/payment";
import { PLANS, type PlanId } from "@/lib/plans";
import { createRazorpayOrder, razorpayKeyId } from "@/lib/razorpay";
import { jsonError, jsonOk } from "@/lib/http";
import { assertSameOrigin, randomToken } from "@/lib/security";
import { PLATFORM_BRAND, platformLogoUrl } from "@/lib/platform";
import { calculateInvoiceTaxFromBase, invoiceTaxConfig } from "@/lib/invoicing";
import { withRedisLock } from "@/lib/redis-lock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validEmail(value?: string) {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}

function validPhone(value?: string) {
  const normalized = value?.replace(/[^0-9+]/g, "") ?? "";
  return normalized.length >= 8 && normalized.length <= 18;
}

function checkoutResponse(input: {
  payment: {
    providerOrderId: string;
    amount: number;
    currency: string;
    baseAmount: number;
    taxAmount: number;
    taxRatePercent?: number;
    taxInclusive?: boolean;
  };
  planId: PlanId;
  planName: string;
  company: {
    name: string;
    email?: string;
    phone?: string;
  };
  logoUrl: string;
}) {
  const { payment, planId, planName, company, logoUrl } = input;

  return {
    orderId: payment.providerOrderId,
    amount: payment.amount,
    currency: payment.currency,
    keyId: razorpayKeyId(),
    planId,
    planName,
    merchant: PLATFORM_BRAND,
    logoUrl,
    pricing: {
      baseAmount: payment.baseAmount,
      gstAmount: payment.taxAmount,
      gstRatePercent: payment.taxRatePercent ?? 0,
      totalAmount: payment.amount,
      gstInclusive: payment.taxInclusive ?? false,
      discountAmount: 0
    },
    customer: {
      name: company.name,
      email: company.email,
      phone: company.phone
    }
  };
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);

    const session = await getSession();
    if (!session) return jsonError("UNAUTHENTICATED", 401);
    if (!["COMPANY_OWNER", "COMPANY_ADMIN"].includes(session.role) || !session.companyId) {
      return jsonError("FORBIDDEN", 403);
    }

    const companyId = session.companyId;

    await getMongo();

    const membership = await Membership.findOne({
      companyId: companyId,
      userId: session.userId,
      active: true,
      role: { $in: ["COMPANY_OWNER", "COMPANY_ADMIN"] }
    }).lean();
    if (!membership) return jsonError("FORBIDDEN", 403);

    const company = await Company.findById(companyId).lean();
    if (!company) return jsonError("COMPANY_NOT_FOUND", 404);

    const body = await request.json().catch(() => null) as { planId?: string } | null;
    const planId = body?.planId as PlanId | undefined;
    const plan = planId ? PLANS[planId] : undefined;
    if (!plan || !plan.requiresPayment || plan.priceInr <= 0) {
      return jsonError("PLAN_NOT_PAYABLE", 400);
    }

    const missingProfileFields: string[] = [];
    if (!company.name?.trim()) missingProfileFields.push("companyName");
    if (!validEmail(company.email)) missingProfileFields.push("companyEmail");
    if (!validPhone(company.phone)) missingProfileFields.push("companyPhone");
    if (missingProfileFields.length > 0) {
      return jsonError("COMPANY_PROFILE_INCOMPLETE", 409, { missingFields: missingProfileFields });
    }

    return await withRedisLock(
      `billing:checkout:${companyId}`,
      15_000,
      async () => {
        // The lock is deliberately per company, not per plan. This guarantees
        // that a company cannot have two payable orders open at once.
        const existingPending = await Payment.findOne({
          companyId: companyId,
          merchantAccount: "CONVENTUS",
          status: "PENDING"
        }).sort({ createdAt: -1 }).lean();

        if (existingPending) {
          if (existingPending.planId !== plan.id) {
            return jsonError("PAYMENT_IN_PROGRESS", 409, {
              planId: existingPending.planId,
              orderId: existingPending.providerOrderId
            });
          }

          const logoUrl = await platformLogoUrl();
          return jsonOk(checkoutResponse({
            payment: existingPending,
            planId: plan.id,
            planName: plan.name,
            company,
            logoUrl
          }));
        }

        const taxConfig = await invoiceTaxConfig();
        const baseAmount = Math.round(plan.priceInr * 100);
        const tax = calculateInvoiceTaxFromBase(
          baseAmount,
          taxConfig.ratePercent,
          taxConfig.inclusive,
          taxConfig.enabled
        );

        // Keep the provider receipt comfortably below Razorpay's receipt
        // length limit and avoid prefix-only collisions from a truncated
        // millisecond timestamp.
        const receipt = `conventus_${String(companyId).slice(-10)}_${Date.now().toString(36)}_${randomToken(6)}`.slice(0, 40);

        const order = await createRazorpayOrder({
          amount: tax.totalAmount,
          currency: "INR",
          receipt,
          notes: {
            merchant: PLATFORM_BRAND.name,
            companyId: companyId,
            planId: plan.id,
            baseAmount: String(tax.taxableAmount),
            gstAmount: String(tax.gstAmount),
            gstRatePercent: String(tax.ratePercent),
            companyEmail: company.email!,
            companyPhone: company.phone!
          }
        });

        let payment;
        try {
          payment = await Payment.create({
            companyId: companyId,
            planId: plan.id,
            merchantAccount: "CONVENTUS",
            checkoutKey: String(companyId),
            providerOrderId: order.id,
            amount: order.amount,
            baseAmount: tax.taxableAmount,
            taxAmount: tax.gstAmount,
            taxRatePercent: tax.ratePercent,
            taxInclusive: tax.inclusive,
            currency: order.currency,
            status: "PENDING"
          });
        } catch (error) {
          // The unique checkoutKey is the final database-level duplicate
          // protection if Redis is unavailable or a second request races it.
          const existing = await Payment.findOne({
            companyId: companyId,
            status: "PENDING"
          }).sort({ createdAt: -1 }).lean();

          if (existing) {
            const logoUrl = await platformLogoUrl();
            return jsonOk(checkoutResponse({
              payment: existing,
              planId: existing.planId as PlanId,
              planName: PLANS[existing.planId as PlanId]?.name ?? existing.planId,
              company,
              logoUrl
            }));
          }
          throw error;
        }

        const logoUrl = await platformLogoUrl();

        return jsonOk(checkoutResponse({
          payment,
          planId: plan.id,
          planName: plan.name,
          company,
          logoUrl
        }));
      }
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "CHECKOUT_FAILED";
    const status =
      code === "CSRF_ORIGIN_INVALID" ? 403 :
      code === "RESOURCE_BUSY" ? 409 :
      code === "PAYMENT_IN_PROGRESS" ? 409 :
      code.startsWith("RAZORPAY_API_") ? 502 :
      500;
    return jsonError(code, status);
  }
}
