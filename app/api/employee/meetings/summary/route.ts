import { getMongo } from "@/lib/mongodb";
import { BookingRequest } from "@/models/booking-request";
import { Meeting } from "@/models/meeting";
import { requireCompanyMember } from "@/lib/authz";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let session: { userId: string; companyId?: string; role: string };
  try {
    session = (await requireCompanyMember([
      "EMPLOYEE",
      "COMPANY_OWNER",
      "COMPANY_ADMIN"
    ])).session;
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNAUTHENTICATED";
    return jsonError(code, code === "UNAUTHENTICATED" ? 401 : 403);
  }

  if (!session.companyId) return jsonError("COMPANY_NOT_CONFIGURED", 403);
  await getMongo();

  const now = new Date();
  const scope = { companyId: session.companyId };
  const roleAllowsAll = ["COMPANY_OWNER", "COMPANY_ADMIN", "PLATFORM_ADMIN"].includes(session.role);
  const employeeScope = roleAllowsAll ? {} : { assignedEmployeeId: session.userId };
  const meetingEmployeeScope = roleAllowsAll ? {} : { employeeId: session.userId };

  const [requestedCount, processingCount, ongoingCount, happenedCount] = await Promise.all([
    BookingRequest.countDocuments({
      ...scope,
      status: { $in: ["REQUESTED", "RETRYING"] },
      expiresAt: { $gt: now },
      declinedBy: { $ne: session.userId }
    }),
    BookingRequest.countDocuments({
      ...scope,
      ...employeeScope,
      status: { $in: ["ASSIGNED", "CREATING_MEETING"] },
      expiresAt: { $gt: now }
    }),
    BookingRequest.countDocuments({
      ...scope,
      ...employeeScope,
      status: { $in: ["CONFIRMED", "IN_PROGRESS"] },
      requestedEndAt: { $gt: now }
    }),
    Meeting.countDocuments({
      ...scope,
      ...meetingEmployeeScope,
      $or: [
        { status: "COMPLETED" },
        { status: { $in: ["READY", "LIVE"] }, endAt: { $lte: now } }
      ]
    })
  ]);

  return jsonOk({
    requestedCount,
    processingCount,
    ongoingCount,
    happenedCount,
    checkedAt: now.toISOString()
  });
}
