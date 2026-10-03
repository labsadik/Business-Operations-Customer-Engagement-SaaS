export type UserRole = "CUSTOMER" | "COMPANY_OWNER" | "COMPANY_ADMIN" | "EMPLOYEE" | "PLATFORM_ADMIN";

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