import { getMongo } from "@/lib/mongodb";
import { Meeting } from "@/models/meeting";
import { User } from "@/models/user";
import { requireCompanyMember } from "@/lib/authz";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let session: { userId: string; companyId?: string; role: string };
  try {
    const result = await requireCompanyMember(["EMPLOYEE", "COMPANY_OWNER", "COMPANY_ADMIN"]);
    session = result.session;
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNAUTHENTICATED";
    return jsonError(code, code === "UNAUTHENTICATED" ? 401 : 403);
  }

  if (!session.companyId) return jsonError("COMPANY_NOT_CONFIGURED", 403);

  await getMongo();

  const filter: Record<string, unknown> = {
    companyId: session.companyId,
    $or: [
      { status: { $in: ["COMPLETED", "CANCELLED"] } },
      { status: { $in: ["READY", "LIVE"] }, endAt: { $lte: new Date() } }
    ]
  };

  if (session.role === "EMPLOYEE") {
    filter.employeeId = session.userId;
  }

  const meetings = await Meeting.find(filter)
    .sort({ startAt: -1 })
    .limit(500)
    .select("employeeId customerId startAt endAt endedAt status calendarSyncStatus")
    .lean();

  const participantIds = meetings.flatMap((meeting) => [
    meeting.employeeId,
    meeting.customerId
  ]);

  const participants = await User.find({
    _id: { $in: participantIds }
  }).select("name email image").lean();

  const participantMap = new Map(
    participants.map((participant) => [
      String(participant._id),
      {
        name: participant.name,
        email: participant.email,
        image: participant.image ?? null
      }
    ])
  );

  return jsonOk(
    meetings.map((meeting) => {
      const durationMinutes = Math.max(
        1,
        Math.round((meeting.endAt.getTime() - meeting.startAt.getTime()) / 60000)
      );

      return {
        startAt: meeting.startAt,
        endAt: meeting.endAt,
        endedAt: meeting.endedAt ?? meeting.endAt,
        durationMinutes,
        status: meeting.status,
        calendarSyncStatus: meeting.calendarSyncStatus,
        employee: participantMap.get(String(meeting.employeeId)) ?? null,
        customer: participantMap.get(String(meeting.customerId)) ?? null,
        scheduledBy: participantMap.get(String(meeting.customerId)) ?? null
      };
    })
  );
}
