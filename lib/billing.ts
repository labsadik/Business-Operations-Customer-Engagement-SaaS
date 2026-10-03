import { getMongo } from "@/lib/mongodb";
import { PLANS, type PlanId } from "@/lib/plans";
import { Company } from "@/models/company";
import { Invoice } from "@/models/invoice";
import { Payment } from "@/models/payment";
import { Subscription } from "@/models/subscription";
import { Workspace } from "@/models/workspace";
import { buildInvoiceSnapshots } from "@/lib/invoicing";

export async function activatePaidPlan(paymentId: string) {
  const db = await getMongo();
  const tx = await db.startSession();

  try {
    await tx.withTransaction(async () => {
      const payment = await Payment.findById(paymentId).session(tx);
      if (!payment) throw new Error("PAYMENT_NOT_FOUND");

      const plan = PLANS[payment.planId as PlanId];
      if (!plan) throw new Error("PLAN_NOT_FOUND");

      if (payment.merchantAccount && payment.merchantAccount !== "CONVENTUS") {
        throw new Error("PAYMENT_MERCHANT_INVALID");
      }

      const company = await Company.findById(payment.companyId).session(tx).lean();
      if (!company) throw new Error("COMPANY_NOT_FOUND");

      const companyEmail = company.email?.trim().toLowerCase();
      const companyPhone = company.phone?.trim();
      if (!companyEmail || !companyPhone) {
        throw new Error("COMPANY_PROFILE_INCOMPLETE");
      }

      const invoiceDate = payment.paidAt ?? new Date();
      const providerPaymentId = payment.providerPaymentId;
      if (!providerPaymentId) throw new Error("PAYMENT_ID_MISSING");

      // A captured payment that already has an invoice has completed its
      // activation. Webhooks and browser verification can safely retry.
      if (payment.status === "CAPTURED") {
        const existingInvoice = await Invoice.exists({ paymentId: payment._id }).session(tx);
        if (existingInvoice) {
          if (!payment.activatedAt) {
            await Payment.updateOne(
              { _id: payment._id },
              { $set: { activatedAt: invoiceDate } },
              { session: tx }
            );
          }
          return;
        }
      }

      // Atomically claim the payment so only one webhook/verification request
      // can activate the subscription.
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

      if (!claimed) {
        return;
      }

      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      const invoiceNumber =
        `CONV-${invoiceDate.toISOString().slice(0, 7).replace("-", "")}-${String(payment._id).slice(-8).toUpperCase()}`;

      await Invoice.findOneAndUpdate(
        { paymentId: payment._id },
        {
          $setOnInsert: {
            companyId: payment.companyId,
            paymentId: payment._id,
            invoiceNumber,
            planId: plan.id,
            billingPeriodStart: now,
            billingPeriodEnd: periodEnd,
            providerOrderId: payment.providerOrderId,
            providerPaymentId,
            amount: payment.amount,
            currency: payment.currency,
            issuedAt: invoiceDate,
            ...buildInvoiceSnapshots({
              company: {
                name: company.name,
                email: companyEmail,
                phone: companyPhone,
                address: company.address ?? {},
                taxId: company.taxId ?? ""
              },
              plan,
              amount: payment.amount
            })
          }
        },
        { upsert: true, new: true, session: tx }
      );

      await Subscription.findOneAndUpdate(
        { companyId: payment.companyId },
        {
          $set: {
            planId: plan.id,
            status: "ACTIVE",
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            monthlyMeetingsUsed: 0
          },
          $setOnInsert: {
            companyId: payment.companyId
          }
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
