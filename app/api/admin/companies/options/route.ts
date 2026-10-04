import { Company } from "@/models/company";
import { requirePlatformAdmin } from "@/lib/admin";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escapeRegex(value: string) {
  return value.replace(/[.*+?^()|[\]\\]/g, "\\$&");
}

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin();
    const url = new URL(request.url);
    const search = (url.searchParams.get("search") ?? "").trim().slice(0, 80);
    const rawLimit = Number(url.searchParams.get("limit") ?? "25");
    const limit = Number.isFinite(rawLimit) ? Math.min(25, Math.max(1, Math.floor(rawLimit))) : 25;
    const regex = search ? new RegExp(escapeRegex(search), "i") : null;
    const filter = regex ? { $or: [{ name: regex }, { slug: regex }, { email: regex }] } : {};
    const companies = await Company.find(filter)
      .sort({ name: 1 })
      .limit(limit)
      .select("_id name slug")
      .lean();

    return jsonOk(companies.map((company) => ({
      id: String(company._id),
      name: company.name,
      slug: company.slug
    })));
  } catch (error) {
    const code = error instanceof Error ? error.message : "COMPANY_OPTIONS_FAILED";
    return jsonError(code, code === "UNAUTHENTICATED" ? 401 : code === "FORBIDDEN" ? 403 : 500);
  }
}
