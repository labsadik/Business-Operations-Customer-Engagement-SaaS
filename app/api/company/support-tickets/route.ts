import { Types } from "mongoose";
import { getMongo } from "@/lib/mongodb";
import { Company } from "@/models/company";
import { Membership } from "@/models/membership";
import { Workspace } from "@/models/workspace";
import { SupportTicket } from "@/models/support-ticket";
import { getSession } from "@/lib/session";
import { withRedisLock } from "@/lib/redis-lock";
import { assertSameOrigin, sha256 } from "@/lib/security";
import { jsonError, jsonOk } from "@/lib/http";
import {
  SUPPORT_TICKET_DEDUPE_WINDOW_MS,
  SUPPORT_TICKET_PAGE_SIZE_MAX,
  SUPPORT_TICKET_RATE_LIMIT,
  SUPPORT_TICKET_RATE_WINDOW_MS,
  validateSupportTicketInput
} from "@/lib/support-tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireCompanySupportMember() {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHENTICATED");

  if (
    !session.companyId ||
    !["COMPANY_OWNER", "COMPANY_ADMIN", "EMPLOYEE"].includes(session.role)
  ) {
    throw new Error("FORBIDDEN");
  }

  await getMongo();

  const membership = await Membership.findOne({
    companyId: session.companyId,
    userId: session.userId,
    active: true,
    role: session.role
  })
    .select("_id companyId workspaceId")
    .lean();

  if (!membership) throw new Error("FORBIDDEN");

  const workspace = await Workspace.findOne({
    _id: membership.workspaceId,
    companyId: membership.companyId,
    active: true
  })
    .select("_id companyId")
    .lean();

  if (!workspace) throw new Error("FORBIDDEN");

  const company = await Company.findById(membership.companyId)
    .select("_id name email phone")
    .lean();

  if (!company) throw new Error("COMPANY_NOT_FOUND");

  return {
    session,
    companyId: String(membership.companyId),
    workspaceId: String(membership.workspaceId),
    company
  };
}

function parsePagination(request: Request) {
  const params = new URL(request.url).searchParams;
  const rawPage = Number(params.get("page") ?? "1");
  const rawLimit = Number(params.get("limit") ?? "10");
  const page = Number.isFinite(rawPage)
    ? Math.min(1000, Math.max(1, Math.floor(rawPage)))
    : 1;
  const limit = Number.isFinite(rawLimit)
    ? Math.min(SUPPORT_TICKET_PAGE_SIZE_MAX, Math.max(1, Math.floor(rawLimit)))
    : 10;
  return { page, limit };
}

export async function GET(request: Request) {
  try {
    const scope = await requireCompanySupportMember();
    const { page, limit } = parsePagination(request);

    const raw = await SupportTicket.find({
      companyId: new Types.ObjectId(scope.companyId)
    })
      .sort({ updatedAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit + 1)
      .select(
        "_id subject status createdAt updatedAt submitterName submitterEmail"
      )
      .lean();

    const hasNext = raw.length > limit;
    const items = raw.slice(0, limit);

    return jsonOk({
      items: items.map((item) => ({
        id: String(item._id),
        subject: item.subject,
        status: item.status,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        submitter: {
          name: item.submitterName || scope.session.name,
          email: item.submitterEmail || scope.session.email
        }
      })),
      page,
      limit,
      hasNext
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "SUPPORT_TICKET_LIST_FAILED";
    return jsonError(
      code,
      code === "UNAUTHENTICATED"
        ? 401
        : code === "FORBIDDEN"
          ? 403
          : code === "COMPANY_NOT_FOUND"
            ? 404
            : 400
    );
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { session, companyId, workspaceId, company } =
      await requireCompanySupportMember();

    const body = await request.json().catch(() => null) as {
      subject?: unknown;
      description?: unknown;
    } | null;

    const input = validateSupportTicketInput(body?.subject, body?.description);

    const dedupeKey = sha256(
      [
        companyId,
        session.userId,
        input.subject.toLowerCase(),
        input.description
      ].join(":")
    );

    const ticket = await withRedisLock(
      "support-ticket:" + companyId + ":" + session.userId,
      10_000,
      async () => {
        const rateCutoff = new Date(Date.now() - SUPPORT_TICKET_RATE_WINDOW_MS);
        const recentCount = await SupportTicket.countDocuments({
          companyId,
          submitterUserId: session.userId,
          createdAt: { $gte: rateCutoff }
        });
        if (recentCount >= SUPPORT_TICKET_RATE_LIMIT) {
          throw new Error("SUPPORT_TICKET_RATE_LIMITED");
        }

        const dedupCutoff = new Date(Date.now() - SUPPORT_TICKET_DEDUPE_WINDOW_MS);
        const duplicate = await SupportTicket.findOne({
          companyId,
          submitterUserId: session.userId,
          dedupeKey,
          createdAt: { $gte: dedupCutoff }
        })
          .select("_id")
          .lean();

        if (duplicate) {
          throw new Error("SUPPORT_TICKET_DUPLICATE");
        }

        return SupportTicket.create({
          companyId: new Types.ObjectId(companyId),
          workspaceId: new Types.ObjectId(workspaceId),
          submitterUserId: new Types.ObjectId(session.userId),
          submitterName: session.name || undefined,
          submitterEmail: session.email || undefined,
          subject: input.subject,
          description: input.description,
          dedupeKey,
          status: "NOT_SEEN"
        });
      }
    );

    return jsonOk(
      {
        id: String(ticket._id),
        status: ticket.status,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        subject: ticket.subject,
        company: {
          name: company.name,
          email: company.email ?? "",
          phone: company.phone ?? ""
        }
      },
      201
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "SUPPORT_TICKET_CREATE_FAILED";
    const status =
      code === "CSRF_ORIGIN_INVALID" ? 403 :
      code === "UNAUTHENTICATED" ? 401 :
      code === "FORBIDDEN" ? 403 :
      code === "COMPANY_NOT_FOUND" ? 404 :
      code === "SUPPORT_TICKET_DUPLICATE" ? 409 :
      code === "SUPPORT_TICKET_RATE_LIMITED" ? 429 :
      code.includes("REQUIRED") || code.includes("TOO_LONG") ? 400 : 500;

    return jsonError(code, status);
  }
}
