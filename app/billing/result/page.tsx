import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Building2, CheckCircle2, Download, FileText, ShieldCheck } from "lucide-react";
import InvoiceDocument from "@/components/invoice-document";
import { getMongo } from "@/lib/mongodb";
import { getSession } from "@/lib/session";
import { Company } from "@/models/company";
import { Payment } from "@/models/payment";
import { Invoice } from "@/models/invoice";
import { Subscription } from "@/models/subscription";
import { getPlan } from "@/lib/plans";
import { ensureInvoicesForCapturedPayments } from "@/lib/billing";
import { calculateInvoiceTax, invoiceTaxConfig } from "@/lib/invoicing";
import { platformLegalProfile, platformLogoUrl, PLATFORM_BRAND } from "@/lib/platform";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Payment Result · Conventus"
};

function dateLabel(value: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export default async function BillingResultPage({
  searchParams
}: {
  searchParams: Promise<{ paymentId?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login?error=signin_required");
  if (!session.companyId || !["COMPANY_OWNER", "COMPANY_ADMIN", "PLATFORM_ADMIN"].includes(session.role)) {
    redirect("/dashboard");
  }

  const { paymentId } = await searchParams;
  await getMongo();
  await ensureInvoicesForCapturedPayments(session.companyId);

  const [payment, company, subscription] = await Promise.all([
    paymentId
      ? Payment.findOne({
          providerPaymentId: paymentId.trim(),
          companyId: session.companyId,
          status: "CAPTURED",
          merchantAccount: "CONVENTUS"
        }).lean()
      : null,
    Company.findById(session.companyId).select("name logoUrl description email phone websiteUrl taxId address").lean(),
    Subscription.findOne({ companyId: session.companyId }).lean()
  ]);

  const invoice = payment
    ? await Invoice.findOne({ paymentId: payment._id }).lean()
    : null;

  const plan = getPlan(payment?.planId ?? subscription?.planId);
  const validPayment = Boolean(payment && company && invoice && plan);

  const legal = await platformLegalProfile();
  const tax = invoice?.taxSnapshot ?? (
    payment
      ? calculateInvoiceTax(
          payment.amount,
          legal.gst.ratePercent,
          legal.gst.inclusive
        )
      : null
  );

  const merchant = invoice?.merchantSnapshot ?? {
    name: legal.legalName,
    description: PLATFORM_BRAND.description,
    logoUrl: legal.logoUrl,
    websiteUrl: legal.websiteUrl,
    email: legal.email,
    phone: legal.phone,
    taxId: legal.taxId,
    gstin: legal.gstin,
    sacCode: legal.sacCode,
    address: legal.address
  };

  const invoiceData = validPayment && invoice && plan && payment ? {
    invoiceNumber: invoice.invoiceNumber,
    issuedAt: invoice.issuedAt,
    amount: invoice.amount,
    currency: invoice.currency,
    status: "PAID / CAPTURED",
    providerPaymentId: invoice.providerPaymentId,
    serviceDescription: invoice.serviceDescription,
    plan: {
      id: invoice.planId,
      name: (invoice.planSnapshot ?? plan).name,
      priceInr: (invoice.planSnapshot ?? plan).priceInr,
      maxEmployees: (invoice.planSnapshot ?? plan).maxEmployees,
      monthlyMeetingLimit: (invoice.planSnapshot ?? plan).monthlyMeetingLimit,
      maxMeetingDurationMinutes: (invoice.planSnapshot ?? plan).maxMeetingDurationMinutes,
      maxConcurrentMeetings: (invoice.planSnapshot ?? plan).maxConcurrentMeetings
    },
    currentPlanId: (() => {
      const currentTime = new Date().getTime();
      return subscription?.status === "ACTIVE" &&
        subscription.currentPeriodEnd.getTime() > currentTime
        ? subscription.planId
        : null;
    })(),
    billingPeriodStart: invoice.billingPeriodStart ?? null,
    billingPeriodEnd: invoice.billingPeriodEnd ?? null,
    merchant,
    company: invoice.companySnapshot,
    tax: tax!,
    pdfHref: `/api/billing/invoices/${invoice._id}/pdf`
  } : null;

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex min-h-18 max-w-6xl items-center justify-between gap-4 px-5 sm:px-6 lg:px-8">
          <Link href="/dashboard" className="flex items-center gap-3">
            <img
              src={legal.logoUrl}
              alt={PLATFORM_BRAND.name}
              className="size-9 rounded-xl object-contain"
              referrerPolicy="no-referrer"
            />
            <div>
              <p className="text-sm font-semibold tracking-tight">{PLATFORM_BRAND.name}</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">Billing</p>
            </div>
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-950"
          >
            <ArrowLeft className="size-3.5" />
            Workspace
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-6 lg:px-8 lg:py-12">
        {validPayment && company && payment && invoiceData ? (
          <>
            <section className="overflow-hidden rounded-[2rem] border border-emerald-200 bg-white shadow-sm">
              <div className="border-b border-emerald-100 bg-emerald-50/70 px-6 py-6 sm:px-8">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-4">
                    <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-emerald-600 text-white shadow-sm">
                      <CheckCircle2 className="size-6" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Payment successful</p>
                      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Your Conventus plan is active.</h1>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {company.name} is now subscribed to {invoiceData.plan.name}. The captured payment has been converted into the invoice below.
                      </p>
                    </div>
                  </div>
                  <a
                    href={invoiceData.pdfHref}
                    download
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    <Download className="size-3.5" />
                    Download invoice PDF
                  </a>
                </div>
              </div>

              <div className="grid gap-5 p-6 sm:grid-cols-3 sm:p-8">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Company</p>
                  <div className="mt-2 flex items-center gap-2.5">
                    <div className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-white">
                      {company.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={company.logoUrl} alt={company.name} className="size-full object-contain p-1" referrerPolicy="no-referrer" />
                      ) : (
                        <Building2 className="size-4 text-slate-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{company.name}</p>
                      <p className="truncate text-[10px] text-slate-500">{company.email || "No billing email"}</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Current plan</p>
                  <p className="mt-2 text-lg font-semibold">{invoiceData.plan.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{subscription?.status ?? "ACTIVE"} · {dateLabel(subscription?.currentPeriodEnd ?? null)}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Captured payment</p>
                  <p className="mt-2 text-sm font-semibold">₹{(payment.amount / 100).toFixed(2)}</p>
                  <p className="mt-1 truncate text-[10px] text-slate-500">{dateLabel(payment.paidAt ?? null)}</p>
                </div>
              </div>
            </section>

            <div className="mt-8">
              <InvoiceDocument invoice={invoiceData} />
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span className="inline-flex items-center gap-2"><ShieldCheck className="size-3.5 text-emerald-600" /> Payment verified and captured.</span>
              <span className="inline-flex items-center gap-2"><FileText className="size-3.5 text-blue-600" /> Invoice {invoiceData.invoiceNumber}</span>
            </div>
          </>
        ) : (
          <section className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
            <div className="mx-auto max-w-xl text-center">
              <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-amber-50 text-amber-700">
                <ShieldCheck className="size-6" />
              </div>
              <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">Payment verification</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">We could not verify this payment.</h1>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                The payment reference is missing, expired, or does not belong to this company workspace. No other company payment data is shown.
              </p>
              <Link
                href="/dashboard"
                className="mt-7 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-semibold text-white hover:bg-slate-800"
              >
                <ArrowLeft className="size-3.5" />
                Return to workspace
              </Link>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
