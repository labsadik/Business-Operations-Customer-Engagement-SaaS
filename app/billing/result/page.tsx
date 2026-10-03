import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  FileText,
  ShieldCheck
} from "lucide-react";
import { getMongo } from "@/lib/mongodb";
import { getSession } from "@/lib/session";
import { Company } from "@/models/company";
import { Payment } from "@/models/payment";
import { Invoice } from "@/models/invoice";
import { Subscription } from "@/models/subscription";
import { getPlan } from "@/lib/plans";
import { PLATFORM_BRAND, platformLogoUrl } from "@/lib/platform";

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

function money(minor: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(minor / 100);
}

export default async function BillingResultPage({
  searchParams
}: {
  searchParams: Promise<{ paymentId?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login?error=signin_required");
  if (!session.companyId || !["COMPANY_OWNER", "COMPANY_ADMIN"].includes(session.role)) {
    redirect("/dashboard");
  }

  const { paymentId } = await searchParams;
  await getMongo();

  const [payment, company, subscription] = await Promise.all([
    paymentId
      ? Payment.findOne({
          providerPaymentId: paymentId.trim(),
          companyId: session.companyId,
          status: "CAPTURED",
          merchantAccount: "CONVENTUS"
        }).lean()
      : null,
    Company.findById(session.companyId).select("name logoUrl description slug email").lean(),
    Subscription.findOne({ companyId: session.companyId }).lean()
  ]);

  const invoice = payment
    ? await Invoice.findOne({ paymentId: payment._id }).lean()
    : null;

  const plan = getPlan(payment?.planId ?? subscription?.planId);
  const platformLogo = platformLogoUrl();
  const validPayment = Boolean(payment && company);

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex min-h-18 max-w-5xl items-center justify-between gap-4 px-5 sm:px-6 lg:px-8">
          <Link href="/dashboard" className="flex items-center gap-3">
            <img
              src={platformLogo}
              alt={PLATFORM_BRAND.name}
              className="size-9 rounded-xl object-cover"
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

      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-6 lg:px-8 lg:py-12">
        {validPayment && company && payment ? (
          <>
            <section className="overflow-hidden rounded-[2rem] border border-emerald-200 bg-white shadow-sm">
              <div className="border-b border-emerald-100 bg-emerald-50/70 px-6 py-6 sm:px-8">
                <div className="flex items-start gap-4">
                  <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-emerald-600 text-white shadow-sm">
                    <CheckCircle2 className="size-6" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Payment successful</p>
                    <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Your Conventus plan is active.</h1>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                      The payment was verified by Conventus and the subscription has been applied to your company workspace.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.1fr_.9fr]">
                <section>
                  <div className="flex items-start gap-4">
                    <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                      {company.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={company.logoUrl}
                          alt={company.name}
                          className="size-full object-contain p-2"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <Building2 className="size-7 text-slate-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-600">Billed company</p>
                      <h2 className="mt-1 text-xl font-semibold tracking-tight">{company.name}</h2>
                      <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
                        {(company.description || "Your company workspace on Conventus.").slice(0, 220)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Plan</p>
                      <p className="mt-2 text-sm font-semibold">{plan?.name ?? payment.planId}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Amount</p>
                      <p className="mt-2 text-sm font-semibold">{money(payment.amount, payment.currency)}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Paid at</p>
                      <p className="mt-2 text-sm font-semibold">{dateLabel(payment.paidAt ?? null)}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Period ends</p>
                      <p className="mt-2 text-sm font-semibold">{dateLabel(subscription?.currentPeriodEnd ?? null)}</p>
                    </div>
                  </div>
                </section>

                <aside className="rounded-3xl border border-slate-200 bg-slate-950 p-6 text-white">
                  <div className="flex items-center gap-3">
                    <img
                      src={platformLogo}
                      alt={PLATFORM_BRAND.name}
                      className="size-11 rounded-xl bg-white object-contain p-1"
                      referrerPolicy="no-referrer"
                    />
                    <div>
                      <p className="text-sm font-semibold">{PLATFORM_BRAND.name}</p>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">Merchant</p>
                    </div>
                  </div>
                  <p className="mt-6 text-sm leading-6 text-white/65">{PLATFORM_BRAND.description}</p>

                  <div className="mt-6 space-y-3 border-t border-white/10 pt-5 text-xs">
                    {invoice && (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-white/45">Invoice</span>
                        <span className="font-semibold">{invoice.invoiceNumber}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-white/45">Payment</span>
                      <span className="max-w-40 truncate font-semibold">{payment.providerPaymentId ?? "Verified"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-white/45">Status</span>
                      <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-300">
                        <ShieldCheck className="size-3.5" />
                        Captured
                      </span>
                    </div>
                  </div>
                </aside>
              </div>
            </section>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-semibold text-white hover:bg-slate-800"
              >
                Back to workspace
              </Link>
              <Link
                href="/dashboard?section=billing"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <FileText className="size-3.5" />
                Open billing
              </Link>
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
