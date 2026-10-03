import { getMongo } from "@/lib/mongodb";
import { Company } from "@/models/company";
import { MeetingType } from "@/models/meeting-type";
import { getAvailableSlots } from "@/lib/public-availability";
import { jsonError, jsonOk } from "@/lib/http";
import { getCompanyEntitlements } from "@/lib/plans-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ companySlug: string }> }
) {
  await getMongo();
  const { companySlug } = await params;
  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  const meetingTypeId = url.searchParams.get("meetingTypeId");
  const duration = Number(url.searchParams.get("duration") || 0);

  if (!date || !meetingTypeId || !Number.isInteger(duration) || duration <= 0) return jsonError("INVALID_AVAILABILITY_QUERY");

  const company = await Company.findOne({ slug: companySlug.toLowerCase(), publicBookingEnabled: true }).lean();
  if (!company) return jsonError("COMPANY_NOT_FOUND", 404);

  const type = await MeetingType.findOne({ _id: meetingTypeId, companyId: company._id, active: true }).lean();
  if (!type) return jsonError("MEETING_TYPE_NOT_FOUND", 404);

  const plan = await getCompanyEntitlements(String(company._id));
  if (duration > plan.maxMeetingDurationMinutes || !type.durationOptionsMinutes.includes(duration)) {
    return jsonError("INVALID_DURATION", 400);
  }

  try {
    const slots = await getAvailableSlots(String(company._id), date, duration);
    return jsonOk({ date, duration, slots });
  } catch (error) {
    const code = error instanceof Error ? error.message : "AVAILABILITY_FAILED";
    return jsonError(code, 400);
  }
}