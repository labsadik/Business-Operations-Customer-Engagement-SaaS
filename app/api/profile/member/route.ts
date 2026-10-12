import { getMongo } from "@/lib/mongodb";
import { getSession } from "@/lib/session";
import { Membership } from "@/models/membership";
import { User } from "@/models/user";
import { AvailabilityRule } from "@/models/availability-rule";
import { assertSameOrigin } from "@/lib/security";
import { jsonError, jsonOk } from "@/lib/http";
import { isCompanyPlanSuspended } from "@/lib/plans-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROFILE_FIELDS = "jobTitle department employmentStatus role";
const AVAILABILITY_FIELDS = "-_id dayOfWeek startMinute endMinute timezone";

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("UNAUTHENTICATED", 401);

  await getMongo();

  if (session.role === "PLATFORM_ADMIN") {
    const user = await User.findById(session.userId).select("jobTitle department active").lean();
    if (!user) return jsonError("USER_NOT_FOUND", 404);
    const workAvailability = session.companyId
      ? await AvailabilityRule.find({
          companyId: session.companyId,
          employeeId: session.userId,
          active: true
        }).select(AVAILABILITY_FIELDS).sort({ dayOfWeek: 1, startMinute: 1 }).limit(42).lean()
      : [];
    return jsonOk({
      role: session.role,
      jobTitle: user.jobTitle ?? "",
      department: user.department ?? "",
      employmentStatus: user.active === false ? "INACTIVE" : "ACTIVE",
      workAvailability,
      canEdit: true
    });
  }

  if (!session.companyId) return jsonError("COMPANY_NOT_CONFIGURED", 400);
  if (await isCompanyPlanSuspended(session.companyId)) return jsonError("PLAN_SUSPENDED", 423);
  const [membership, workAvailability] = await Promise.all([
    Membership.findOne({
      companyId: session.companyId,
      userId: session.userId,
      workspaceId: session.workspaceId,
      active: true,
      role: session.role
    }).select(PROFILE_FIELDS).lean(),
    AvailabilityRule.find({
      companyId: session.companyId,
      employeeId: session.userId,
      active: true
    }).select(AVAILABILITY_FIELDS).sort({ dayOfWeek: 1, startMinute: 1 }).limit(42).lean()
  ]);

  if (!membership) return jsonError("FORBIDDEN", 403);
  return jsonOk({
    role: session.role,
    jobTitle: membership.jobTitle ?? "",
    department: membership.department ?? "",
    employmentStatus: membership.employmentStatus ?? "ACTIVE",
    workAvailability,
    canEdit: true
  });
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await getSession();
    if (!session) return jsonError("UNAUTHENTICATED", 401);

    const body = await request.json().catch(() => null) as {
      jobTitle?: unknown;
      department?: unknown;
      employmentStatus?: unknown;
    } | null;
    const allowedFields = ["jobTitle", "department", "employmentStatus"];
    if (!body || Object.keys(body).some((key) => !allowedFields.includes(key))) {
      return jsonError("PROFILE_FIELDS_INVALID", 400);
    }

    const update: Record<string, unknown> = {};
    if (body.jobTitle !== undefined) {
      if (typeof body.jobTitle !== "string" || body.jobTitle.trim().length > 120) {
        return jsonError("JOB_TITLE_INVALID", 400);
      }
      update.jobTitle = body.jobTitle.trim();
    }
    if (body.department !== undefined) {
      if (typeof body.department !== "string" || body.department.trim().length > 100) {
        return jsonError("DEPARTMENT_INVALID", 400);
      }
      update.department = body.department.trim();
    }
    if (body.employmentStatus !== undefined) {
      if (!["ACTIVE", "ON_LEAVE", "INACTIVE"].includes(String(body.employmentStatus))) {
        return jsonError("EMPLOYEE_STATUS_INVALID", 400);
      }
      update.employmentStatus = body.employmentStatus;
    }
    if (Object.keys(update).length === 0) return jsonError("PROFILE_UPDATE_EMPTY", 400);

    await getMongo();

    if (session.role === "PLATFORM_ADMIN") {
      if (body.employmentStatus !== undefined) {
        return jsonError("EMPLOYMENT_STATUS_NOT_APPLICABLE", 400);
      }
      const userUpdate: Record<string, unknown> = {
        ...(body.jobTitle !== undefined ? { jobTitle: update.jobTitle } : {}),
        ...(body.department !== undefined ? { department: update.department } : {})
      };
      const user = await User.findByIdAndUpdate(
        session.userId,
        { $set: userUpdate },
        { returnDocument: "after", runValidators: true }
      ).select("jobTitle department active").lean();
      if (!user) return jsonError("USER_NOT_FOUND", 404);
      return jsonOk({
        jobTitle: user.jobTitle ?? "",
        department: user.department ?? "",
        employmentStatus: user.active === false ? "INACTIVE" : "ACTIVE"
      });
    }

    if (!session.companyId || !session.workspaceId) return jsonError("COMPANY_NOT_CONFIGURED", 400);
    if (await isCompanyPlanSuspended(session.companyId)) return jsonError("PLAN_SUSPENDED", 423);
    const membership = await Membership.findOneAndUpdate(
      {
        companyId: session.companyId,
        workspaceId: session.workspaceId,
        userId: session.userId,
        active: true,
        role: session.role
      },
      { $set: update },
      { returnDocument: "after", runValidators: true }
    ).select(PROFILE_FIELDS).lean();

    if (!membership) return jsonError("FORBIDDEN", 403);
    return jsonOk({
      jobTitle: membership.jobTitle ?? "",
      department: membership.department ?? "",
      employmentStatus: membership.employmentStatus ?? "ACTIVE"
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PROFILE_UPDATE_FAILED";
    return jsonError(code, code === "CSRF_ORIGIN_INVALID" ? 403 : code === "PLAN_SUSPENDED" ? 423 : 400);
  }
}
