
import { Download, ExternalLink, FileText, ShieldCheck } from "lucide-react";
import { getSafeWebsiteUrl, isDevelopmentOnlyUrl } from "@/lib/public-origin";

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
    maxWorkspaces: number;
    maxCompanies: number;
    taskManagementEnabled: boolean;
    taskManagementDailyLimit: number | null;
    vaultEnabled: boolean;
    vaultQuotaBytes: number;
    vaultMaxFileBytes: number;
    vaultMaxItems: number;
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

function dateLabel(value: Date | string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(value));
}

function money(minor: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(minor / 100);
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let amount = value;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }
  const formatted = amount >= 100 || index === 0 ? amount.toFixed(0) : amount >= 10 ? amount.toFixed(1) : amount.toFixed(2);
  return formatted + " " + units[index];
}

function addressLines(address: InvoiceDocumentData["merchant"]["address"]) {
  return [
    address.line1,
    address.line2,
    address.city,
    address.state,
    address.postalCode,
    address.country
  ].filter(Boolean);
}

function StatusBadge({ source }: { source: InvoiceDocumentData["source"] }) {
  const config =
    source === "PAID"
      ? {
          label: "Paid / captured",
          className: "border-emerald-200 bg-emerald-50 text-emerald-700"
        }
      : source === "ADMIN_GRANTED"
        ? {
            label: "Admin granted",
            className: "border-blue-200 bg-blue-50 text-blue-700"
          }
        : {
            label: "Free access",
            className: "border-slate-200 bg-slate-100 text-slate-700"
          };

  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] " +
        config.className
      }
    >
      {source === "PAID" ? (
        <ShieldCheck className="size-3.5" />
      ) : (
        <span className="size-1.5 rounded-full bg-current" />
      )}
      {config.label}
    </span>
  );
}

function Entitlement({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-400">{label}</p>
      <p className="mt-1 text-xs font-semibold text-slate-800">{value}</p>
    </div>
  );
}

