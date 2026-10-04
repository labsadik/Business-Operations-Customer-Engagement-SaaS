import { Types } from "mongoose";
import { getMongo } from "@/lib/mongodb";
import { SupportTicket } from "@/models/support-ticket";
import { Company } from "@/models/company";
import { PlatformAuditEvent } from "@/models/platform-audit-event";
import { requirePlatformAdmin } from "@/lib/admin";
import { assertSameOrigin } from "@/lib/security";
import { jsonError, jsonOk } from "@/lib/http";
import {
  isValidSupportTicketStatusTransition,
  validateSupportTicketStatus
} from "@/lib/support-tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePlatformAdmin();
    await getMongo();

    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) {
      return jsonError("SUPPORT_TICKET_ID_INVALID", 400);
    }

    const ticket = await SupportTicket.findById(new Types.ObjectId(id))
      .select(
        "_id companyId workspaceId submitterUserId submitterName submitterEmail subject description status createdAt updatedAt statusChangedAt statusChangedByUserId"
      )
      .lean();

    if (!ticket) return jsonError("SUPPORT_TICKET_NOT_FOUND", 404);

    const company = await Company.findById(ticket.companyId)
      .select("_id name slug email phone")
      .lean();

    return jsonOk({
      id: String(ticket._id),
      subject: ticket.subject,
      description: ticket.description,
      status: ticket.status,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      statusChangedAt: ticket.statusChangedAt ?? null,
      statusChangedByUserId: ticket.statusChangedByUserId
        ? String(ticket.statusChangedByUserId)
        : null,
      company: company
        ? {
            id: String(company._id),
            name: company.name,
            slug: company.slug,
            email: company.email ?? "",
            phone: company.phone ?? ""
          }
        : null,
      submitter: {
        id: String(ticket.submitterUserId),
        name: ticket.submitterName || "Authenticated company member",
        email: ticket.submitterEmail || ""
      }
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "SUPPORT_TICKET_ADMIN_DETAIL_FAILED";
    return jsonError(
      code,
      code === "UNAUTHENTICATED" ? 401 :
      code === "FORBIDDEN" ? 403 :
      code === "SUPPORT_TICKET_NOT_FOUND" ? 404 : 400
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    assertSameOrigin(request);
    const admin = await requirePlatformAdmin();
    await getMongo();

    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) {
      return jsonError("SUPPORT_TICKET_ID_INVALID", 400);
    }

    const body = await request.json().catch(() => null) as { status?: unknown } | null;
    const nextStatus = validateSupportTicketStatus(body?.status);

    const ticket = await SupportTicket.findById(new Types.ObjectId(id));
    if (!ticket) return jsonError("SUPPORT_TICKET_NOT_FOUND", 404);

    const currentStatus = ticket.status as typeof nextStatus;
    if (!isValidSupportTicketStatusTransition(currentStatus, nextStatus)) {
      return jsonError("SUPPORT_TICKET_STATUS_TRANSITION_INVALID", 400);
    }

    if (currentStatus === nextStatus) {
      return jsonOk({
        id: String(ticket._id),
        status: ticket.status,
        updatedAt: ticket.updatedAt
      });
    }

    const changedAt = new Date();
    ticket.status = nextStatus;
    ticket.statusChangedAt = changedAt;
    ticket.statusChangedByUserId = new Types.ObjectId(admin.userId);
    await ticket.save();

    await PlatformAuditEvent.create({
      actorUserId: new Types.ObjectId(admin.userId),
      entityType: "SUPPORT_TICKET",
      entityId: ticket._id,
      action: "STATUS_CHANGE",
      details: {
        companyId: String(ticket.companyId),
        previousStatus: currentStatus,
        newStatus: nextStatus
      }
    });

    return jsonOk({
      id: String(ticket._id),
      status: ticket.status,
      updatedAt: ticket.updatedAt,
      statusChangedAt: ticket.statusChangedAt,
      statusChangedByUserId: String(ticket.statusChangedByUserId)
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "SUPPORT_TICKET_STATUS_UPDATE_FAILED";
    return jsonError(
      code,
      code === "CSRF_ORIGIN_INVALID" ? 403 :
      code === "UNAUTHENTICATED" ? 401 :
      code === "FORBIDDEN" ? 403 :
      code === "SUPPORT_TICKET_NOT_FOUND" ? 404 :
      code.includes("INVALID") ? 400 : 500
    );
  }
}
