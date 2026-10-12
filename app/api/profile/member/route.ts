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

const MEMBERSHIP_FIELDS = "employmentStatus role";
const USER_PROFILE_FIELDS = "jobTitle department";
const AVAILABILITY_FIELDS = "-_id dayOfWeek startMinute endMinute timezone";

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("UNAUTHENTICATED", 401);

  await getMongo();

  if (session.role === "PLATFORM_ADMIN") {
    const [user, workAvailability] = await Promise.all([
      User.findById(session.userId).select("jobTitle department active").lean(),
      session.companyId
        ? AvailabilityRule.find({
            companyId: session.companyId,
            employeeId: session.userId,
            active: true
          }).select(AVAILABILITY_FIELDS).sort({ dayOfWeek: 1, startMinute: 1 }).limit(42).lean()
        : Promise.resolve([])
    ]);
    if (!user) return jsonError("USER_NOT_FOUND", 404);
    return jsonOk({
      role: session.role,
      jobTitle: user.jobTitle ?? "",
      department: user.department ?? "",
      employmentStatus: user.active === false ? "INACTIVE" : "ACTIVE",
      workAvailability,
      canEdit: true
    });
  }

  if (!session.companyId || !session.workspaceId) return jsonError("COMPANY_NOT_CONFIGURED", 400);
  if (await isCompanyPlanSuspended(session.companyId)) return jsonError("PLAN_SUSPENDED", 423);

  const [membership, user, workAvailability] = await Promise.all([
    Membership.findOne({
      companyId: session.companyId,
      userId: session.userId,
      workspaceId: session.workspaceId,
      active: true,
      role: session.role
    }).select(MEMBERSHIP_FIELDS).lean(),
    User.findById(session.userId).select(USER_PROFILE_FIELDS).lean(),
    AvailabilityRule.find({
      companyId: session.companyId,
      employeeId: session.userId,
      active: true
    }).select(AVAILABILITY_FIELDS).sort({ dayOfWeek: 1, startMinute: 1 }).limit(42).lean()
  ]);

  if (!membership) return jsonError("FORBIDDEN", 403);
  if (!user) return jsonError("USER_NOT_FOUND", 404);
  return jsonOk({
    role: session.role,
    jobTitle: user.jobTitle ?? "",
    department: user.department ?? "",
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

    const userUpdate: Record<string, string> = {};
    if (body.jobTitle !== undefined) {
      if (typeof body.jobTitle !== "string" || body.jobTitle.trim().length > 120) {
        return jsonError("JOB_TITLE_INVALID", 400);
      }
      userUpdate.jobTitle = body.jobTitle.trim();
    }
    if (body.department !== undefined) {
      if (typeof body.department !== "string" || body.department.trim().length > 100) {
        return jsonError("DEPARTMENT_INVALID", 400);
      }
      userUpdate.department = body.department.trim();
    }

    let employmentStatus: "ACTIVE" | "ON_LEAVE" | "INACTIVE" | undefined;
    if (body.employmentStatus !== undefined) {
      if (!["ACTIVE", "ON_LEAVE", "INACTIVE"].includes(String(body.employmentStatus))) {
        return jsonError("EMPLOYEE_STATUS_INVALID", 400);
      }
      employmentStatus = body.employmentStatus as "ACTIVE" | "ON_LEAVE" | "INACTIVE";
    }
    if (Object.keys(userUpdate).length === 0 && employmentStatus === undefined) {
      return jsonError("PROFILE_UPDATE_EMPTY", 400);
    }

    await getMongo();

    if (session.role === "PLATFORM_ADMIN") {
      if (employmentStatus !== undefined) {
        return jsonError("EMPLOYMENT_STATUS_NOT_APPLICABLE", 400);
      }
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

    const membershipFilter = {
      companyId: session.companyId,
      workspaceId: session.workspaceId,
      userId: session.userId,
      active: true,
      role: session.role
    };
    const existingMembership = await Membership.findOne(membershipFilter)
      .select(MEMBERSHIP_FIELDS)
      .lean();
    if (!existingMembership) return jsonError("FORBIDDEN", 403);

    const user = Object.keys(userUpdate).length
      ? await User.findByIdAndUpdate(
          session.userId,
          { $set: userUpdate },
          { returnDocument: "after", runValidators: true }
        ).select(USER_PROFILE_FIELDS).lean()
      : await User.findById(session.userId).select(USER_PROFILE_FIELDS).lean();
    if (!user) return jsonError("USER_NOT_FOUND", 404);

    const membership = employmentStatus !== undefined
      ? await Membership.findOneAndUpdate(
          membershipFilter,
          { $set: { employmentStatus } },
          { returnDocument: "after", runValidators: true }
        ).select(MEMBERSHIP_FIELDS).lean()
      : existingMembership;
    if (!membership) return jsonError("FORBIDDEN", 403);

    return jsonOk({
      jobTitle: user.jobTitle ?? "",
      department: user.department ?? "",
      employmentStatus: membership.employmentStatus ?? "ACTIVE"
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PROFILE_UPDATE_FAILED";
    return jsonError(code, code === "CSRF_ORIGIN_INVALID" ? 403 : code === "PLAN_SUSPENDED" ? 423 : 400);
  }
}
