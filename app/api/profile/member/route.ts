import { getMongo } from "@/lib/mongodb";
import { getSession } from "@/lib/session";
import { Company } from "@/models/company";
import { Membership } from "@/models/membership";
import { User } from "@/models/user";
import { assertSameOrigin } from "@/lib/security";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROFILE_FIELDS = "jobTitle department employmentStatus role";

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("UNAUTHENTICATED", 401);

  await getMongo();

  if (session.role === "PLATFORM_ADMIN") {
    const [user, company] = await Promise.all([
      User.findById(session.userId).select("jobTitle department active").lean(),
      session.companyId ? Company.findById(session.companyId).select("name").lean() : null
    ]);
    if (!user) return jsonError("USER_NOT_FOUND", 404);
    return jsonOk({
      companyName: company?.name ?? "Conventus Platform",
      role: session.role,
      jobTitle: user.jobTitle ?? "",
      department: user.department ?? "",
      employmentStatus: user.active === false ? "INACTIVE" : "ACTIVE",
      canEdit: true
    });
  }

  if (!session.companyId) return jsonError("COMPANY_NOT_CONFIGURED", 400);
  const membership = await Membership.findOne({
    companyId: session.companyId,
    userId: session.userId,
    ...(session.workspaceId ? { workspaceId: session.workspaceId } : {}),
    active: true,
    role: session.role
  }).select(PROFILE_FIELDS).lean();

  if (!membership) return jsonError("FORBIDDEN", 403);
  const company = await Company.findById(session.companyId).select("name").lean();
  return jsonOk({
    companyName: company?.name ?? "Company",
    role: session.role,
    jobTitle: membership.jobTitle ?? "",
    department: membership.department ?? "",
    employmentStatus: membership.employmentStatus ?? "ACTIVE",
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
      if (body.employmentStatus === "ON_LEAVE") {
        return jsonError("EMPLOYEE_STATUS_INVALID", 400);
      }
      const userUpdate: Record<string, unknown> = {
        ...(body.jobTitle !== undefined ? { jobTitle: update.jobTitle } : {}),
        ...(body.department !== undefined ? { department: update.department } : {}),
        ...(body.employmentStatus !== undefined ? { active: body.employmentStatus === "ACTIVE" } : {})
      };
      const user = await User.findByIdAndUpdate(
        session.userId,
        { $set: userUpdate },
        { new: true, runValidators: true }
      ).select("jobTitle department active").lean();
      if (!user) return jsonError("USER_NOT_FOUND", 404);
      return jsonOk({
        jobTitle: user.jobTitle ?? "",
        department: user.department ?? "",
        employmentStatus: user.active === false ? "INACTIVE" : "ACTIVE"
      });
    }

    if (!session.companyId) return jsonError("COMPANY_NOT_CONFIGURED", 400);
    const membership = await Membership.findOneAndUpdate(
      {
        companyId: session.companyId,
        userId: session.userId,
        ...(session.workspaceId ? { workspaceId: session.workspaceId } : {}),
        active: true,
        role: session.role
      },
      { $set: update },
      { new: true, runValidators: true }
    ).select(PROFILE_FIELDS).lean();

    if (!membership) return jsonError("FORBIDDEN", 403);
    return jsonOk({
      jobTitle: membership.jobTitle ?? "",
      department: membership.department ?? "",
      employmentStatus: membership.employmentStatus ?? "ACTIVE"
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PROFILE_UPDATE_FAILED";
    return jsonError(code, code === "CSRF_ORIGIN_INVALID" ? 403 : 400);
  }
}
