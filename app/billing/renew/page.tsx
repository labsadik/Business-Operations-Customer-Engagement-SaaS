import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, CreditCard, LockKeyhole } from "lucide-react";
import { getSession } from "@/lib/session";
import { getMongo } from "@/lib/mongodb";
import { Company } from "@/models/company";
import { Membership } from "@/models/membership";
import { getCompanyPlanAccessState, getCompanySubscription } from "@/lib/plans-server";
import { listPublicPlans } from "@/lib/plan-catalog";

export const dynamic = "force-dynamic";
export const metadata = { title: "Renew company plan · Conventus" };

function money(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(value);
}

function dateLabel(value: Date | null | undefined) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "long",
    timeStyle: "short"
  }).format(value);
}

export default async function BillingRenewalPage() {
  const session = await getSession();
  if (!session) redirect("/login?error=signin_required");
  if (!session.companyId || !["COMPANY_ADMIN", "COMPANY_OWNER", "PLATFORM_ADMIN"].includes(session.role)) {
    redirect("/dashboard");
  }

  await getMongo();
  if (session.role !== "PLATFORM_ADMIN") {
    const membership = await Membership.findOne({
      companyId: session.companyId,
      userId: session.userId,
      active: true,
      role: { $in: ["COMPANY_OWNER", "COMPANY_ADMIN"] }
    }).select("_id").lean();
    if (!membership) redirect("/dashboard");
  }

  const [company, subscription, plans] = await Promise.all([
    Company.findById(session.companyId).select("name email phone").lean(),
    getCompanySubscription(session.companyId),
    listPublicPlans()
  ]);
  if (!company || !subscription) redirect("/dashboard");

  const accessState = await getCompanyPlanAccessState(session.companyId);
  const accessStatusLabel = accessState?.reason === "SUSPENDED" ? "Suspended by platform"
    : accessState?.reason === "EXPIRED" ? "Expired"
    : accessState?.reason === "INACTIVE" ? "Subscription inactive"
    : accessState?.reason === "ACTIVE" ? "Active"
    : "Unavailable";
  const accessExpiresAt = accessState?.planAccessExpiresAt ?? subscription.currentPeriodEnd;
  const purchasablePlans = plans.filter((plan) => plan.status === "PUBLIC" && plan.requiresPayment);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Account billing</p>
            <p className="mt-1 text-sm font-semibold">{company.name}</p>
          </div>
          <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            <ArrowLeft className="size-3.5" /> Account status
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:py-12">
        <section className="mb-8 rounded-3xl border border-amber-200 bg-amber-50 p-5 sm:p-7">
          <div className="flex items-start gap-3">
            <LockKeyhole className="mt-1 size-5 shrink-0 text-amber-800" />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Renew or change your company plan</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
                Choose a published paid plan below. The dashboard stays locked until the server confirms an active subscription and an unexpired service period. A successful renewal restores expired access automatically; a separate platform suspension must still be lifted by an administrator.
              </p>
              <p className="mt-3 text-xs leading-5 text-slate-600">
                Current plan: <span className="font-semibold">{subscription.planId}</span> · Subscription status: <span className="font-semibold">{subscription.status}</span> · Access status: <span className="font-semibold">{accessStatusLabel}</span> · Access ends: <span className="font-semibold">{dateLabel(accessExpiresAt)}</span>
              </p>
            </div>
          </div>
        </section>

        {purchasablePlans.length === 0 ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold">No paid plan is available for checkout</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Please return to the account status screen and submit a support request so the platform team can review your plan configuration.</p>
            <Link href="/dashboard" className="mt-4 inline-flex rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700">Contact support</Link>
          </section>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {purchasablePlans.map((plan) => {
              const included = [
                { label: "Task Management", enabled: Boolean(plan.taskManagementEnabled) },
                { label: "Cloud Vault", enabled: Boolean(plan.vaultEnabled) },
                { label: "Live Chat", enabled: Boolean(plan.liveChatEnabled) }
              ];
              return (
                <section key={plan.id} className="flex flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold tracking-tight">{plan.name}</h2>
                      <p className="mt-1 text-xs text-slate-500">{plan.validityDays}-day service period</p>
                    </div>
                    {plan.id === subscription.planId && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-700">Current plan</span>}
                  </div>
                  {plan.description && <p className="mt-3 min-h-10 text-sm leading-5 text-slate-600">{plan.description}</p>}
                  <p className="mt-5 text-3xl font-semibold tracking-tight">{money(plan.finalPriceInr)}</p>
                  <p className="mt-1 text-xs text-slate-500">{money(plan.priceInr)} listed price before any promotion</p>
                  <ul className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-sm">
                    {included.map((feature) => (
                      <li key={feature.label} className="flex items-center gap-2">
                        <CheckCircle2 className={"size-4 " + (feature.enabled ? "text-emerald-600" : "text-slate-300")} />
                        <span className={feature.enabled ? "text-slate-800" : "text-slate-400"}>{feature.label}{feature.enabled ? "" : " — not included"}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4 text-xs leading-5 text-slate-500">
                    Up to {plan.maxEmployees} employees · {plan.monthlyMeetingLimit} meetings per period · {plan.maxConcurrentMeetings} concurrent meetings
                  </p>
                  <Link
                    href={("/billing/checkout?plan=" + encodeURIComponent(plan.id)) as Route}
                    className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    <CreditCard className="size-4" />
                    {plan.id === subscription.planId ? "Renew this plan" : "Choose this plan"}
                  </Link>
                </section>
              );
            })}
          </div>
        )}

        <p className="mt-8 text-xs leading-5 text-slate-500">
          Only the plan that is verified as paid by the payment provider can unlock services. Features not included in the purchased plan remain restricted even after renewal.
        </p>
      </div>
    </main>
  );
}
