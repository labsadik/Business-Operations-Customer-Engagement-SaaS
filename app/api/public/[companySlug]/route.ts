import { getMongo } from "@/lib/mongodb";
import { Company } from "@/models/company";
import { MeetingType } from "@/models/meeting-type";
import { Workspace } from "@/models/workspace";
import { getCompanyEntitlements } from "@/lib/plans-server";
import { getMeetingDurationOptions } from "@/lib/plans";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ companySlug: string }> }
) {
  await getMongo();
  const { companySlug } = await params;
  const company = await Company.findOne({ slug: companySlug.toLowerCase(), publicBookingEnabled: true }).lean();

  if (!company) return jsonError("COMPANY_NOT_FOUND", 404);
  if (company.planSuspended) return jsonError("PLAN_SUSPENDED", 423);

  const workspace = await Workspace.findOne({ companyId: company._id, active: true }).lean();
  if (!workspace) return jsonError("WORKSPACE_NOT_FOUND", 404);

  const plan = await getCompanyEntitlements(String(company._id));
  const meetingTypes = await MeetingType.find({
    companyId: company._id,
    workspaceId: workspace._id,
    active: true
  }).lean();

  return jsonOk({
    company: { id: String(company._id), name: company.name, slug: company.slug, description: company.description },
    timezone: workspace.timezone,
    limits: { maxMeetingDurationMinutes: plan.maxMeetingDurationMinutes },
    meetingTypes: meetingTypes.map((type) => ({
      id: String(type._id), name: type.name, slug: type.slug, description: type.description, durationOptionsMinutes: getMeetingDurationOptions(
          plan.maxMeetingDurationMinutes,
          type.durationOptionsMinutes
        )
    }))
  });
}