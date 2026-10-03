import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import InvoiceDocument from "@/components/invoice-document";
import { getMongo } from "@/lib/mongodb";
import { getSession } from "@/lib/session";
import { ensureInvoicesForCapturedPayments } from "@/lib/billing";
import { Invoice } from "@/models/invoice";
import { Subscription } from "@/models/subscription";
import { getPlan } from "@/lib/plans";
import { calculateInvoiceTax } from "@/lib/invoicing";
import { platformLegalProfile } from "@/lib/platform";

export const dynamic = "force-dynamic";
export const metadata = { title: "Invoice · Conventus" };

export default async function InvoicePage({
  params
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login?error=signin_required");
  if (!session.companyId || !["COMPANY_OWNER", "COMPANY_ADMIN", "PLATFORM_ADMIN"].includes(session.role)) {
    redirect("/dashboard");
  }

  const { invoiceId } = await params;
  await getMongo();
  await ensureInvoicesForCapturedPayments(session.companyId);

  const [invoice, subscription] = await Promise.all([
    Invoice.findOne({ _id: invoiceId, companyId: session.companyId }).lean(),
    Subscription.findOne({ companyId: session.companyId }).lean()
  ]);

  if (!invoice) notFound();

  const fallbackPlan = getPlan(invoice.planId);
  const plan = invoice.planSnapshot ?? fallbackPlan;
  if (!plan) notFound();

  const legal = await platformLegalProfile();
  const tax = invoice.taxSnapshot ?? calculateInvoiceTax(invoice.amount, legal.gst.ratePercent, legal.gst.inclusive, legal.gst.enabled);
  const merchantSnapshot = invoice.merchantSnapshot ?? {
    name: legal.legalName,
    description: "Company scheduling infrastructure for customer meetings.",
    logoUrl: legal.logoUrl,
    websiteUrl: legal.websiteUrl,
    email: legal.email,
    phone: legal.phone,
    taxId: legal.taxId,
    gstin: legal.gstin,
    sacCode: legal.sacCode,
    address: legal.address
  };

  const currentTime = new Date().getTime();
  const currentPlanId = subscription?.status === "ACTIVE" &&
    subscription.currentPeriodEnd.getTime() > currentTime
    ? subscription.planId
    : null;

  const data = {
    invoiceNumber: invoice.invoiceNumber,
    issuedAt: invoice.issuedAt,
    amount: invoice.amount,
    currency: invoice.currency,
    status: "PAID / CAPTURED",
    providerPaymentId: invoice.providerPaymentId,
    serviceDescription: invoice.serviceDescription,
    plan: {
      id: invoice.planId,
      name: plan.name,
      priceInr: plan.priceInr,
      maxEmployees: plan.maxEmployees,
      monthlyMeetingLimit: plan.monthlyMeetingLimit,
      maxMeetingDurationMinutes: plan.maxMeetingDurationMinutes,
      maxConcurrentMeetings: plan.maxConcurrentMeetings
    },
    currentPlanId,
    billingPeriodStart: invoice.billingPeriodStart ?? null,
    billingPeriodEnd: invoice.billingPeriodEnd ?? null,
    merchant: merchantSnapshot,
    company: invoice.companySnapshot,
    tax,
    pdfHref: `/api/billing/invoices/${invoice._id}/pdf`
  };

  return (
    <main className="min-h-screen bg-[#f7f8fb] py-6 sm:py-10">
      <div className="mx-auto max-w-[980px] px-4 sm:px-6">
        <Link
          href="/dashboard"
          className="mb-5 inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-950 print:hidden"
        >
          <ArrowLeft className="size-3.5" />
          Back to workspace
        </Link>
        <InvoiceDocument invoice={data} />
      </div>
    </main>
  );
}
