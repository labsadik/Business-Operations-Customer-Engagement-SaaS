import Image from "next/image";
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
import { calculatePlanPricing, getPlanForCheckout } from "@/lib/plan-catalog";
import { calculateInvoiceTaxFromBase, invoiceTaxConfig } from "@/lib/invoicing";
import RazorpayPlanButton from "@/components/razorpay-plan-button";
import { getServerNowMs } from "@/lib/server-time";

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

function storageLimitLabel(bytes: number) {
  const units = [
    { size: 1024 ** 4, label: "TB" },
    { size: 1024 ** 3, label: "GB" },
    { size: 1024 ** 2, label: "MB" },
    { size: 1024, label: "KB" }
  ];
  const unit = units.find((candidate) => bytes >= candidate.size) ?? { size: 1, label: "B" };
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(bytes / unit.size) + " " + unit.label;
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
    !["COMPANY_OWNER", "COMPANY_ADMIN", "PLATFORM_ADMIN"].includes(session.role)
  ) {
    redirect("/dashboard");
  }

  await getMongo();

  if (session.role !== "PLATFORM_ADMIN") {
    const membership = await Membership.findOne({
      companyId: session.companyId,
      userId: session.userId,
      active: true,
      role: { $in: ["COMPANY_OWNER", "COMPANY_ADMIN"] }
    }).lean();

    if (!membership) redirect("/dashboard");
  }

  const { plan: rawPlanId } = await searchParams;
  const planId = rawPlanId?.trim().toLowerCase();

  let plan;
  try {
    if (!planId) throw new Error("PLAN_NOT_FOUND");
    plan = await getPlanForCheckout(planId);
  } catch {
    redirect("/dashboard?billing=1&billingError=PLAN_NOT_AVAILABLE");
  }

  const [company, subscription, taxConfig] = await Promise.all([
    Company.findById(session.companyId)
      .select("name email phone profileComplete logoUrl")
      .lean(),
    getCompanySubscription(session.companyId),
    invoiceTaxConfig()
  ]);

  if (!company) redirect("/dashboard");

  const pricing = calculatePlanPricing(plan.priceInr, plan.discountType, plan.discountValue);
  const tax = calculateInvoiceTaxFromBase(
    pricing.discountedAmountMinor,
    taxConfig.ratePercent,
    taxConfig.inclusive,
    taxConfig.enabled
  );

  const nowMs = getServerNowMs();
  const isCurrentPlan =
    subscription.planId === plan.id &&
    subscription.status === "ACTIVE" &&
    subscription.source === "PAID" &&
    subscription.currentPeriodEnd.getTime() > nowMs;

  const normalizedPhone = company.phone?.replace(/[^0-9+]/g, "") ?? "";
  const validEmail = Boolean(
    company.email?.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(company.email)
  );
  const validPhone = normalizedPhone.length >= 8 && normalizedPhone.length <= 18;
  const profileComplete = Boolean(company.name?.trim() && validEmail && validPhone);

  return (
    <main className="min-h-screen bg-[#faf9f1] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex min-h-18 max-w-7xl items-center justify-between gap-4 px-5 sm:px-6 lg:px-8">
          <Link href="/dashboard" className="flex items-center gap-3">
            <Image
              src="/favicon.svg"
              alt="Conventus"
              width={36}
              height={36}
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
                  Selected plan
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
                  Plan ID: {plan.id}
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
                  {plan.validityDays}-day billing period
                </span>
                {plan.popular && (
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-700">
                    Popular
                  </span>
                )}
                {plan.recommended && (
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700">
                    Recommended
                  </span>
                )}
                {isCurrentPlan && (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
                    Current plan · renewal
                  </span>
                )}
              </div>

              <h2 className="mt-4 text-2xl font-semibold tracking-tight">
                {plan.name} subscription
              </h2>
              {plan.description && (
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  {plan.description}
                </p>
              )}
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                You selected <span className="font-semibold text-slate-700">{plan.name}</span> ({plan.id}). These details are loaded from the current server-side plan configuration. Successful payment activates one complete {plan.validityDays}-day billing period.
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
                  <span className="text-slate-600">Base price</span>
                  <span className="font-semibold text-slate-900">{money(pricing.baseAmountMinor)}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-600">Discount</span>
                  <span className="font-semibold text-emerald-700">−{money(pricing.discountAmountMinor)}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-600">Plan price after discount</span>
                  <span className="font-semibold text-slate-900">{money(pricing.discountedAmountMinor)}</span>
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
                ["Workspaces", String(plan.maxWorkspaces)],
                ["Companies", String(plan.maxCompanies)],
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

            <section className="border-t border-slate-200 px-6 py-6 sm:px-8">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-slate-950">Included features and limits</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  These limits match the selected plan and the configuration used to calculate this checkout.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold text-slate-900">Task management</p>
                  <p className={"mt-2 text-xs font-semibold " + (plan.taskManagementEnabled ? "text-emerald-700" : "text-slate-500")}>
                    {plan.taskManagementEnabled ? "Included" : "Not included"}
                  </p>
                  <p className="mt-1 text-[11px] leading-5 text-slate-500">
                    {plan.taskManagementEnabled
                      ? plan.taskManagementDailyLimit === null
                        ? "Unlimited task assignments per day"
                        : plan.taskManagementDailyLimit + " task assignments per day"
                      : "Task creation and assignment are not enabled on this plan."}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold text-slate-900">Cloud vault</p>
                  <p className={"mt-2 text-xs font-semibold " + (plan.vaultEnabled ? "text-emerald-700" : "text-slate-500")}>
                    {plan.vaultEnabled ? "Included" : "Not included"}
                  </p>
                  {plan.vaultEnabled ? (
                    <p className="mt-1 text-[11px] leading-5 text-slate-500">
                      {storageLimitLabel(plan.vaultQuotaBytes)} storage · {storageLimitLabel(plan.vaultMaxFileBytes)} max per file · {plan.vaultMaxItems.toLocaleString("en-IN")} stored items
                    </p>
                  ) : (
                    <p className="mt-1 text-[11px] leading-5 text-slate-500">Private company file storage is not enabled on this plan.</p>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold text-slate-900">Live Chat</p>
                  <p className={"mt-2 text-xs font-semibold " + (plan.liveChatEnabled ? "text-emerald-700" : "text-slate-500")}>
                    {plan.liveChatEnabled ? "Included" : "Not included"}
                  </p>
                  {plan.liveChatEnabled ? (
                    <p className="mt-1 text-[11px] leading-5 text-slate-500">
                      {plan.liveChatMonthlyLimit.toLocaleString("en-IN")} chats/month · {plan.liveChatCustomerLimit.toLocaleString("en-IN")} unique customers/month · {plan.liveChatAgentLimit.toLocaleString("en-IN")} agents · {plan.liveChatRetentionDays}-day history · {plan.liveChatMessageCooldownSeconds}-second message cooldown
                    </p>
                  ) : (
                    <p className="mt-1 text-[11px] leading-5 text-slate-500">Website chat and customer conversations are not enabled on this plan.</p>
                  )}
                  {plan.liveChatEnabled && (
                    <p className="mt-2 text-[10px] leading-4 text-slate-500">
                      PDF exports: {plan.liveChatPdfExportEnabled ? "enabled" : "disabled"} · Company chat deletion: {plan.liveChatDeleteEnabled ? "enabled" : "disabled"}
                    </p>
                  )}
                </div>
              </div>
              {plan.freeFeatureDays !== null && (
                <p className="mt-4 text-[11px] leading-5 text-slate-500">
                  Free feature window: {plan.freeFeatureDays} days within the {plan.validityDays}-day plan period.
                </p>
              )}
            </section>

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
                <span className="font-semibold text-slate-900">{money(pricing.baseAmountMinor)}</span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-500">Discount</span>
                <span className="font-semibold text-emerald-700">−{money(pricing.discountAmountMinor)}</span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-500">Plan price after discount</span>
                <span className="font-semibold text-slate-900">{money(pricing.discountedAmountMinor)}</span>
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
                planName={plan.name}
                currentPlanId={subscription.planId}
                disabled={!profileComplete}
                mode="pay"
              />
              {!profileComplete && (
                <p className="mt-2 text-[10px] leading-4 text-amber-700">
                  Complete the billing profile above before payment can be processed.
                </p>
              )}
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
