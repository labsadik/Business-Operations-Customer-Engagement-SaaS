import { getMongo } from "@/lib/mongodb";
import { getSession } from "@/lib/session";
import { Company } from "@/models/company";
import { Membership } from "@/models/membership";
import { Payment } from "@/models/payment";
import { getPlanForCheckout, createEntitlementSnapshot, calculatePlanPricing } from "@/lib/plan-catalog";
import type { PlanId } from "@/lib/plans";
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
  payment: any;
  planId: string;
  planName: string;
  company: { name: string; email?: string; phone?: string };
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
      discountAmount: payment.discountAmount ?? 0,
      discountedBaseAmount: payment.baseAmount,
      gstAmount: payment.taxAmount,
      gstRatePercent: payment.taxRatePercent ?? 0,
      totalAmount: payment.amount,
      gstInclusive: payment.taxInclusive ?? false
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
    if (
      !["COMPANY_OWNER", "COMPANY_ADMIN", "PLATFORM_ADMIN"].includes(session.role) ||
      !session.companyId
    ) {
      return jsonError("FORBIDDEN", 403);
    }

    const companyId = session.companyId;
    await getMongo();

    if (session.role !== "PLATFORM_ADMIN") {
      const membership = await Membership.findOne({
        companyId,
        userId: session.userId,
        active: true,
        role: { $in: ["COMPANY_OWNER", "COMPANY_ADMIN"] }
      }).lean();
      if (!membership) return jsonError("FORBIDDEN", 403);
    }

    const company = await Company.findById(companyId).lean();
    if (!company) return jsonError("COMPANY_NOT_FOUND", 404);

    const body = await request.json().catch(() => null) as { planId?: string } | null;
    const planId = body?.planId?.trim().toLowerCase();
    if (!planId) return jsonError("PLAN_NOT_PAYABLE", 400);

    let plan;
    try {
      plan = await getPlanForCheckout(planId);
    } catch (error) {
      const code = error instanceof Error ? error.message : "PLAN_NOT_FOUND";
      const status =
        code === "PLAN_COMING_SOON" || code === "PLAN_PRIVATE" ? 409 :
        code === "PLAN_NOT_FOUND" ? 404 : 400;
      return jsonError(code, status);
    }

    const missingProfileFields: string[] = [];
    if (!company.name?.trim()) missingProfileFields.push("companyName");
    if (!validEmail(company.email)) missingProfileFields.push("companyEmail");
    if (!validPhone(company.phone)) missingProfileFields.push("companyPhone");
    if (missingProfileFields.length > 0) {
      return jsonError("COMPANY_PROFILE_INCOMPLETE", 409, {
        missingFields: missingProfileFields
      });
    }

    return await withRedisLock(
      `billing:checkout:${companyId}`,
      15_000,
      async () => {
        const existingPending = await Payment.findOne({
          companyId,
          merchantAccount: "CONVENTUS",
          status: "PENDING"
        }).sort({ createdAt: -1 });

        if (existingPending) {
          if (
            existingPending.planId !== plan.id ||
            existingPending.planRevision !== plan.revision
          ) {
            existingPending.status = "FAILED";
            existingPending.failureReason = "PLAN_CONFIGURATION_CHANGED";
            existingPending.checkoutKey = undefined;
            await existingPending.save();
          } else {
            const logoUrl = await platformLogoUrl();
            return jsonOk(
              checkoutResponse({
                payment: existingPending,
                planId: plan.id,
                planName: plan.name,
                company,
                logoUrl
              })
            );
          }
        }

        const pricing = calculatePlanPricing(
          plan.priceInr,
          plan.discountType,
          plan.discountValue
        );
        const taxConfig = await invoiceTaxConfig();
        const tax = calculateInvoiceTaxFromBase(
          pricing.discountedAmountMinor,
          taxConfig.ratePercent,
          taxConfig.inclusive,
          taxConfig.enabled
        );

        const receipt = `conventus_${String(companyId).slice(-10)}_${Date.now().toString(36)}_${randomToken(6)}`.slice(0, 40);

        const order = await createRazorpayOrder({
          amount: tax.totalAmount,
          currency: "INR",
          receipt,
          notes: {
            merchant: PLATFORM_BRAND.name,
            companyId,
            planId: plan.id,
            planRevision: String(plan.revision),
            baseAmount: String(pricing.baseAmountMinor),
            discountAmount: String(pricing.discountAmountMinor),
            discountedBaseAmount: String(pricing.discountedAmountMinor),
            gstAmount: String(tax.gstAmount),
            gstRatePercent: String(tax.ratePercent),
            companyEmail: company.email!,
            companyPhone: company.phone!
          }
        });

        let payment;
        try {
          payment = await Payment.create({
            companyId,
            planId: plan.id as PlanId,
            merchantAccount: "CONVENTUS",
            checkoutKey: String(companyId),
            providerOrderId: order.id,
            planRevision: plan.revision,
            checkoutPlanSnapshot: createEntitlementSnapshot(plan),
            discountType: plan.discountType,
            discountValue: plan.discountValue,
            discountAmount: pricing.discountAmountMinor,
            amount: order.amount,
            baseAmount: tax.taxableAmount,
            taxAmount: tax.gstAmount,
            taxRatePercent: tax.ratePercent,
            taxInclusive: tax.inclusive,
            currency: order.currency,
            status: "PENDING"
          });
        } catch (error) {
          const existing = await Payment.findOne({
            companyId,
            status: "PENDING"
          }).sort({ createdAt: -1 }).lean();

          if (existing) {
            const logoUrl = await platformLogoUrl();
            return jsonOk(
              checkoutResponse({
                payment: existing,
                planId: existing.planId,
                planName: existing.checkoutPlanSnapshot?.name ?? plan.name,
                company,
                logoUrl
              })
            );
          }
          throw error;
        }

        const logoUrl = await platformLogoUrl();
        return jsonOk(
          checkoutResponse({
            payment,
            planId: plan.id,
            planName: plan.name,
            company,
            logoUrl
          })
        );
      }
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "CHECKOUT_FAILED";
    const status =
      code === "CSRF_ORIGIN_INVALID" ? 403 :
      code === "RESOURCE_BUSY" || code === "PAYMENT_IN_PROGRESS" ? 409 :
      code.startsWith("RAZORPAY_API_") ? 502 :
      500;
    return jsonError(code, status);
  }
}
