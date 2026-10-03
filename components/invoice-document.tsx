import { Download, ExternalLink, FileText, ShieldCheck } from "lucide-react";

export type InvoiceDocumentData = {
  invoiceNumber: string;
  issuedAt: Date | string;
  amount: number;
  currency: string;
  status: "PAID" | "CAPTURED" | "FREE" | "ADMIN_GRANTED" | string;
  source: "PAID" | "FREE" | "ADMIN_GRANTED";
  providerPaymentId: string;
  serviceDescription: string;
  plan: {
    id: string;
    name: string;
    priceInr: number;
    maxEmployees: number;
    monthlyMeetingLimit: number;
    maxMeetingDurationMinutes: number;
    maxConcurrentMeetings: number;
    validityDays?: number;
    freeFeatureDays?: number | null;
  };
  currentPlanId?: string | null;
  billingPeriodStart?: Date | string | null;
  billingPeriodEnd?: Date | string | null;
  merchant: {
    name: string;
    description: string;
    logoUrl: string;
    websiteUrl: string;
    email: string;
    phone: string;
    taxId: string;
    gstin: string;
    sacCode: string;
    address: {
      line1: string;
      line2: string;
      city: string;
      state: string;
      postalCode: string;
      country: string;
    };
  };
  company: {
    name: string;
    email: string;
    phone: string;
    taxId: string;
    address: {
      line1: string;
      line2: string;
      city: string;
      state: string;
      postalCode: string;
      country: string;
    };
  };
  tax: {
    enabled: boolean;
    ratePercent: number;
    inclusive: boolean;
    taxableAmount: number;
    gstAmount: number;
  };
  pdfHref: string;
};

function dateLabel(value: Date | string | null | undefined, withTime = false) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", withTime
    ? { dateStyle: "medium", timeStyle: "short" }
    : { dateStyle: "medium" }
  ).format(new Date(value));
}

function money(minor: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(minor / 100);
}

function addressLines(address: InvoiceDocumentData["merchant"]["address"]) {
  return [address.line1, address.line2, address.city, address.state, address.postalCode, address.country]
    .filter(Boolean);
}

function valueOrDash(value: string) {
  return value.trim() || "—";
}

