import { getMongo } from "@/lib/mongodb";
import { Invoice } from "@/models/invoice";
import { resolveInvoicePlanSnapshot } from "@/lib/invoice-plan-snapshot";
import { getSession } from "@/lib/session";
import { Membership } from "@/models/membership";
import { jsonError, jsonOk } from "@/lib/http";
import { ensureInvoicesForCapturedPayments } from "@/lib/billing";
import { getCompanySubscription } from "@/lib/plans-server";
import { resolveInvoiceBillingPeriod } from "@/lib/invoicing";

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

  const response = await Promise.all(invoices.map(async (invoice) => {
    const planSnapshot = await resolveInvoicePlanSnapshot({
      companyId: invoice.companyId,
      paymentId: invoice.paymentId,
      planId: invoice.planId,
      planSnapshot: invoice.planSnapshot
    });
    const billingPeriod = resolveInvoiceBillingPeriod({
      issuedAt: invoice.issuedAt,
      billingPeriodStart: invoice.billingPeriodStart,
      billingPeriodEnd: invoice.billingPeriodEnd,
      validityDays: planSnapshot?.validityDays ?? 30
    });

    return {
      id: String(invoice._id),
      invoiceNumber: invoice.invoiceNumber,
      planId: invoice.planId,
      planSnapshot: planSnapshot ?? {
        id: invoice.planId,
        name: invoice.planId,
        priceInr: invoice.amount / 100,
        maxWorkspaces: 0,
        maxCompanies: 0,
        maxEmployees: 0,
        monthlyMeetingLimit: 0,
        maxMeetingDurationMinutes: 0,
        maxConcurrentMeetings: 0,
        taskManagementEnabled: false,
        taskManagementDailyLimit: null,
        vaultEnabled: false,
        vaultQuotaBytes: 0,
        vaultMaxFileBytes: 0,
        vaultMaxItems: 0,
        validityDays: 30,
        freeFeatureDays: null,
        requiresPayment: false
      },
      source: invoice.source ?? "PAID",
      providerOrderId: invoice.providerOrderId,
      providerPaymentId: invoice.providerPaymentId,
      amount: invoice.amount,
      currency: invoice.currency,
      issuedAt: invoice.issuedAt,
      billingPeriodStart: billingPeriod.billingPeriodStart,
      billingPeriodEnd: billingPeriod.billingPeriodEnd,
      serviceDescription: invoice.serviceDescription,
      taxSnapshot: invoice.taxSnapshot ?? null,
      merchantSnapshot: invoice.merchantSnapshot ?? null,
      companySnapshot: invoice.companySnapshot,
      isCurrentPlan: invoice.planId === currentPlanId && Boolean(
        subscription &&
        billingPeriod.billingPeriodStart.getTime() === subscription.currentPeriodStart.getTime() &&
        billingPeriod.billingPeriodEnd.getTime() === subscription.currentPeriodEnd.getTime()
      )
    };
  }));

  return jsonOk(response);
}
