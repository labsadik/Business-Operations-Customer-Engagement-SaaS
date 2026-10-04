import { getMongo } from "@/lib/mongodb";
import { Company } from "@/models/company";
import { MeetingType } from "@/models/meeting-type";
import { Workspace } from "@/models/workspace";
import { getAvailableSlots } from "@/lib/public-availability";
import { jsonError, jsonOk } from "@/lib/http";
import { getCompanyEntitlements } from "@/lib/plans-server";
import { resolveMeetingDuration } from "@/lib/plans";
import { getSession } from "@/lib/session";
import { Types } from "mongoose";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ companySlug: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "CUSTOMER") {
    return jsonError("CUSTOMER_LOGIN_REQUIRED", 401);
  }

  await getMongo();
  const { companySlug } = await params;
  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  const meetingTypeId = url.searchParams.get("meetingTypeId");
  const duration = Number(url.searchParams.get("duration") || 0);

  if (
    !date ||
    !meetingTypeId ||
    !Types.ObjectId.isValid(meetingTypeId) ||
    !Number.isInteger(duration) ||
    duration <= 0
  ) {
    return jsonError("INVALID_AVAILABILITY_QUERY");
  }

  const company = await Company.findOne({
    slug: companySlug.toLowerCase(),
    publicBookingEnabled: true
  }).lean();

  if (!company) return jsonError("COMPANY_NOT_FOUND", 404);

  const workspace = await Workspace.findOne({
    companyId: company._id,
    active: true
  })
    .select("_id timezone")
    .lean();

  if (!workspace) return jsonError("WORKSPACE_NOT_FOUND", 404);

  const type = await MeetingType.findOne({
    _id: meetingTypeId,
    companyId: company._id,
    workspaceId: workspace._id,
    active: true
  }).lean();

  if (!type) return jsonError("MEETING_TYPE_NOT_FOUND", 404);

  const plan = await getCompanyEntitlements(String(company._id));

  try {
    const resolved = resolveMeetingDuration(
      plan.maxMeetingDurationMinutes,
      type.durationOptionsMinutes,
      duration
    );

    const availability = await getAvailableSlots(
      String(company._id),
      date,
      resolved.durationMinutes,
      {
        bufferBeforeMinutes: type.bufferBeforeMinutes,
        bufferAfterMinutes: type.bufferAfterMinutes,
        maxConcurrentMeetings: plan.maxConcurrentMeetings
      }
    );

    return jsonOk({
      date,
      duration: resolved.durationMinutes,
      allowedDurationsMinutes: resolved.allowedDurationsMinutes,
      slots: availability.slots,
      availability: {
        reason: availability.reason,
        schedulingReadyMemberCount: availability.schedulingReadyMemberCount,
        scheduleConfiguredMemberCount:
          availability.scheduleConfiguredMemberCount,
        calendarErrorCount: availability.calendarErrorCount
      }
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "AVAILABILITY_FAILED";
    return jsonError(code, 400);
  }
}
