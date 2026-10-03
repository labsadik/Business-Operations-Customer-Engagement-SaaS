import { getMongo } from "@/lib/mongodb";
import { Invoice } from "@/models/invoice";
import { getSession } from "@/lib/session";
import { Membership } from "@/models/membership";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("UNAUTHENTICATED", 401);
  if (!session.companyId || !["COMPANY_OWNER", "COMPANY_ADMIN"].includes(session.role)) {
    return jsonError("FORBIDDEN", 403);
  }

  await getMongo();
  const membership = await Membership.findOne({
    companyId: session.companyId,
    userId: session.userId,
    active: true,
    role: { $in: ["COMPANY_OWNER", "COMPANY_ADMIN"] }
  }).lean();
  if (!membership) return jsonError("FORBIDDEN", 403);

  const invoices = await Invoice.find({ companyId: session.companyId })
    .sort({ issuedAt: -1 })
    .limit(50)
    .lean();

  return jsonOk(invoices.map((invoice) => ({
    id: String(invoice._id),
    invoiceNumber: invoice.invoiceNumber,
    planId: invoice.planId,
    providerOrderId: invoice.providerOrderId,
    providerPaymentId: invoice.providerPaymentId,
    amount: invoice.amount,
    currency: invoice.currency,
    issuedAt: invoice.issuedAt,
    companySnapshot: invoice.companySnapshot
  })));
}
