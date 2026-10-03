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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  {
  assertSameOrigin(request); params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { session } = await requireCompanyMember(["COMPANY_OWNER", "COMPANY_ADMIN"]);
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
      { $set: { active: false, googleConnectionStatus: "DISCONNECTED" } }
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
      role: { $in: ["COMPANY_OWNER", "COMPANY_ADMIN", "EMPLOYEE"] }
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
