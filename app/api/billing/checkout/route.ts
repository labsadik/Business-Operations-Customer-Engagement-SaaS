import { getMongo } from "@/lib/mongodb";
import { getSession } from "@/lib/session";
import { Company } from "@/models/company";
import { Membership } from "@/models/membership";
import { Subscription } from "@/models/subscription";
import { Payment } from "@/models/payment";
import { PLANS, type PlanId } from "@/lib/plans";
import { createRazorpayOrder, razorpayKeyId } from "@/lib/razorpay";
import { jsonError, jsonOk } from "@/lib/http";

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

  const missingProfileFields: string[] = [];
  if (!company.name?.trim()) missingProfileFields.push("companyName");
  if (!validEmail(company.email)) missingProfileFields.push("companyEmail");
  if (!validPhone(company.phone)) missingProfileFields.push("companyPhone");

  if (missingProfileFields.length > 0) {
    return jsonError("COMPANY_PROFILE_INCOMPLETE", 409, {
      missingFields: missingProfileFields
    });
  }

  const body = await request.json().catch(() => null) as { planId?: string } | null;
  const planId = body?.planId as PlanId | undefined;
  const plan = planId ? PLANS[planId] : undefined;
  if (!plan) return jsonError("PLAN_NOT_FOUND", 400);

  const current = await Subscription.findOne({ companyId: session.companyId }).lean();
  if (current?.planId === plan.id) return jsonError("PLAN_ALREADY_ACTIVE", 409);

  const receipt = ("conventus_" + session.companyId + "_" + Date.now()).slice(0, 40);
  const order = await createRazorpayOrder({
    amount: plan.priceInr * 100,
    currency: "INR",
    receipt,
    notes: {
      companyId: session.companyId,
      planId: plan.id,
      companyEmail: company.email!,
      companyPhone: company.phone!
    }
  });

  await Payment.create({
    companyId: session.companyId,
    planId: plan.id,
    providerOrderId: order.id,
    amount: order.amount,
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
    customer: {
      name: company.name,
      email: company.email,
      phone: company.phone
    }
  });
}
