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
    } | null;
    if (typeof body?.jobTitle !== "string" || typeof body.department !== "string") {
      return jsonError("PROFILE_FIELDS_REQUIRED", 400);
    }

    const jobTitle = body.jobTitle.trim();
    const department = body.department.trim();
    if (jobTitle.length > 120) return jsonError("JOB_TITLE_TOO_LONG", 400);
    if (department.length > 100) return jsonError("DEPARTMENT_TOO_LONG", 400);

    await getMongo();

    if (session.role === "PLATFORM_ADMIN") {
      const user = await User.findByIdAndUpdate(
        session.userId,
        { $set: { jobTitle, department } },
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
      { $set: { jobTitle, department } },
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
