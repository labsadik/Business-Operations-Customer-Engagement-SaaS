export const USER_ROLES = ["PLATFORM_ADMIN", "COMPANY_ADMIN", "EMPLOYEE", "CUSTOMER"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const COMPANY_MEMBER_ROLES = ["COMPANY_ADMIN", "EMPLOYEE"] as const;
export type CompanyMemberRole = (typeof COMPANY_MEMBER_ROLES)[number];

export const EMPLOYMENT_STATUSES = ["ACTIVE", "ON_LEAVE", "INACTIVE"] as const;
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];

export const BILLING_SOURCES = ["FREE", "PAID", "ADMIN_GRANTED"] as const;
export type BillingSource = (typeof BILLING_SOURCES)[number];

export const RESTORABLE_USER_ROLES = ["COMPANY_ADMIN", "EMPLOYEE", "CUSTOMER"] as const;

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && (USER_ROLES as readonly string[]).includes(value);
}

export type GoogleConnectionStatus = "CONNECTED" | "REAUTH_REQUIRED" | "DISCONNECTED";

export type BookingRequestRecord = {
  id: string;
  companyId: string;
  workspaceId: string;
  customerId: string;
  meetingTypeId: string;
  requestedStartAt: string;
  requestedEndAt: string;
  requestedDurationMinutes: number;
  status: string;
  expiresAt: string;
};

export type MeetingRecord = {
  id: string;
  companyId: string;
  bookingRequestId: string;
  employeeId: string;
  customerId: string;
  startAt: string;
  endAt: string;
  googleMeetSpaceName?: string;
  googleMeetingUri?: string;
  googleCalendarEventId?: string;
};
