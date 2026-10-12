import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/session";
import { getMongo } from "@/lib/mongodb";
import { Company } from "@/models/company";
import { Membership } from "@/models/membership";
import BillingCompanyProfileForm from "@/components/billing-company-profile-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Billing profile · Conventus" };

export default async function BillingCompanyProfilePage({
  searchParams
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
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

  const company = await Company.findById(session.companyId).select("name email phone").lean();
  if (!company) redirect("/dashboard");
  const { plan } = await searchParams;
  const planId = plan?.trim().toLowerCase() ?? "";

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Account billing</p>
            <h1 className="mt-1 text-lg font-semibold">Billing contact details</h1>
          </div>
          <Link href={(planId ? "/billing/checkout?plan=" + encodeURIComponent(planId) : "/billing/renew") as Route} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            <ArrowLeft className="size-3.5" /> Back
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 lg:py-12">
        <p className="mb-6 text-sm leading-6 text-slate-600">
          Update the company name, billing email, and phone number required by secure checkout. This billing-only page remains available while the main dashboard is locked.
        </p>
        <BillingCompanyProfileForm
          initialName={company.name ?? ""}
          initialEmail={company.email ?? ""}
          initialPhone={company.phone ?? ""}
          planId={planId}
        />
      </div>
    </main>
  );
}
