import { getMongo } from "@/lib/mongodb";
import { Invoice } from "@/models/invoice";
import { Payment } from "@/models/payment";
import { getPlan } from "@/lib/plans";
import { getSession } from "@/lib/session";
import { Membership } from "@/models/membership";
import { jsonError, jsonOk } from "@/lib/http";
import { ensureInvoicesForCapturedPayments } from "@/lib/billing";
import { getCompanySubscription } from "@/lib/plans-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("UNAUTHENTICATED", 401);
  if (!session.companyId || !["COMPANY_ADMIN", "PLATFORM_ADMIN"].includes(session.role)) {
    return jsonError("FORBIDDEN", 403);
  }

  await getMongo();

  if (session.role !== "PLATFORM_ADMIN") {
    const membership = await Membership.findOne({
      companyId: session.companyId,
      userId: session.userId,
      active: true,
      role: { $in: ["COMPANY_ADMIN"] }
    }).lean();
    if (!membership) return jsonError("FORBIDDEN", 403);
  }

  await ensureInvoicesForCapturedPayments(session.companyId);

  const [invoices, subscription] = await Promise.all([
    Invoice.find({ companyId: session.companyId })
      .sort({ issuedAt: -1 })
      .limit(50)
      .lean(),
    getCompanySubscription(session.companyId)
  ]);

  const currentPlanId = subscription?.status === "ACTIVE" &&
    subscription.currentPeriodEnd.getTime() > Date.now()
    ? subscription.planId
    : null;

  return jsonOk(invoices.map((invoice) => {
    const currentPlan = getPlan(invoice.planId);
    const planSnapshot = invoice.planSnapshot ?? (currentPlan ? {
      name: currentPlan.name,
      priceInr: currentPlan.priceInr,
      maxEmployees: currentPlan.maxEmployees,
      monthlyMeetingLimit: currentPlan.monthlyMeetingLimit,
      maxMeetingDurationMinutes: currentPlan.maxMeetingDurationMinutes,
      maxConcurrentMeetings: currentPlan.maxConcurrentMeetings,
      validityDays: currentPlan.validityDays,
      freeFeatureDays: currentPlan.freeFeatureDays
    } : {
      name: invoice.planId,
      priceInr: invoice.amount / 100,
      maxEmployees: 0,
      monthlyMeetingLimit: 0,
      maxMeetingDurationMinutes: 0,
      maxConcurrentMeetings: 0
    });

    return {
      id: String(invoice._id),
      invoiceNumber: invoice.invoiceNumber,
      planId: invoice.planId,
      planSnapshot,
      source: invoice.source ?? "PAID",
      providerOrderId: invoice.providerOrderId,
      providerPaymentId: invoice.providerPaymentId,
      amount: invoice.amount,
      currency: invoice.currency,
      issuedAt: invoice.issuedAt,
      billingPeriodStart: invoice.billingPeriodStart ?? null,
      billingPeriodEnd: invoice.billingPeriodEnd ?? null,
      serviceDescription: invoice.serviceDescription,
      taxSnapshot: invoice.taxSnapshot ?? null,
      merchantSnapshot: invoice.merchantSnapshot ?? null,
      companySnapshot: invoice.companySnapshot,
      isCurrentPlan: invoice.planId === currentPlanId
    };
  }));
}
