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
import { calculateInvoiceTax } from "@/lib/invoicing";
import { platformLegalProfile, PLATFORM_BRAND } from "@/lib/platform";

export const dynamic = "force-dynamic";
export const metadata = { title: "Billing · Conventus" };

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
  searchParams: Promise<{ paymentId?: string; invoiceId?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login?error=signin_required");
  if (!session.companyId || !["COMPANY_OWNER", "COMPANY_ADMIN", "PLATFORM_ADMIN"].includes(session.role)) {
    redirect("/dashboard");
  }

  const { paymentId, invoiceId } = await searchParams;
  await getMongo();
  await ensureInvoicesForCapturedPayments(session.companyId);

  const [company, subscription, payment, requestedInvoice] = await Promise.all([
    Company.findById(session.companyId)
      .select("name logoUrl description email phone websiteUrl taxId address")
      .lean(),
    Subscription.findOne({ companyId: session.companyId }).lean(),
    paymentId
      ? Payment.findOne({
          providerPaymentId: paymentId.trim(),
          companyId: session.companyId,
          status: "CAPTURED",
          merchantAccount: "CONVENTUS"
        }).lean()
      : null,
    invoiceId
      ? Invoice.findOne({ _id: invoiceId, companyId: session.companyId }).lean()
      : null
  ]);

  const invoice = requestedInvoice
    ?? (payment ? await Invoice.findOne({ paymentId: payment._id }).lean() : null)
    ?? await Invoice.findOne({ companyId: session.companyId }).sort({ issuedAt: -1 }).lean();

  const plan = getPlan(invoice?.planId ?? subscription?.planId);
  const legal = await platformLegalProfile();

  const tax = invoice?.taxSnapshot ?? (
    payment
      ? calculateInvoiceTax(
          payment.amount,
          legal.gst.ratePercent,
          legal.gst.inclusive,
          legal.gst.enabled
        )
      : {
          enabled: false,
          ratePercent: 0,
          inclusive: false,
          taxableAmount: invoice?.amount ?? 0,
          gstAmount: 0
        }
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

  const currentPlanId = subscription?.status === "ACTIVE"
    ? subscription.planId
    : null;

  const invoiceData = invoice && plan ? {
    invoiceNumber: invoice.invoiceNumber,
    issuedAt: invoice.issuedAt,
    amount: invoice.amount,
    currency: invoice.currency,
    status: invoice.source === "PAID" ? "PAID / CAPTURED" : invoice.source === "ADMIN_GRANTED" ? "ADMIN GRANTED" : "FREE ACCESS",
    source: invoice.source ?? "PAID",
    providerPaymentId: invoice.providerPaymentId || "",
    serviceDescription: invoice.serviceDescription,
    plan: {
      id: invoice.planId,
      name: (invoice.planSnapshot ?? plan).name,
      priceInr: (invoice.planSnapshot ?? plan).priceInr,
      maxEmployees: (invoice.planSnapshot ?? plan).maxEmployees,
      monthlyMeetingLimit: (invoice.planSnapshot ?? plan).monthlyMeetingLimit,
      maxMeetingDurationMinutes: (invoice.planSnapshot ?? plan).maxMeetingDurationMinutes,
      maxConcurrentMeetings: (invoice.planSnapshot ?? plan).maxConcurrentMeetings,
      validityDays: (invoice.planSnapshot ?? plan).validityDays ?? plan.validityDays,
      freeFeatureDays: (invoice.planSnapshot ?? plan).freeFeatureDays ?? plan.freeFeatureDays
    },
    currentPlanId,
    billingPeriodStart: invoice.billingPeriodStart ?? null,
    billingPeriodEnd: invoice.billingPeriodEnd ?? null,
    merchant,
    company: invoice.companySnapshot,
    tax,
    pdfHref: "/api/billing/invoices/" + invoice._id + "/pdf"
  } : null;

  const source = invoice?.source ?? "PAID";
  const title = source === "PAID"
    ? "Your Conventus plan is active."
    : source === "ADMIN_GRANTED"
      ? "Your access has been activated."
      : "Your Free plan is active.";
  const message = source === "PAID"
    ? `${company?.name ?? "Your workspace"} is subscribed to ${plan?.name ?? "your selected plan"} and the captured payment is documented below.`
    : source === "ADMIN_GRANTED"
      ? `${company?.name ?? "Your workspace"} has received ${plan?.name ?? "subscription"} access from the Conventus platform administrator.`
      : `${company?.name ?? "Your workspace"} is using the Conventus Free plan. The 30-day period includes up to 14 active feature days.`;

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex min-h-18 max-w-6xl items-center justify-between gap-4 px-5 sm:px-6 lg:px-8">
          <Link href="/dashboard" className="flex items-center gap-3">
            <img
              src={merchant.logoUrl}
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
        {invoiceData ? (
          <>
            <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
              <div className={`border-b px-6 py-6 sm:px-8 ${source === "PAID" ? "border-emerald-100 bg-emerald-50/70" : source === "ADMIN_GRANTED" ? "border-violet-100 bg-violet-50/70" : "border-slate-200 bg-slate-50"}`}>
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-4">
                    <div className={`grid size-12 shrink-0 place-items-center rounded-2xl text-white shadow-sm ${source === "PAID" ? "bg-emerald-600" : source === "ADMIN_GRANTED" ? "bg-violet-600" : "bg-slate-700"}`}>
                      <CheckCircle2 className="size-6" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{source === "PAID" ? "Payment successful" : source === "ADMIN_GRANTED" ? "Access granted" : "Free subscription"}</p>
                      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
                    </div>
                  </div>
                  <a
                    href={invoiceData.pdfHref}
                    download
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    <Download className="size-3.5" />
                    Download one-page PDF
                  </a>
                </div>
              </div>

              <div className="grid gap-5 p-6 sm:grid-cols-3 sm:p-8">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Company</p>
                  <div className="mt-2 flex items-center gap-2.5">
                    <div className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-white">
                      {company?.logoUrl ? (
                        <img src={company.logoUrl} alt="" className="size-full object-contain p-1" referrerPolicy="no-referrer" />
                      ) : (
                        <Building2 className="size-4 text-slate-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{company?.name}</p>
                      <p className="truncate text-[10px] text-slate-500">{company?.email || "No billing email"}</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Current plan</p>
                  <p className="mt-2 text-lg font-semibold">{invoiceData.plan.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{subscription?.status ?? "ACTIVE"} · expires {dateLabel(subscription?.currentPeriodEnd ?? null)}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Access value</p>
                  <p className="mt-2 text-lg font-semibold">₹{(invoiceData.amount / 100).toFixed(2)}</p>
                  <p className="mt-1 text-[10px] text-slate-500">{source === "PAID" ? "Captured total including GST" : "No customer payment required"}</p>
                </div>
              </div>
            </section>

            <div className="mt-8">
              <InvoiceDocument invoice={invoiceData} />
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span className="inline-flex items-center gap-2"><ShieldCheck className="size-3.5 text-emerald-600" /> {source === "PAID" ? "Payment verified and captured." : "Subscription access is recorded in the database."}</span>
              <span className="inline-flex items-center gap-2"><FileText className="size-3.5 text-blue-600" /> Invoice {invoiceData.invoiceNumber}</span>
            </div>
          </>
        ) : (
          <section className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
            <div className="mx-auto max-w-xl text-center">
              <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-amber-50 text-amber-700">
                <ShieldCheck className="size-6" />
              </div>
              <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">Billing record</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">No invoice is available yet.</h1>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Complete a subscription activation or ask a platform administrator to grant workspace access.
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
