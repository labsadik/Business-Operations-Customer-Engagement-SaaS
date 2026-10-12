import { EMPLOYMENT_STATUSES, type EmploymentStatus } from "@/types/domain";

export const USER_PROFILE_PATCH_FIELDS = ["jobTitle", "department", "employmentStatus"] as const;
export const USER_JOB_TITLE_MAX_LENGTH = 120;
export const USER_DEPARTMENT_MAX_LENGTH = 100;

export type UserProfileFieldUpdate = {
  jobTitle?: string;
  department?: string;
};

export type InvalidUserProfileField = "jobTitle" | "department";

export function normalizeUserProfileFields(
  body: Record<string, unknown>
): { update: UserProfileFieldUpdate; invalidField?: InvalidUserProfileField } {
  const update: UserProfileFieldUpdate = {};

  if (body.jobTitle !== undefined) {
    if (typeof body.jobTitle !== "string" || body.jobTitle.trim().length > USER_JOB_TITLE_MAX_LENGTH) {
      return { update, invalidField: "jobTitle" };
    }
    update.jobTitle = body.jobTitle.trim();
  }

  if (body.department !== undefined) {
    if (typeof body.department !== "string" || body.department.trim().length > USER_DEPARTMENT_MAX_LENGTH) {
      return { update, invalidField: "department" };
    }
    update.department = body.department.trim();
  }

  return { update };
}

export function isEmploymentStatus(value: unknown): value is EmploymentStatus {
  return typeof value === "string" && (EMPLOYMENT_STATUSES as readonly string[]).includes(value);
}
