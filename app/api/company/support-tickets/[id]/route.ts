import { Types } from "mongoose";
import { getMongo } from "@/lib/mongodb";
import { Membership } from "@/models/membership";
import { Workspace } from "@/models/workspace";
import { SupportTicket } from "@/models/support-ticket";
import { getSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireCompanySupportMember() {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHENTICATED");

  if (
    !session.companyId ||
    !["COMPANY_ADMIN", "EMPLOYEE"].includes(session.role)
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
    .select("_id")
    .lean();

  if (!workspace) throw new Error("FORBIDDEN");

  return session;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireCompanySupportMember();
    const { id } = await params;

    if (!Types.ObjectId.isValid(id)) {
      return jsonError("SUPPORT_TICKET_ID_INVALID", 400);
    }

    const ticket = await SupportTicket.findOne({
      _id: new Types.ObjectId(id),
      companyId: new Types.ObjectId(session.companyId)
    })
      .select(
        "_id companyId workspaceId submitterUserId submitterName submitterEmail subject description status createdAt updatedAt statusChangedAt"
      )
      .lean();

    if (!ticket) return jsonError("SUPPORT_TICKET_NOT_FOUND", 404);

    return jsonOk({
      id: String(ticket._id),
      subject: ticket.subject,
      description: ticket.description,
      status: ticket.status,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      statusChangedAt: ticket.statusChangedAt ?? null,
      submitter: {
        name: ticket.submitterName || session.name,
        email: ticket.submitterEmail || session.email
      }
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "SUPPORT_TICKET_DETAIL_FAILED";
    return jsonError(
      code,
      code === "UNAUTHENTICATED" ? 401 :
      code === "FORBIDDEN" ? 403 :
      code === "SUPPORT_TICKET_NOT_FOUND" ? 404 : 400
    );
  }
}
