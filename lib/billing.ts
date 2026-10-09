import { getMongo } from "@/lib/mongodb";
import { type PlanEntitlements, type PlanId } from "@/lib/plans";
import { createEntitlementSnapshot, getManagedPlan, isValidEntitlementSnapshot } from "@/lib/plan-catalog";
import { refundRazorpayPayment } from "@/lib/razorpay";
import { Company } from "@/models/company";
import { Invoice } from "@/models/invoice";
import { Payment } from "@/models/payment";
import { Subscription } from "@/models/subscription";
import { Workspace } from "@/models/workspace";
import { buildInvoiceSnapshots, type InvoiceTaxSnapshot } from "@/lib/invoicing";
import { getCompanyEntitlements, reconcileLatestPaidAccess } from "@/lib/plans-server";

function addValidityDays(from: Date, days: number) {
  const result = new Date(from);
  result.setDate(result.getDate() + days);
  return result;
}

function monthKey(date: Date) {
  return date.toISOString().slice(0, 7).replace("-", "");
}

function invoiceSourceLabel(source: "FREE" | "ADMIN_GRANTED") {
  return source === "FREE" ? "FREE" : "ADMIN";
}

async function createOrUpdateAccessInvoice({
  company,
  subscription,
  plan,
  source,
  grantedByUserId
}: {
  company: {
    _id: unknown;
    name: string;
    email?: string;
    phone?: string;
    address?: {
      line1?: string;
      line2?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      country?: string;
    };
    taxId?: string;
  };
  subscription: {
    _id: unknown;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
  };
  plan: PlanEntitlements;
  source: "FREE" | "ADMIN_GRANTED";
  grantedByUserId?: string;
}) {
  const periodStart = subscription.currentPeriodStart;
  const periodEnd = subscription.currentPeriodEnd;
  const invoiceNumber = `CONV-${invoiceSourceLabel(source)}-${monthKey(periodStart)}-${String(company._id).slice(-8).toUpperCase()}-${source === "ADMIN_GRANTED" ? plan.id.toUpperCase() : "FREE"}`;
  const taxSnapshot: InvoiceTaxSnapshot = {
    enabled: false,
    ratePercent: 0,
    inclusive: false,
    taxableAmount: 0,
    gstAmount: 0
  };

  const snapshots = await buildInvoiceSnapshots({
    company: {
      name: company.name,
      email: company.email ?? "",
      phone: company.phone ?? "",
      address: company.address ?? {},
      taxId: company.taxId ?? ""
    },
    plan,
    amount: 0,
    taxSnapshot
  });

  return Invoice.findOneAndUpdate(
    {
      companyId: company._id,
      source,
      billingPeriodStart: periodStart
    },
    {
      $setOnInsert: {
        companyId: company._id,
        invoiceNumber,
        planId: plan.id,
        providerOrderId: "",
        providerPaymentId: "",
        amount: 0,
        currency: "INR",
        issuedAt: periodStart,
        billingPeriodStart: periodStart,
        billingPeriodEnd: periodEnd,
        source,
        ...snapshots
      },
      ...(grantedByUserId ? { $set: { "companySnapshot.name": company.name } } : {})
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );
}

/**
 * Marks one verified provider payment as captured and atomically creates its
 * invoice and grants the corresponding plan period.
 *
 * This function is intentionally idempotent: Razorpay's browser callback and
 * webhook can both call it, and only the first successful transaction claims
 * the payment while the other call becomes a no-op/repair.
 */
export async function activatePaidPlan(paymentId: string) {
  const db = await getMongo();
  const tx = await db.startSession();
  let paymentForRefund: string | null = null;

  try {
    await tx.withTransaction(async () => {
      const payment = await Payment.findById(paymentId).session(tx);
      if (!payment) throw new Error("PAYMENT_NOT_FOUND");

      if (payment.status === "REFUNDED") throw new Error("PAYMENT_REFUNDED");

      const catalogPlan = await getManagedPlan(payment.planId, { includeArchived: true });
      const checkoutSnapshot = isValidEntitlementSnapshot(payment.checkoutPlanSnapshot)
        ? createEntitlementSnapshot(payment.checkoutPlanSnapshot)
        : null;
      const plan: PlanEntitlements | null = checkoutSnapshot ?? catalogPlan;
      if (!plan || !plan.requiresPayment) throw new Error("PLAN_NOT_FOUND");

      // A new checkout is tied to the exact catalog revision used to price it.
      // If status or checkout-critical configuration changed before capture,
      // do not grant the payment. The caller will refund the captured payment.
      if (
        payment.planRevision != null &&
        (!catalogPlan ||
          catalogPlan.archivedAt ||
          catalogPlan.status !== "PUBLIC" ||
          catalogPlan.revision !== payment.planRevision)
      ) {
        paymentForRefund = payment.providerPaymentId?.trim() || null;
        throw new Error("PLAN_CONFIGURATION_CHANGED");
      }

      if (payment.merchantAccount && payment.merchantAccount !== "CONVENTUS") {
        throw new Error("PAYMENT_MERCHANT_INVALID");
      }

      const providerPaymentId = payment.providerPaymentId?.trim();
      if (!providerPaymentId) throw new Error("PAYMENT_ID_MISSING");

      const company = await Company.findById(payment.companyId).session(tx).lean();
      if (!company) throw new Error("COMPANY_NOT_FOUND");

      const companyEmail = company.email?.trim().toLowerCase();
      const companyPhone = company.phone?.trim();
      if (!companyEmail || !companyPhone) {
        throw new Error("COMPANY_PROFILE_INCOMPLETE");
      }

      const now = new Date();

      let captured = payment;

      if (payment.status !== "CAPTURED") {
        const claimed = await Payment.findOneAndUpdate(
          {
            _id: payment._id,
            status: { $in: ["PENDING", "FAILED"] },
            providerPaymentId
          },
          {
            $set: {
              status: "CAPTURED",
              paidAt: payment.paidAt ?? now,
              activatedAt: payment.activatedAt ?? now
            },
            $unset: {
              checkoutKey: "",
              failureReason: "",
              failurePaymentId: ""
            }
          },
          { returnDocument: "after", session: tx }
        );

        if (!claimed) {
          const latest = await Payment.findById(payment._id).session(tx);
          if (!latest || latest.status !== "CAPTURED") return;
          if (latest.providerPaymentId !== providerPaymentId) {
            throw new Error("PAYMENT_PROVIDER_ID_CONFLICT");
          }
          captured = latest;
        } else {
          captured = claimed;
        }
      }

      const existingInvoice = await Invoice.findOne({
        paymentId: captured._id
      }).session(tx).lean();

      const currentSubscription = await Subscription.findOne({
        companyId: captured.companyId
      }).session(tx).lean();

      const invoiceDate = captured.paidAt ?? now;

      let periodStart: Date;
      let periodEnd: Date;

      if (existingInvoice?.billingPeriodStart && existingInvoice.billingPeriodEnd) {
        periodStart = new Date(existingInvoice.billingPeriodStart);
        periodEnd = new Date(existingInvoice.billingPeriodEnd);
      } else {
        const currentIsActivePaid =
          Boolean(
            currentSubscription &&
            currentSubscription.status === "ACTIVE" &&
            currentSubscription.source === "PAID" &&
            currentSubscription.currentPeriodEnd.getTime() > now.getTime()
          );

        // Same-plan renewal is appended to the current paid period so time is
        // never lost and the two paid periods cannot overlap.
        periodStart =
          currentIsActivePaid && currentSubscription?.planId === plan.id
            ? new Date(currentSubscription.currentPeriodEnd)
            : invoiceDate;

        periodEnd = addValidityDays(periodStart, plan.validityDays);
      }

      const currentStart = currentSubscription?.currentPeriodStart?.getTime() ?? 0;
      const currentEnd = currentSubscription?.currentPeriodEnd?.getTime() ?? 0;
      const shouldApplySubscription =
        !currentSubscription ||
        currentSubscription.status !== "ACTIVE" ||
        currentEnd <= now.getTime() ||
        currentSubscription.source === "FREE" ||
        (
          currentSubscription.source === "PAID" &&
          (
            periodStart.getTime() >= currentStart &&
            (
              currentSubscription.planId !== plan.id ||
              periodEnd.getTime() > currentEnd
            )
          )
        ) ||
        (
          currentSubscription.source === "ADMIN_GRANTED" &&
          periodStart.getTime() > currentStart
        );

      if (shouldApplySubscription) {
        await Subscription.findOneAndUpdate(
          { companyId: captured.companyId },
          {
            $set: {
              planId: plan.id,
              entitlementSnapshot: createEntitlementSnapshot(plan),
              source: "PAID",
              status: "ACTIVE",
              currentPeriodStart: periodStart,
              currentPeriodEnd: periodEnd,
              monthlyMeetingsUsed: 0,
              freeUsageDates: [],
              grantedByUserId: undefined,
              grantedAt: undefined
            },
            $setOnInsert: { companyId: captured.companyId }
          },
          { upsert: true, returnDocument: "after", session: tx }
        );

        await Workspace.updateOne(
          { companyId: captured.companyId },
          { $set: { planId: plan.id } },
          { session: tx }
        );
      }

      const taxSnapshot: InvoiceTaxSnapshot = {
        enabled: (captured.taxRatePercent ?? 0) > 0,
        ratePercent: captured.taxRatePercent ?? 0,
        inclusive: captured.taxInclusive ?? false,
        taxableAmount: captured.baseAmount,
        gstAmount: captured.taxAmount ?? 0
      };

      const snapshots = await buildInvoiceSnapshots({
        company: {
          name: company.name,
          email: companyEmail,
          phone: companyPhone,
          address: company.address ?? {},
          taxId: company.taxId ?? ""
        },
        plan,
        amount: captured.amount,
        taxSnapshot,
        discount: {
          type: captured.discountType ?? "NONE",
          value: captured.discountValue ?? 0,
          amountMinor: captured.discountAmount ?? 0
        }
      });

      const invoiceNumber =
        existingInvoice?.invoiceNumber ??
        `CONV-PAID-${monthKey(invoiceDate)}-${String(captured._id).slice(-8).toUpperCase()}`;

      await Invoice.findOneAndUpdate(
        { paymentId: captured._id },
        {
          $setOnInsert: {
            companyId: captured.companyId,
            paymentId: captured._id,
            source: "PAID",
            invoiceNumber,
            planId: plan.id,
            billingPeriodStart: periodStart,
            billingPeriodEnd: periodEnd,
            providerOrderId: captured.providerOrderId,
            providerPaymentId,
            amount: captured.amount,
            currency: captured.currency,
            issuedAt: invoiceDate,
            ...snapshots
          }
        },
        { upsert: true, returnDocument: "after", session: tx }
      );

      if (captured.activatedAt == null || captured.checkoutKey) {
        await Payment.updateOne(
          { _id: captured._id },
          {
            $set: {
              status: "CAPTURED",
              activatedAt: captured.activatedAt ?? now,
              paidAt: captured.paidAt ?? invoiceDate
            },
            $unset: {
              checkoutKey: "",
              failureReason: "",
              failurePaymentId: ""
            }
          },
          { session: tx }
        );
      }
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PAYMENT_ACTIVATION_FAILED";
    if (paymentForRefund && code === "PLAN_CONFIGURATION_CHANGED") {
      try {
        await refundRazorpayPayment(paymentForRefund);
        await Payment.updateOne(
          { _id: paymentId, status: { $in: ["PENDING", "CAPTURED"] } },
          {
            $set: { status: "REFUNDED", failureReason: code },
            $unset: { checkoutKey: "" }
          }
        );
      } catch {
        // Keep the payment unactivated so the provider webhook can retry the
        // refund path. Never mark a payment refunded before the provider does.
      }
    }
    throw error;
  } finally {
    await tx.endSession();
  }
}

export async function grantCompanyPlan(
  companyId: string,
  planId: PlanId,
  adminUserId: string
) {
  const plan = await getManagedPlan(planId, { includeArchived: true });
  if (!plan) throw new Error("PLAN_NOT_FOUND");
  if (plan.archivedAt) throw new Error("PLAN_ARCHIVED");

  await getMongo();
  const company = await Company.findById(companyId).lean();
  if (!company) throw new Error("COMPANY_NOT_FOUND");

  const now = new Date();
  const periodEnd = addValidityDays(now, plan.validityDays);

  const subscription = await Subscription.findOneAndUpdate(
    { companyId },
    {
      $set: {
        planId,
        entitlementSnapshot: createEntitlementSnapshot(plan),
        source: "ADMIN_GRANTED",
        status: "ACTIVE",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        monthlyMeetingsUsed: 0,
        freeUsageDates: [],
        grantedByUserId: adminUserId,
        grantedAt: now
      },
      $setOnInsert: { companyId }
    },
    { upsert: true, returnDocument: "after" }
  ).lean();

  await Workspace.updateOne({ companyId }, { $set: { planId } });

  if (!subscription) throw new Error("SUBSCRIPTION_GRANT_FAILED");

  await createOrUpdateAccessInvoice({
    company,
    subscription,
    plan,
    source: "ADMIN_GRANTED",
    grantedByUserId: adminUserId
  });

  return subscription;
}

export async function ensureCurrentAccessInvoice(companyId: string) {
  await getMongo();
  const [company, subscription] = await Promise.all([
    Company.findById(companyId).lean(),
    Subscription.findOne({ companyId }).lean()
  ]);

  if (!company || !subscription) return null;

  const plan = await getCompanyEntitlements(companyId);
  if (!["FREE", "ADMIN_GRANTED"].includes(subscription.source)) return null;

  return createOrUpdateAccessInvoice({
    company,
    subscription,
    plan,
    source: subscription.source as "FREE" | "ADMIN_GRANTED",
    grantedByUserId: subscription.grantedByUserId ? String(subscription.grantedByUserId) : undefined
  });
}

export async function ensureInvoicesForCapturedPayments(companyId: string) {
  await getMongo();

  const company = await Company.findById(companyId).lean();
  if (!company) throw new Error("COMPANY_NOT_FOUND");

  const payments = await Payment.find({
    companyId,
    status: "CAPTURED",
    providerPaymentId: { $exists: true, $ne: "" }
  }).sort({ paidAt: -1, createdAt: -1 }).limit(100).lean();

  let createdOrUpdated = 0;

  for (const payment of payments) {
    const historicalSnapshot = isValidEntitlementSnapshot(payment.checkoutPlanSnapshot)
      ? createEntitlementSnapshot(payment.checkoutPlanSnapshot)
      : null;
    const plan = historicalSnapshot ?? await getManagedPlan(payment.planId, { includeArchived: true });
    if (!plan) continue;

    const issuedAt = payment.paidAt ?? payment.createdAt ?? new Date();
    const existing = await Invoice.findOne({ paymentId: payment._id }).lean();

    // Issued invoices are immutable. Missing historical invoices may be created,
    // but an existing invoice is never rewritten after a plan catalog edit.
    if (existing) continue;

    const billingPeriodStart = existing?.billingPeriodStart ?? issuedAt;
    const billingPeriodEnd =
      existing?.billingPeriodEnd ??
      addValidityDays(billingPeriodStart, plan.validityDays);

    const taxSnapshot: InvoiceTaxSnapshot = {
      enabled: (payment.taxRatePercent ?? 0) > 0,
      ratePercent: payment.taxRatePercent ?? 0,
      inclusive: payment.taxInclusive ?? false,
      taxableAmount: payment.baseAmount ?? payment.amount,
      gstAmount: payment.taxAmount ?? 0
    };

    const snapshots = await buildInvoiceSnapshots({
      company: {
        name: company.name,
        email: company.email ?? "",
        phone: company.phone ?? "",
        address: company.address ?? {},
        taxId: company.taxId ?? ""
      },
      plan,
      amount: payment.amount,
      taxSnapshot,
      discount: {
        type: payment.discountType ?? "NONE",
        value: payment.discountValue ?? 0,
        amountMinor: payment.discountAmount ?? 0
      }
    });

    const invoiceNumber =
      existing?.invoiceNumber ??
      `CONV-PAID-${monthKey(issuedAt)}-${String(payment._id).slice(-8).toUpperCase()}`;

    await Invoice.findOneAndUpdate(
      { paymentId: payment._id },
      {
        $setOnInsert: {
          companyId: payment.companyId,
          paymentId: payment._id,
          source: "PAID",
          invoiceNumber,
          planId: plan.id,
          providerOrderId: payment.providerOrderId,
          providerPaymentId: payment.providerPaymentId,
          amount: payment.amount,
          currency: payment.currency,
          issuedAt,
          billingPeriodStart,
          billingPeriodEnd,
          ...snapshots
        }
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );

    createdOrUpdated += 1;
  }

  await reconcileLatestPaidAccess(companyId);
  await ensureCurrentAccessInvoice(companyId);
  return createdOrUpdated;
}
