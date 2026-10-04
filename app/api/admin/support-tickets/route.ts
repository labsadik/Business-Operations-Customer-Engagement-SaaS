import { Types } from "mongoose";
import { getMongo } from "@/lib/mongodb";
import { SupportTicket } from "@/models/support-ticket";
import { Company } from "@/models/company";
import { requirePlatformAdmin } from "@/lib/admin";
import { jsonError, jsonOk } from "@/lib/http";
import { SUPPORT_TICKET_PAGE_SIZE_MAX, SUPPORT_TICKET_STATUSES } from "@/lib/support-tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parsePagination(request: Request) {
  const params = new URL(request.url).searchParams;
  const rawPage = Number(params.get("page") ?? "1");
  const rawLimit = Number(params.get("limit") ?? "25");
  return {
    page: Number.isFinite(rawPage) ? Math.min(1000, Math.max(1, Math.floor(rawPage))) : 1,
    limit: Number.isFinite(rawLimit)
      ? Math.min(SUPPORT_TICKET_PAGE_SIZE_MAX, Math.max(1, Math.floor(rawLimit)))
      : 25
  };
}

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin();
    await getMongo();

    const params = new URL(request.url).searchParams;
    const { page, limit } = parsePagination(request);
    const status = params.get("status") ?? "";
    const companyId = params.get("companyId") ?? "";

    if (status && !SUPPORT_TICKET_STATUSES.includes(status as typeof SUPPORT_TICKET_STATUSES[number])) {
      return jsonError("SUPPORT_TICKET_STATUS_INVALID", 400);
    }
    if (companyId && !Types.ObjectId.isValid(companyId)) {
      return jsonError("SUPPORT_TICKET_COMPANY_ID_INVALID", 400);
    }

    const query: Record<string, unknown> = {};
    if (status) query.status = status;
    if (companyId) query.companyId = new Types.ObjectId(companyId);

    const raw = await SupportTicket.find(query)
      .sort({ updatedAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit + 1)
      .select(
        "_id companyId submitterName submitterEmail subject description status createdAt updatedAt"
      )
      .lean();

    const hasNext = raw.length > limit;
    const items = raw.slice(0, limit);
    const companyIds = [...new Set(items.map((item) => String(item.companyId)))];

    const companies = companyIds.length
      ? await Company.find({ _id: { $in: companyIds } })
          .select("_id name slug email phone")
          .limit(SUPPORT_TICKET_PAGE_SIZE_MAX)
          .lean()
      : [];

    const companyMap = new Map(
      companies.map((item) => [
        String(item._id),
        {
          id: String(item._id),
          name: item.name,
          slug: item.slug,
          email: item.email ?? "",
          phone: item.phone ?? ""
        }
      ])
    );

    return jsonOk({
      items: items.map((item) => ({
        id: String(item._id),
        subject: item.subject,
        description: item.description,
        status: item.status,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        company: companyMap.get(String(item.companyId)) ?? null,
        submitter: {
          name: item.submitterName || "Authenticated company member",
          email: item.submitterEmail || ""
        }
      })),
      page,
      limit,
      hasNext
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "SUPPORT_TICKET_ADMIN_LIST_FAILED";
    return jsonError(
      code,
      code === "UNAUTHENTICATED" ? 401 :
      code === "FORBIDDEN" ? 403 :
      code.includes("INVALID") ? 400 : 500
    );
  }
}
