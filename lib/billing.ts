import { getMongo } from "@/lib/mongodb";
import { PLANS, type PlanEntitlements, type PlanId } from "@/lib/plans";
import { Company } from "@/models/company";
import { Invoice } from "@/models/invoice";
import { Payment } from "@/models/payment";
import { Subscription } from "@/models/subscription";
import { Workspace } from "@/models/workspace";
import { buildInvoiceSnapshots, type InvoiceTaxSnapshot } from "@/lib/invoicing";
import { reconcileLatestPaidAccess } from "@/lib/plans-server";

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
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

export async function activatePaidPlan(paymentId: string) {
  const db = await getMongo();
  const tx = await db.startSession();

  try {
    await tx.withTransaction(async () => {
      const payment = await Payment.findById(paymentId).session(tx);
      if (!payment) throw new Error("PAYMENT_NOT_FOUND");

      const plan = PLANS[payment.planId as PlanId];
      if (!plan || !plan.requiresPayment) throw new Error("PLAN_NOT_FOUND");

      if (payment.merchantAccount && payment.merchantAccount !== "CONVENTUS") {
        throw new Error("PAYMENT_MERCHANT_INVALID");
      }

      const company = await Company.findById(payment.companyId).session(tx).lean();
      if (!company) throw new Error("COMPANY_NOT_FOUND");

      const companyEmail = company.email?.trim().toLowerCase();
      const companyPhone = company.phone?.trim();
      if (!companyEmail || !companyPhone) throw new Error("COMPANY_PROFILE_INCOMPLETE");

      const invoiceDate = payment.paidAt ?? new Date();
      const providerPaymentId = payment.providerPaymentId;
      if (!providerPaymentId) throw new Error("PAYMENT_ID_MISSING");

      if (payment.status === "CAPTURED") {
        const existingInvoice = await Invoice.exists({ paymentId: payment._id }).session(tx);

        await Subscription.findOneAndUpdate(
          { companyId: payment.companyId },
          {
            $set: {
              planId: plan.id,
              source: "PAID",
              status: "ACTIVE",
              currentPeriodStart: existingInvoice?.billingPeriodStart ?? invoiceDate,
              currentPeriodEnd:
                existingInvoice?.billingPeriodEnd ??
                addValidityDays(existingInvoice?.billingPeriodStart ?? invoiceDate, plan.validityDays),
              monthlyMeetingsUsed: 0,
              freeUsageDates: [],
              grantedByUserId: undefined,
              grantedAt: undefined
            },
            $setOnInsert: { companyId: payment.companyId }
          },
          { upsert: true, new: true, session: tx }
        );

        await Workspace.updateOne(
          { companyId: payment.companyId },
          { $set: { planId: plan.id } },
          { session: tx }
        );

        if (!payment.activatedAt) {
          await Payment.updateOne(
            { _id: payment._id },
            { $set: { activatedAt: invoiceDate } },
            { session: tx }
          );
        }

        if (existingInvoice) return;
      }

      const claimed = await Payment.findOneAndUpdate(
        {
          _id: payment._id,
          status: { $in: ["PENDING", "FAILED"] },
          $or: [{ activatedAt: null }, { activatedAt: { $exists: false } }]
        },
        {
          $set: {
            status: "CAPTURED",
            paidAt: payment.paidAt ?? invoiceDate,
            activatedAt: new Date()
          }
        },
        { new: true, session: tx }
      );

      if (!claimed) return;

      const now = new Date();
      const periodEnd = addValidityDays(now, plan.validityDays);
      const invoiceNumber = `CONV-PAID-${monthKey(invoiceDate)}-${String(payment._id).slice(-8).toUpperCase()}`;

      const taxSnapshot: InvoiceTaxSnapshot = {
        enabled: payment.taxRatePercent > 0,
        ratePercent: payment.taxRatePercent ?? 0,
        inclusive: payment.taxInclusive ?? false,
        taxableAmount: payment.baseAmount,
        gstAmount: payment.taxAmount ?? 0
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
        amount: payment.amount,
        taxSnapshot
      });

      await Invoice.findOneAndUpdate(
        { paymentId: payment._id },
        {
          $setOnInsert: {
            companyId: payment.companyId,
            paymentId: payment._id,
            source: "PAID",
            invoiceNumber,
            planId: plan.id,
            billingPeriodStart: now,
            billingPeriodEnd: periodEnd,
            providerOrderId: payment.providerOrderId,
            providerPaymentId,
            amount: payment.amount,
            currency: payment.currency,
            issuedAt: invoiceDate,
            ...snapshots
          }
        },
        { upsert: true, new: true, session: tx }
      );

      await Subscription.findOneAndUpdate(
        { companyId: payment.companyId },
        {
          $set: {
            planId: plan.id,
            source: "PAID",
            status: "ACTIVE",
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            monthlyMeetingsUsed: 0,
            freeUsageDates: [],
            grantedByUserId: undefined,
            grantedAt: undefined
          },
          $setOnInsert: { companyId: payment.companyId }
        },
        { upsert: true, new: true, session: tx }
      );

      await Workspace.updateOne(
        { companyId: payment.companyId },
        { $set: { planId: plan.id } },
        { session: tx }
      );
    });
  } finally {
    await tx.endSession();
  }
}

export async function grantCompanyPlan(
  companyId: string,
  planId: PlanId,
  adminUserId: string
) {
  const plan = PLANS[planId];
  if (!plan) throw new Error("PLAN_NOT_FOUND");

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
    { upsert: true, new: true }
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

  const plan = PLANS[subscription.planId as PlanId];
  if (!plan) return null;
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
    const plan = PLANS[payment.planId as PlanId];
    if (!plan) continue;

    const issuedAt = payment.paidAt ?? payment.createdAt ?? new Date();
    const existing = await Invoice.findOne({ paymentId: payment._id }).lean();
    const hasCompleteSnapshot = Boolean(
      existing?.merchantSnapshot?.name &&
      existing?.merchantSnapshot?.description &&
      existing?.merchantSnapshot?.logoUrl &&
      existing?.planSnapshot?.name &&
      existing?.taxSnapshot
    );

    if (existing && existing.source === "PAID" && hasCompleteSnapshot) continue;

    const billingPeriodStart = existing?.billingPeriodStart ?? issuedAt;
    const billingPeriodEnd = existing?.billingPeriodEnd ?? addValidityDays(billingPeriodStart, plan.validityDays);
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
      taxSnapshot
    });

    const invoiceNumber = existing?.invoiceNumber ?? `CONV-PAID-${monthKey(issuedAt)}-${String(payment._id).slice(-8).toUpperCase()}`;

    await Invoice.findOneAndUpdate(
      { paymentId: payment._id },
      {
        $set: {
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
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    createdOrUpdated += 1;
  }

  await reconcileLatestPaidAccess(companyId);
  await ensureCurrentAccessInvoice(companyId);
  return createdOrUpdated;
}
