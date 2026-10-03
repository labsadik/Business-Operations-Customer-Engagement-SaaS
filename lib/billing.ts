import { getMongo } from "@/lib/mongodb";
import { PLANS, type PlanId } from "@/lib/plans";
import { Company } from "@/models/company";
import { Invoice } from "@/models/invoice";
import { Payment } from "@/models/payment";
import { Subscription } from "@/models/subscription";
import { Workspace } from "@/models/workspace";

export async function activatePaidPlan(paymentId: string) {
  const db = await getMongo();
  const tx = await db.startSession();

  try {
    await tx.withTransaction(async () => {
      const payment = await Payment.findById(paymentId).session(tx);
      if (!payment) throw new Error("PAYMENT_NOT_FOUND");

      const plan = PLANS[payment.planId as PlanId];
      if (!plan) throw new Error("PLAN_NOT_FOUND");

      if (payment.merchantAccount !== "CONVENTUS") {
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

      if (payment.status === "CAPTURED" && payment.activatedAt) {
        return;
      }

      if (payment.status !== "CAPTURED") {
        const claimed = await Payment.findOneAndUpdate(
          {
            _id: payment._id,
            status: "PENDING",
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
      } else {
        await Payment.updateOne(
          { _id: payment._id },
          { $set: { activatedAt: invoiceDate } },
          { session: tx }
        );
      }

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
            providerOrderId: payment.providerOrderId,
            providerPaymentId,
            amount: payment.amount,
            currency: payment.currency,
            issuedAt: invoiceDate,
            companySnapshot: {
              name: company.name,
              email: companyEmail,
              phone: companyPhone,
              address: company.address ?? {},
              taxId: company.taxId ?? ""
            }
          }
        },
        { upsert: true, new: true, session: tx }
      );

      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

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