export default function InvoiceDocument({ invoice }: { invoice: InvoiceDocumentData }) {
  const subtotal = invoice.tax.taxableAmount;
  const gst = invoice.tax.gstAmount;
  const total = invoice.amount;
  const isCurrent = Boolean(invoice.currentPlanId && invoice.currentPlanId === invoice.plan.id);
  const isPaid = invoice.source === "PAID";
  const accessLabel = isPaid ? "PAID" : invoice.source === "ADMIN_GRANTED" ? "ADMIN GRANTED" : "FREE";
  const merchantAddress = addressLines(invoice.merchant.address);
  const companyAddress = addressLines(invoice.company.address);

  return (
    <div className="mx-auto max-w-[900px]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
          <FileText className="size-4 text-blue-600" />
          {invoice.tax.enabled ? "Tax invoice" : "Invoice"}
        </div>
        <div className="flex items-center gap-2">
          <a
            href={invoice.pdfHref}
            download
            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-slate-800"
          >
            <Download className="size-3.5" />
            Download PDF
          </a>
        </div>
      </div>

      <article className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm print:rounded-none print:border-0 print:shadow-none">
        <div className="h-1.5 bg-blue-600" />

        <div className="p-7 sm:p-10">
          <header className="flex flex-col gap-7 border-b border-slate-200 pb-7 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/favicon.svg"
                alt={invoice.merchant.name}
                className="size-14 shrink-0 rounded-2xl border border-slate-200 bg-slate-50 object-contain p-2"
                referrerPolicy="no-referrer"
              />
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">From</p>
                <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">{invoice.merchant.name}</h1>
                <p className="mt-1 max-w-lg text-xs leading-5 text-slate-500">{invoice.merchant.description}</p>
                <div className="mt-3 space-y-1 text-[11px] leading-4 text-slate-500">
                  {merchantAddress.map((line) => <p key={line}>{line}</p>)}
                  {invoice.merchant.email && <p>{invoice.merchant.email}</p>}
                  {invoice.merchant.phone && <p>{invoice.merchant.phone}</p>}
                  {invoice.merchant.websiteUrl && <p>{invoice.merchant.websiteUrl}</p>}
                  {invoice.merchant.gstin && <p>GSTIN: {invoice.merchant.gstin}</p>}
                  {invoice.merchant.taxId && invoice.merchant.taxId !== invoice.merchant.gstin && <p>Tax ID: {invoice.merchant.taxId}</p>}
                  {invoice.merchant.sacCode && <p>SAC: {invoice.merchant.sacCode}</p>}
                </div>
              </div>
            </div>

            <div className="min-w-[220px] text-left sm:text-right">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{invoice.tax.enabled ? "Tax invoice" : "Invoice"}</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{invoice.invoiceNumber}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2 sm:justify-end">
                <span className={`rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] ${
                  isPaid ? "bg-emerald-50 text-emerald-700" :
                  invoice.source === "ADMIN_GRANTED" ? "bg-violet-50 text-violet-700" :
                  "bg-slate-100 text-slate-700"
                }`}>{accessLabel}</span>
                {isCurrent && <span className="rounded-full bg-blue-50 px-3 py-1.5 text-[10px] font-semibold text-blue-700">Current plan</span>}
              </div>
              <div className="mt-3 space-y-1.5 text-[11px] text-slate-500">
                <p>Issue date <span className="font-semibold text-slate-800">{dateLabel(invoice.issuedAt)}</span></p>
                <p>Status <span className="font-semibold text-slate-800">{invoice.status}</span></p>
              </div>
            </div>
          </header>

          <section className="mt-7 grid gap-5 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">Bill to</p>
              <h2 className="mt-2 text-base font-semibold text-slate-950">{invoice.company.name}</h2>
              <div className="mt-2 space-y-1 text-xs leading-5 text-slate-600">
                {companyAddress.map((line) => <p key={line}>{line}</p>)}
                <p>{invoice.company.email}</p>
                <p>{invoice.company.phone}</p>
                {invoice.company.taxId && <p>Tax ID / GSTIN: {invoice.company.taxId}</p>}
              </div>
            </div>

            <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-blue-600">Subscription</p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-slate-950">{invoice.plan.name}</h2>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-600">{invoice.serviceDescription}</p>
              <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                <span>List price: {money(Math.round(invoice.plan.priceInr * 100), invoice.currency)} {invoice.tax.inclusive ? "incl. GST" : "before GST"}</span>
                <span>{invoice.plan.maxEmployees} employees</span>
                <span>{invoice.plan.monthlyMeetingLimit} meetings / month</span>
                <span>{invoice.plan.maxMeetingDurationMinutes} min max</span>
                <span>{invoice.plan.maxConcurrentMeetings} concurrent</span>
                <span>{invoice.plan.validityDays ?? 30} days validity</span>
                {invoice.plan.freeFeatureDays ? <span>{invoice.plan.freeFeatureDays} active feature days</span> : null}
              </div>
              {(invoice.billingPeriodStart || invoice.billingPeriodEnd) && (
                <p className="mt-4 text-[11px] font-medium text-slate-600">
                  Service period: {dateLabel(invoice.billingPeriodStart)} – {dateLabel(invoice.billingPeriodEnd)}
                </p>
              )}
            </div>
          </section>

          <section className="mt-7 overflow-hidden rounded-2xl border border-slate-200">
            <div className="grid grid-cols-[1fr_auto] border-b border-slate-200 bg-slate-50 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 sm:px-5">
              <span>Description</span>
              <span>Amount</span>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-4 px-4 py-5 text-sm sm:px-5">
              <div>
                <p className="font-semibold text-slate-900">{invoice.serviceDescription}</p>
                <p className="mt-1 text-xs text-slate-500">One month subscription · {invoice.plan.name}</p>
              </div>
              <p className="font-semibold text-slate-900">{money(subtotal, invoice.currency)}</p>
            </div>
          </section>

          <section className="mt-7 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-md space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Payment reference</p>
              <p className="break-all text-xs font-semibold text-slate-700">
                {isPaid ? valueOrDash(invoice.providerPaymentId) : invoice.source === "ADMIN_GRANTED" ? "Access granted by platform administrator" : "Free plan access"}
              </p>
              <p className="text-[11px] leading-5 text-slate-500">
                {isPaid
                  ? `Payment was captured through the Conventus payment account. Displayed subscription price is ${invoice.tax.inclusive ? "GST inclusive" : "before GST"}.`
                  : "This invoice confirms active subscription access. No customer payment was required."}
              </p>
            </div>

            <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between gap-4 text-xs">
                <span className="text-slate-500">Taxable value</span>
                <span className="font-semibold text-slate-900">{money(subtotal, invoice.currency)}</span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-4 text-xs">
                <span className="text-slate-500">
                  {invoice.tax.enabled ? `GST @ ${invoice.tax.ratePercent.toFixed(2)}%${invoice.tax.inclusive ? " (included)" : ""}` : "GST"}
                </span>
                <span className="font-semibold text-slate-900">{money(gst, invoice.currency)}</span>
              </div>
              <div className="mt-4 flex items-end justify-between gap-4 border-t border-slate-200 pt-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Total paid</p>
                  <p className="mt-1 text-xl font-semibold tracking-tight text-slate-950">{money(total, invoice.currency)}</p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
                  <ShieldCheck className="size-3.5" />
                  Paid
                </span>
              </div>
            </div>
          </section>

          <footer className="mt-8 border-t border-slate-200 pt-5">
            <div className="flex flex-col gap-3 text-[10px] leading-4 text-slate-400 sm:flex-row sm:items-center sm:justify-between">
              <p>Generated electronically by {invoice.merchant.name}.</p>
              {invoice.merchant.websiteUrl && (
                <a href={invoice.merchant.websiteUrl} className="inline-flex items-center gap-1.5 font-semibold text-slate-500 print:no-underline">
                  {invoice.merchant.websiteUrl}
                  <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          </footer>
        </div>
      </article>
    </div>
  );
}
