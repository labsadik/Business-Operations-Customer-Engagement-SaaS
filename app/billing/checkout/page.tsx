import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  FileText,
  ShieldCheck
} from "lucide-react";
import { getSession } from "@/lib/session";
import { getMongo } from "@/lib/mongodb";
import { Company } from "@/models/company";
import { Membership } from "@/models/membership";
import { getCompanySubscription } from "@/lib/plans-server";
import { PLANS, type PlanId } from "@/lib/plans";
import { calculateInvoiceTaxFromBase, invoiceTaxConfig } from "@/lib/invoicing";
import RazorpayPlanButton from "@/components/razorpay-plan-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Checkout · Conventus" };

function money(minor: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(minor / 100);
}

function dateLabel(value: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(value);
}

export default async function BillingCheckoutPage({
  searchParams
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login?error=signin_required");

  if (
    !session.companyId ||
    !["COMPANY_OWNER", "COMPANY_ADMIN"].includes(session.role)
  ) {
    redirect("/dashboard");
  }

  await getMongo();

  const membership = await Membership.findOne({
    companyId: session.companyId,
    userId: session.userId,
    active: true,
    role: { $in: ["COMPANY_OWNER", "COMPANY_ADMIN"] }
  }).lean();

  if (!membership) redirect("/dashboard");

  const { plan: rawPlanId } = await searchParams;
  const planId = rawPlanId as PlanId | undefined;
  const plan = planId ? PLANS[planId] : undefined;

  if (!plan || !plan.requiresPayment || plan.priceInr <= 0) {
    redirect("/dashboard?billing=1");
  }

  const [company, subscription, taxConfig] = await Promise.all([
    Company.findById(session.companyId)
      .select("name email phone profileComplete logoUrl")
      .lean(),
    getCompanySubscription(session.companyId),
    invoiceTaxConfig()
  ]);

  if (!company) redirect("/dashboard");

  const baseAmount = Math.round(plan.priceInr * 100);
  const tax = calculateInvoiceTaxFromBase(
    baseAmount,
    taxConfig.ratePercent,
    taxConfig.inclusive,
    taxConfig.enabled
  );

  const isCurrentPlan =
    subscription.planId === plan.id &&
    subscription.status === "ACTIVE" &&
    subscription.currentPeriodEnd.getTime() > Date.now() &&
    subscription.source === "PAID";

  const profileComplete = Boolean(
    company.name?.trim() &&
    company.email?.trim() &&
    company.phone?.replace(/[^0-9+]/g, "").length
  );

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex min-h-18 max-w-7xl items-center justify-between gap-4 px-5 sm:px-6 lg:px-8">
          <Link href="/dashboard" className="flex items-center gap-3">
            <img
              src="/favicon.svg"
              alt="Conventus"
              className="size-9 rounded-xl object-contain"
            />
            <div>
              <p className="text-sm font-semibold tracking-tight">Conventus</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">
                Secure checkout
              </p>
            </div>
          </Link>

          <Link
            href="/dashboard?billing=1"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-950"
          >
            <ArrowLeft className="size-3.5" />
            Back to plans
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-6 lg:px-8 lg:py-12">
        <div className="mb-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">
            Checkout
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            {isCurrentPlan ? "Renew your plan" : "Confirm your plan"}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Review the server-calculated plan price, GST, and total before Conventus opens Razorpay Checkout.
          </p>
        </div>

        {!profileComplete && (
          <section className="mb-6 flex flex-col gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-amber-950">Billing profile incomplete</p>
              <p className="mt-1 text-xs leading-5 text-amber-800">
                Company name, billing email, and phone are required before payment.
              </p>
            </div>
            <Link
              href="/dashboard/company-profile"
              className="inline-flex shrink-0 items-center justify-center rounded-xl bg-amber-950 px-3.5 py-2.5 text-xs font-semibold text-white"
            >
              Complete profile
            </Link>
          </section>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_390px]">
          <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-6 sm:px-8">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-700">
                  {plan.name}
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
                  {plan.validityDays} days
                </span>
                {isCurrentPlan && (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
                    Current plan · renewal
                  </span>
                )}
              </div>

              <h2 className="mt-4 text-2xl font-semibold tracking-tight">
                {plan.name} subscription
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                Plan access is enforced server-side from the active subscription record. Successful payment activates one complete {plan.validityDays}-day billing period.
              </p>
            </div>

            <div className="mx-6 mt-6 rounded-2xl border border-blue-100 bg-blue-50/60 p-5 sm:mx-8">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-blue-600">
                    Plan pricing
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    Server-calculated billing
                  </p>
                </div>
                <p className="text-xl font-semibold text-slate-950">{money(tax.totalAmount)}</p>
              </div>

              <div className="mt-4 space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-600">Plan price</span>
                  <span className="font-semibold text-slate-900">{money(baseAmount)}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-600">GST</span>
                  <span className="font-semibold text-slate-900">{money(tax.gstAmount)}</span>
                </div>
                <div className="flex items-center justify-between gap-4 border-t border-blue-100 pt-3">
                  <span className="font-semibold text-blue-950">Final price</span>
                  <span className="text-lg font-semibold text-slate-950">{money(tax.totalAmount)}</span>
                </div>
              </div>
            </div>

            <div className="grid gap-3 p-6 sm:grid-cols-2 sm:p-8">
              {[
                ["Employees", String(plan.maxEmployees)],
                ["Meetings / month", String(plan.monthlyMeetingLimit)],
                ["Max meeting duration", plan.maxMeetingDurationMinutes + " minutes"],
                ["Concurrent meetings", String(plan.maxConcurrentMeetings)],
                ["Billing period", plan.validityDays + " days"],
                ["Currency", "INR"]
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                    {label}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{value}</p>
                </div>
              ))}
            </div>

            <div className="border-t border-slate-200 px-6 py-6 sm:px-8">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center gap-2">
                    <FileText className="size-4 text-blue-600" />
                    <p className="text-xs font-semibold">Invoice record</p>
                  </div>
                  <p className="mt-2 text-[11px] leading-5 text-slate-500">
                    After capture, Conventus writes a payment ledger record and a unique invoice linked to the Razorpay payment ID.
                  </p>
                </div>

                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="size-4 text-emerald-600" />
                    <p className="text-xs font-semibold text-emerald-950">Server verification</p>
                  </div>
                  <p className="mt-2 text-[11px] leading-5 text-emerald-800">
                    The server verifies signature, order, amount, currency, and captured payment status before granting features.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <aside className="h-fit rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="border-b border-slate-200 pb-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                Order summary
              </p>
              <div className="mt-3 flex items-end justify-between gap-4">
                <div>
                  <p className="text-lg font-semibold">{plan.name}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {isCurrentPlan ? "Renewal" : "New subscription"} · {plan.validityDays} days
                  </p>
                </div>
                <p className="text-xl font-semibold">{money(tax.totalAmount)}</p>
              </div>
            </div>

            <div className="space-y-3 py-5 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-500">Plan price</span>
                <span className="font-semibold text-slate-900">{money(baseAmount)}</span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-500">Discount</span>
                <span className="font-semibold text-slate-900">{money(0)}</span>
              </div>

              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="text-slate-500">
                    GST {tax.enabled ? "@" + tax.ratePercent.toFixed(2) + "%" : ""}
                  </span>
                  <p className="mt-1 text-[10px] text-slate-400">
                    {tax.enabled
                      ? tax.inclusive
                        ? "Included in the plan price"
                        : "Added to the plan price"
                      : "Not applied"}
                  </p>
                </div>
                <span className="font-semibold text-slate-900">{money(tax.gstAmount)}</span>
              </div>
            </div>

            <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs font-semibold text-blue-900">Total payment</span>
                <span className="text-2xl font-semibold tracking-tight text-slate-950">
                  {money(tax.totalAmount)}
                </span>
              </div>
              <p className="mt-2 text-[10px] leading-4 text-blue-800">
                This exact total is sent to Razorpay by the Conventus server.
              </p>
            </div>

            <div className="mt-5">
              <RazorpayPlanButton
                planId={plan.id}
                currentPlanId={subscription.planId}
                disabled={!profileComplete}
                mode="pay"
              />
            </div>

            <div className="mt-4 flex items-start gap-2 text-[10px] leading-4 text-slate-400">
              <CreditCard className="mt-0.5 size-3.5 shrink-0" />
              Razorpay handles the payment UI. Conventus does not trust browser-supplied prices.
            </div>

            {isCurrentPlan && (
              <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2.5 text-[10px] leading-4 text-slate-500">
                Current plan expires {dateLabel(subscription.currentPeriodEnd)}. A successful renewal is appended to the current paid period rather than overlapping it.
              </p>
            )}

            <div className="mt-5 flex items-center gap-2 text-[10px] font-medium text-slate-400">
              <CheckCircle2 className="size-3.5 text-emerald-600" />
              Invoice generated after verified capture
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
