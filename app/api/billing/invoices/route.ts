import { getMongo } from "@/lib/mongodb";
import { Invoice } from "@/models/invoice";
import { resolveInvoicePlanSnapshot } from "@/lib/invoice-plan-snapshot";
import { getSession } from "@/lib/session";
import { Membership } from "@/models/membership";
import { jsonError, jsonOk } from "@/lib/http";
import { ensureInvoicesForCapturedPayments } from "@/lib/billing";
import { getCompanySubscription } from "@/lib/plans-server";
import { resolveInvoiceBillingPeriod } from "@/lib/invoicing";
import { decodeListCursor, encodeListCursor, parseListLimit } from "@/lib/list-pagination";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
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

  const url = new URL(request.url);
  const paginated = url.searchParams.get("paginated") === "true";
  const limit = paginated ? parseListLimit(url.searchParams.get("limit")) : 50;
  const cursorValue = url.searchParams.get("cursor");
  const cursor = paginated ? decodeListCursor(cursorValue) : null;
  if (paginated && cursorValue && !cursor) return jsonError("INVALID_INVOICE_CURSOR", 400);
  const cursorDate = cursor ? new Date(cursor.key) : null;
  if (cursorDate && !Number.isFinite(cursorDate.getTime())) return jsonError("INVALID_INVOICE_CURSOR", 400);

  // Invoice backfill runs on the first page only; paging older invoices must not
  // repeat the reconciliation pass for every button click.
  if (!paginated || !cursor) await ensureInvoicesForCapturedPayments(session.companyId);

  const [rows, subscription] = await Promise.all([
    Invoice.find({
      companyId: session.companyId,
      ...(cursor && cursorDate ? { $or: [
        { issuedAt: { $lt: cursorDate } },
        { issuedAt: cursorDate, _id: { $lt: cursor.id } }
      ] } : {})
    })
      .sort({ issuedAt: -1, _id: -1 })
      .limit(paginated ? limit + 1 : limit)
      .lean(),
    getCompanySubscription(session.companyId)
  ]);
  const hasMore = paginated && rows.length > limit;
  const invoices = hasMore ? rows.slice(0, limit) : rows;

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

  if (!paginated) return jsonOk(response);
  const last = invoices[invoices.length - 1];
  return jsonOk({
    items: response,
    nextCursor: hasMore && last ? encodeListCursor(last.issuedAt, last._id) : null
  });
}
