import { jsonError, jsonOk } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security";
import { requireCompanyMember } from "@/lib/authz";
import { getMongo } from "@/lib/mongodb";
import { Membership } from "@/models/membership";
import { User } from "@/models/user";
import { Invitation } from "@/models/invitation";
import { AvailabilityRule } from "@/models/availability-rule";
import { BookingRequest } from "@/models/booking-request";
import { Company } from "@/models/company";
import { GoogleAccount } from "@/models/google-account";
import { Session } from "@/models/session";
import { Types } from "mongoose";
import { isGoogleSchedulingReady } from "@/lib/google-scheduling";
import { isCompanyPlanSuspended } from "@/lib/plans-server";
import { isEmploymentStatus, normalizeUserProfileFields, USER_PROFILE_PATCH_FIELDS } from "@/lib/user-profile";
import type { EmploymentStatus } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    assertSameOrigin(request);
    const { session } = await requireCompanyMember(["COMPANY_ADMIN", "PLATFORM_ADMIN"]);
    if (session.role !== "PLATFORM_ADMIN" && await isCompanyPlanSuspended(session.companyId!)) {
      return jsonError("PLAN_SUSPENDED", 423);
    }
    await getMongo();
    const { userId } = await params;
    if (!Types.ObjectId.isValid(userId)) return jsonError("INVALID_EMPLOYEE_ID", 400);

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || Object.keys(body).some((key) => !(USER_PROFILE_PATCH_FIELDS as readonly string[]).includes(key))) {
      return jsonError("EMPLOYEE_PROFILE_INVALID", 400);
    }

    const normalizedProfile = normalizeUserProfileFields(body);
    if (normalizedProfile.invalidField) {
      return jsonError(normalizedProfile.invalidField === "jobTitle" ? "EMPLOYEE_JOB_TITLE_INVALID" : "EMPLOYEE_DEPARTMENT_INVALID", 400);
    }
    const userUpdate = normalizedProfile.update;

    let employmentStatus: EmploymentStatus | undefined;
    if (body.employmentStatus !== undefined) {
      if (!isEmploymentStatus(body.employmentStatus)) {
        return jsonError("EMPLOYEE_STATUS_INVALID", 400);
      }
      employmentStatus = body.employmentStatus;
    }
    if (Object.keys(userUpdate).length === 0 && employmentStatus === undefined) {
      return jsonError("EMPLOYEE_PROFILE_EMPTY", 400);
    }

    const membershipFilter = {
      companyId: session.companyId,
      userId: new Types.ObjectId(userId),
      active: true,
      role: { $in: ["COMPANY_ADMIN", "EMPLOYEE"] }
    };
    const membership = await Membership.findOne(membershipFilter)
      .select("userId role employmentStatus")
      .lean();
    if (!membership) return jsonError("EMPLOYEE_NOT_FOUND", 404);

    const user = Object.keys(userUpdate).length
      ? await User.findByIdAndUpdate(
          userId,
          { $set: userUpdate },
          { returnDocument: "after", runValidators: true }
        ).select("jobTitle department").lean()
      : await User.findById(userId).select("jobTitle department").lean();
    if (!user) return jsonError("EMPLOYEE_NOT_FOUND", 404);

    const updatedMembership = employmentStatus !== undefined
      ? await Membership.findOneAndUpdate(
          membershipFilter,
          { $set: { employmentStatus } },
          { returnDocument: "after", runValidators: true }
        ).select("userId employmentStatus").lean()
      : membership;
    if (!updatedMembership) return jsonError("EMPLOYEE_NOT_FOUND", 404);

    return jsonOk({
      userId: String(updatedMembership.userId),
      jobTitle: user.jobTitle ?? "",
      department: user.department ?? "",
      employmentStatus: updatedMembership.employmentStatus ?? "ACTIVE"
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "EMPLOYEE_PROFILE_UPDATE_FAILED";
    const status = code === "UNAUTHENTICATED" ? 401 : code === "FORBIDDEN" || code === "CSRF_ORIGIN_INVALID" ? 403 : 400;
    return jsonError(code, status);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    assertSameOrigin(request);
    const { session } = await requireCompanyMember(["COMPANY_ADMIN",
    "PLATFORM_ADMIN"
  ]);
    if (session.role !== "PLATFORM_ADMIN" && await isCompanyPlanSuspended(session.companyId!)) {
      return jsonError("PLAN_SUSPENDED", 423);
    }
    await getMongo();
    const { userId } = await params;

    if (!Types.ObjectId.isValid(userId)) return jsonError("INVALID_EMPLOYEE_ID", 400);
    if (userId === session.userId) return jsonError("CANNOT_REMOVE_SELF", 400);

    const membership = await Membership.findOne({
      companyId: session.companyId,
      userId,
      active: true
    }).lean();

    if (!membership) return jsonError("EMPLOYEE_NOT_FOUND", 404);
    if (membership.role !== "EMPLOYEE") return jsonError("ONLY_EMPLOYEES_CAN_BE_REMOVED", 409);

    const employee = await User.findById(userId).select("name email").lean();
    if (!employee) return jsonError("EMPLOYEE_NOT_FOUND", 404);

    const url = new URL(request.url);
    const permanent = url.searchParams.get("permanent") === "true";

    if (permanent) {
      const otherActiveMembership = await Membership.findOne({
        userId,
        active: true,
        companyId: { $ne: session.companyId }
      }).lean();

      if (otherActiveMembership) {
        return jsonError("EMPLOYEE_ACCOUNT_USED_BY_OTHER_COMPANY", 409);
      }
    }

    const meetingCreation = await BookingRequest.findOne({
      companyId: session.companyId,
      assignedEmployeeId: userId,
      status: "CREATING_MEETING",
      expiresAt: { $gt: new Date() }
    }).lean();

    if (meetingCreation) {
      return jsonError("EMPLOYEE_HAS_ACTIVE_MEETING_CREATION", 409);
    }

    const removalTime = new Date();

    await Membership.updateOne(
      { _id: membership._id },
      { $set: { active: false } }
    );

    await AvailabilityRule.updateMany(
      { companyId: session.companyId, employeeId: userId, active: true },
      { $set: { active: false } }
    );

    await BookingRequest.updateMany(
      {
        companyId: session.companyId,
        assignedEmployeeId: userId,
        status: { $in: ["ASSIGNED", "CREATING_MEETING"] },
        expiresAt: { $gt: removalTime }
      },
      {
        $set: {
          status: "RETRYING",
          assignedEmployeeId: null,
          nextRetryAt: removalTime
        }
      }
    );

    await Invitation.deleteMany({
      companyId: session.companyId,
      invitedEmail: employee.email,
      acceptedAt: null
    });

    const activeMembers = await Membership.find({
      companyId: session.companyId,
      active: true,
      role: { $in: ["COMPANY_ADMIN", "EMPLOYEE"] }
    }).select("userId").lean();

    const connectedAccounts = await GoogleAccount.find({
      userId: { $in: activeMembers.map((member) => member.userId) },
      status: "CONNECTED"
    }).select("userId status scopes").lean();

    const hasSchedulingEmployee = connectedAccounts.some(isGoogleSchedulingReady);
    if (!hasSchedulingEmployee) {
      await Company.updateOne(
        { _id: session.companyId, publicBookingEnabled: true },
        { $set: { publicBookingEnabled: false } }
      );
    }

    if (permanent) {
      await Invitation.deleteMany({ invitedEmail: employee.email });
      await Session.deleteMany({ userId });
      await GoogleAccount.deleteOne({ userId });
      await AvailabilityRule.deleteMany({ companyId: session.companyId, employeeId: userId });
      await Membership.deleteOne({ _id: membership._id });
      await User.deleteOne({ _id: userId });

      return jsonOk({
        userId,
        removed: true,
        permanentlyDeleted: true,
        publicBookingEnabled: hasSchedulingEmployee
      });
    }

    return jsonOk({
      userId,
      removed: true,
      permanentlyDeleted: false,
      publicBookingEnabled: hasSchedulingEmployee
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "EMPLOYEE_REMOVE_FAILED";
    const status = code === "UNAUTHENTICATED"
      ? 401
      : code === "FORBIDDEN"
        ? 403
        : code === "EMPLOYEE_NOT_FOUND"
          ? 404
          : 409;
    return jsonError(code, status);
  }
}