export default function InvoiceDocument({ invoice }: { invoice: InvoiceDocumentData }) {
  const subtotal = invoice.tax.taxableAmount;
  const gst = invoice.tax.gstAmount;
  const total = invoice.amount;
  const isPaid = invoice.source === "PAID";
  const isCurrent = Boolean(
    invoice.currentPlanId && invoice.currentPlanId === invoice.plan.id
  );
  const totalLabel = isPaid ? "Total paid" : "Invoice total";
  const merchantAddress = addressLines(invoice.merchant.address);
  const companyAddress = addressLines(invoice.company.address);
  const accessStatus =
    invoice.source === "PAID"
      ? "Paid / captured"
      : invoice.source === "ADMIN_GRANTED"
        ? "Admin granted"
        : "Free access";
  const paymentValue = isPaid
    ? invoice.providerPaymentId.trim() || "-"
    : invoice.source === "ADMIN_GRANTED"
      ? "Granted by platform administrator"
      : "No customer payment required";
  const safeWebsiteUrl = getSafeWebsiteUrl(invoice.merchant.websiteUrl);
  const safeLogoUrl =
    invoice.merchant.logoUrl && !isDevelopmentOnlyUrl(invoice.merchant.logoUrl)
      ? invoice.merchant.logoUrl
      : "/favicon.svg";

  return (
    <div className="mx-auto max-w-[920px]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
          <FileText className="size-4 text-blue-600" />
          <span>{invoice.tax.enabled ? "Tax invoice" : "Invoice"}</span>
          <span className="text-slate-300">/</span>
          <span>{invoice.invoiceNumber}</span>
        </div>
        <a
          href={invoice.pdfHref}
          download
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          <Download className="size-3.5" />
          Download PDF
        </a>
      </div>

      <article className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_16px_50px_rgba(15,23,42,0.07)] print:rounded-none print:border-0 print:shadow-none">
        <div className="h-1.5 bg-blue-600 print:h-1" />

        <div className="p-6 sm:p-9 lg:p-10 print:p-0">
          <header className="grid gap-7 border-b border-slate-200 pb-8 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="min-w-0">
              <div className="flex items-start gap-4">
                <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={safeLogoUrl || "/favicon.svg"}
                    alt=""
                    className="size-full object-contain"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-600">From</p>
                  <h1 className="mt-2 break-words text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
                    {invoice.merchant.name}
                  </h1>
                  {invoice.merchant.description && (
                    <p className="mt-1 max-w-2xl break-words text-xs leading-5 text-slate-500">
                      {invoice.merchant.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-5 grid gap-x-7 gap-y-2 text-[11px] leading-4 text-slate-500 sm:grid-cols-2">
                <div className="space-y-1.5">
                  {merchantAddress.map((line, index) => (
                    <p key={"merchant-address-" + index + "-" + line} className="break-words">
                      {line}
                    </p>
                  ))}
                </div>
                <div className="space-y-1.5">
                  {invoice.merchant.email && <p className="break-all">{invoice.merchant.email}</p>}
                  {invoice.merchant.phone && <p className="break-words">{invoice.merchant.phone}</p>}
                  {invoice.merchant.websiteUrl && <p className="break-all">{invoice.merchant.websiteUrl}</p>}
                  {invoice.merchant.gstin && (
                    <p className="break-all"><span className="font-semibold text-slate-700">GSTIN:</span> {invoice.merchant.gstin}</p>
                  )}
                  {invoice.merchant.taxId && invoice.merchant.taxId !== invoice.merchant.gstin && (
                    <p className="break-all"><span className="font-semibold text-slate-700">Tax ID:</span> {invoice.merchant.taxId}</p>
                  )}
                  {invoice.merchant.sacCode && (
                    <p className="break-all"><span className="font-semibold text-slate-700">SAC:</span> {invoice.merchant.sacCode}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 lg:text-right">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                {invoice.tax.enabled ? "Tax invoice" : "Invoice"}
              </p>
              <p className="mt-2 break-all text-2xl font-semibold tracking-tight text-slate-950 sm:text-[28px]">
                {invoice.invoiceNumber}
              </p>
              <div className="mt-4 flex flex-wrap gap-2 lg:justify-end">
                <StatusBadge source={invoice.source} />
                {isCurrent && (
                  <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-blue-700">
                    Current plan
                  </span>
                )}
              </div>
              <div className="mt-4 space-y-2 text-xs lg:text-right">
                <div className="flex items-center justify-between gap-4 lg:block">
                  <span className="text-slate-500">Issue date</span>
                  <span className="font-semibold text-slate-900 lg:ml-2">{dateLabel(invoice.issuedAt)}</span>
                </div>
                <div className="flex items-center justify-between gap-4 lg:block">
                  <span className="text-slate-500">Access status</span>
                  <span className="font-semibold text-slate-900 lg:ml-2">{accessStatus}</span>
                </div>
              </div>
            </div>
          </header>

          <section className="mt-7 grid gap-5 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Bill to</p>
              <h2 className="mt-2 break-words text-base font-semibold text-slate-950">{invoice.company.name}</h2>
              <div className="mt-3 space-y-1.5 text-xs leading-5 text-slate-600">
                {companyAddress.map((line, index) => (
                  <p key={"company-address-" + index + "-" + line} className="break-words">{line}</p>
                ))}
                <p className="break-all">{invoice.company.email}</p>
                <p className="break-words">{invoice.company.phone}</p>
                {invoice.company.taxId && (
                  <p className="break-all"><span className="font-semibold text-slate-700">Tax ID / GSTIN:</span> {invoice.company.taxId}</p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-600">Subscription</p>
                  <h2 className="mt-2 break-words text-base font-semibold text-slate-950">{invoice.plan.name}</h2>
                </div>
                {isCurrent && (
                  <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-blue-700 ring-1 ring-blue-200">
                    Active now
                  </span>
                )}
              </div>
              <p className="mt-2 break-words text-xs leading-5 text-slate-600">{invoice.serviceDescription}</p>
              {(invoice.billingPeriodStart || invoice.billingPeriodEnd) && (
                <div className="mt-4 rounded-xl border border-blue-100 bg-white px-3.5 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Service period</p>
                  <p className="mt-1 text-xs font-semibold text-slate-800">
                    {dateLabel(invoice.billingPeriodStart)}
                    {invoice.billingPeriodEnd ? " - " + dateLabel(invoice.billingPeriodEnd) : ""}
                  </p>
                </div>
              )}
            </div>
          </section>

          <section className="mt-7 overflow-hidden rounded-2xl border border-slate-200">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 bg-slate-50 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 sm:px-5">
              <span>Line item</span>
              <span>Taxable value</span>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-t border-slate-200 px-4 py-5 sm:px-5">
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold text-slate-950">{invoice.serviceDescription}</p>
                <p className="mt-1 break-words text-xs leading-5 text-slate-500">{invoice.plan.name} subscription service</p>
              </div>
              <p className="whitespace-nowrap text-sm font-semibold text-slate-950">{money(subtotal, invoice.currency)}</p>
            </div>
          </section>

          <section className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                    {isPaid ? "Payment reference" : "Access reference"}
                  </p>
                  {isPaid && <ShieldCheck className="size-4 text-emerald-600" />}
                </div>
                <p className="mt-2 break-all text-sm font-semibold text-slate-800">{paymentValue}</p>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {isPaid
                    ? "Payment was captured through the AlgoQuit payment account."
                    : invoice.source === "ADMIN_GRANTED"
                      ? "This invoice records subscription access granted by a platform administrator; no customer payment was required."
                      : "This invoice records free-plan access; no customer payment was required."}
                </p>
              </div>

              <div>
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-600">Plan entitlements</p>
                    <p className="mt-1 text-xs text-slate-500">Snapshot recorded on this invoice.</p>
                  </div>
                  <span className="text-[11px] font-medium text-slate-400">{invoice.plan.name}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  <Entitlement label="Workspaces" value={String(invoice.plan.maxWorkspaces)} />
                  <Entitlement label="Companies" value={String(invoice.plan.maxCompanies)} />
                  <Entitlement label="Employees" value={String(invoice.plan.maxEmployees)} />
                  <Entitlement label="Meetings / month" value={String(invoice.plan.monthlyMeetingLimit)} />
                  <Entitlement label="Max duration" value={invoice.plan.maxMeetingDurationMinutes + " min"} />
                  <Entitlement label="Concurrent meetings" value={String(invoice.plan.maxConcurrentMeetings)} />
                  <Entitlement label="Validity" value={(invoice.plan.validityDays ?? 30) + " days"} />
                  <Entitlement label="Task management" value={invoice.plan.taskManagementEnabled ? "Included" : "Not included"} />
                  <Entitlement
                    label="Task daily limit"
                    value={!invoice.plan.taskManagementEnabled ? "—" : invoice.plan.taskManagementDailyLimit == null ? "No daily cap" : invoice.plan.taskManagementDailyLimit + " tasks / day"}
                  />
                  <Entitlement label="Cloud Vault" value={invoice.plan.vaultEnabled ? "Included" : "Not included"} />
                  <Entitlement label="Vault storage" value={invoice.plan.vaultEnabled ? formatBytes(invoice.plan.vaultQuotaBytes) : "Not included"} />
                  <Entitlement label="Max vault file" value={invoice.plan.vaultEnabled ? formatBytes(invoice.plan.vaultMaxFileBytes) : "Not included"} />
                  <Entitlement label="Vault item limit" value={invoice.plan.vaultEnabled ? invoice.plan.vaultMaxItems.toLocaleString("en-IN") : "Not included"} />
                  <Entitlement label="Free feature window" value={invoice.plan.freeFeatureDays ? invoice.plan.freeFeatureDays + " days" : "Not included"} />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-4 text-xs">
                <span className="text-slate-500">Taxable value</span>
                <span className="font-semibold text-slate-900">{money(subtotal, invoice.currency)}</span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-4 text-xs">
                <span className="max-w-[190px] text-slate-500">
                  {invoice.tax.enabled
                    ? "GST @ " + invoice.tax.ratePercent.toFixed(2) + "%" + (invoice.tax.inclusive ? " (included)" : "")
                    : "GST not applicable"}
                </span>
                <span className="font-semibold text-slate-900">{money(gst, invoice.currency)}</span>
              </div>
              <div className="mt-5 rounded-2xl bg-slate-950 p-5 text-white">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{totalLabel}</p>
                    <p className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{money(total, invoice.currency)}</p>
                  </div>
                  <StatusBadge source={invoice.source} />
                </div>
                <p className="mt-3 text-[11px] leading-5 text-slate-300">
                  {isPaid
                    ? invoice.tax.inclusive
                      ? "The displayed amount includes GST."
                      : "GST is shown separately above."
                    : "No customer payment is due for this access record."}
                </p>
              </div>
            </div>
          </section>

          <footer className="mt-8 border-t border-slate-200 pt-5">
            <div className="flex flex-col gap-3 text-[10px] leading-4 text-slate-400 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p>Generated electronically by {invoice.merchant.name}.</p>
                <p className="mt-1">This document is an electronic invoice; no physical signature is required.</p>
              </div>
              {safeWebsiteUrl && (
                <a
                  href={invoice.merchant.websiteUrl}
                  className="inline-flex max-w-full items-start gap-1.5 break-all font-semibold text-slate-500 print:no-underline"
                >
                  {safeWebsiteUrl}
                  <ExternalLink className="mt-0.5 size-3 shrink-0" />
                </a>
              )}
            </div>
          </footer>
        </div>
      </article>
    </div>
  );
}
