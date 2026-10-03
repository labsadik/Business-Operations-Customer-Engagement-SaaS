import { getMongo } from "@/lib/mongodb";
import { getSession } from "@/lib/session";
import { Company } from "@/models/company";
import { Membership } from "@/models/membership";
import { Subscription } from "@/models/subscription";
import { Payment } from "@/models/payment";
import { PLANS, type PlanId } from "@/lib/plans";
import { createRazorpayOrder, razorpayKeyId } from "@/lib/razorpay";
import { jsonError, jsonOk } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security";
import { PLATFORM_BRAND, platformLogoUrl } from "@/lib/platform";
import { calculateInvoiceTaxFromBase, invoiceTaxConfig } from "@/lib/invoicing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validEmail(value?: string) {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}

function validPhone(value?: string) {
  const normalized = value?.replace(/[^0-9+]/g, "") ?? "";
  return normalized.length >= 8 && normalized.length <= 18;
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);

    const session = await getSession();
    if (!session) return jsonError("UNAUTHENTICATED", 401);
    if (!["COMPANY_OWNER", "COMPANY_ADMIN"].includes(session.role) || !session.companyId) {
      return jsonError("FORBIDDEN", 403);
    }

    await getMongo();
    const membership = await Membership.findOne({
      companyId: session.companyId,
      userId: session.userId,
      active: true,
      role: { $in: ["COMPANY_OWNER", "COMPANY_ADMIN"] }
    }).lean();
    if (!membership) return jsonError("FORBIDDEN", 403);

    const company = await Company.findById(session.companyId).lean();
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

    const current = await Subscription.findOne({ companyId: session.companyId }).lean();
    if (
      current?.planId === plan.id &&
      current.status === "ACTIVE" &&
      current.currentPeriodEnd.getTime() > Date.now()
    ) {
      return jsonError("PLAN_ALREADY_ACTIVE", 409);
    }

    const taxConfig = await invoiceTaxConfig();
    const baseAmount = Math.round(plan.priceInr * 100);
    const tax = calculateInvoiceTaxFromBase(
      baseAmount,
      taxConfig.ratePercent,
      taxConfig.inclusive,
      taxConfig.enabled
    );

    const existingPending = await Payment.findOne({
      companyId: session.companyId,
      planId: plan.id,
      status: "PENDING",
      createdAt: { $gt: new Date(Date.now() - 10 * 60 * 1000) }
    }).sort({ createdAt: -1 }).lean();

    const logoUrl = await platformLogoUrl();

    if (existingPending) {
      return jsonOk({
        orderId: existingPending.providerOrderId,
        amount: existingPending.amount,
        currency: existingPending.currency,
        keyId: razorpayKeyId(),
        planId: plan.id,
        planName: plan.name,
        merchant: PLATFORM_BRAND,
        logoUrl,
        pricing: {
          baseAmount: existingPending.baseAmount,
          gstAmount: existingPending.taxAmount,
          gstRatePercent: existingPending.taxRatePercent,
          totalAmount: existingPending.amount,
          gstInclusive: existingPending.taxInclusive
        },
        customer: {
          name: company.name,
          email: company.email,
          phone: company.phone
        }
      });
    }

    const receipt = ("conventus_" + session.companyId + "_" + Date.now()).slice(0, 40);
    const order = await createRazorpayOrder({
      amount: tax.totalAmount,
      currency: "INR",
      receipt,
      notes: {
        merchant: PLATFORM_BRAND.name,
        companyId: session.companyId,
        planId: plan.id,
        baseAmount: String(tax.taxableAmount),
        gstAmount: String(tax.gstAmount),
        gstRatePercent: String(tax.ratePercent),
        companyEmail: company.email!,
        companyPhone: company.phone!
      }
    });

    await Payment.create({
      companyId: session.companyId,
      planId: plan.id,
      merchantAccount: "CONVENTUS",
      providerOrderId: order.id,
      amount: order.amount,
      baseAmount: tax.taxableAmount,
      taxAmount: tax.gstAmount,
      taxRatePercent: tax.ratePercent,
      taxInclusive: tax.inclusive,
      currency: order.currency,
      status: "PENDING"
    });

    return jsonOk({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: razorpayKeyId(),
      planId: plan.id,
      planName: plan.name,
      merchant: PLATFORM_BRAND,
      logoUrl,
      pricing: {
        baseAmount: tax.taxableAmount,
        gstAmount: tax.gstAmount,
        gstRatePercent: tax.ratePercent,
        totalAmount: tax.totalAmount,
        gstInclusive: tax.inclusive
      },
      customer: {
        name: company.name,
        email: company.email,
        phone: company.phone
      }
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "CHECKOUT_FAILED";
    const status =
      code === "CSRF_ORIGIN_INVALID" ? 403 :
      code.startsWith("RAZORPAY_API_") ? 502 :
      500;
    return jsonError(code, status);
  }
}
