import { getMongo } from "@/lib/mongodb";
import { getSession } from "@/lib/session";
import { Company } from "@/models/company";
import { Membership } from "@/models/membership";
import { assertSameOrigin } from "@/lib/security";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validPhone(value: string) {
  const normalized = value.replace(/[^0-9+]/g, "");
  return normalized.length >= 8 && normalized.length <= 18;
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await getSession();
    if (!session) return jsonError("UNAUTHENTICATED", 401);
    if (!session.companyId || !["COMPANY_ADMIN", "COMPANY_OWNER", "PLATFORM_ADMIN"].includes(session.role)) {
      return jsonError("FORBIDDEN", 403);
    }

    await getMongo();
    if (session.role !== "PLATFORM_ADMIN") {
      const membership = await Membership.findOne({
        companyId: session.companyId,
        userId: session.userId,
        active: true,
        role: { $in: ["COMPANY_OWNER", "COMPANY_ADMIN"] }
      }).select("_id").lean();
      if (!membership) return jsonError("FORBIDDEN", 403);
    }

    const body = await request.json().catch(() => null) as {
      name?: unknown;
      email?: unknown;
      phone?: unknown;
    } | null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const phone = typeof body?.phone === "string" ? body.phone.replace(/[^0-9+]/g, "") : "";

    if (!name || name.length > 100 || !validEmail(email) || email.length > 254 || !validPhone(phone)) {
      return jsonError("BILLING_PROFILE_INVALID", 400);
    }

    const company = await Company.findOneAndUpdate(
      { _id: session.companyId },
      { $set: { name, email, phone } },
      { returnDocument: "after", runValidators: true }
    ).select("_id name email phone").lean();
    if (!company) return jsonError("COMPANY_NOT_FOUND", 404);

    return jsonOk({ name: company.name, email: company.email ?? "", phone: company.phone ?? "" });
  } catch (error) {
    const code = error instanceof Error ? error.message : "BILLING_PROFILE_UPDATE_FAILED";
    const status = code === "CSRF_ORIGIN_INVALID" ? 403
      : code === "UNAUTHENTICATED" ? 401
      : code === "FORBIDDEN" ? 403
      : 500;
    return jsonError(code, status);
  }
}
