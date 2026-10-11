const FRIENDLY_MESSAGES: Record<string, string> = {
  BOOKING_NOT_FOUND: "This meeting request could not be found.",
  BOOKING_ALREADY_ASSIGNED: "This request is already being handled by another team member.",
  BOOKING_PROCESSING: "This request is being processed. The latest status will appear shortly.",
  BOOKING_ALREADY_CONFIRMED: "This request is already confirmed. Open the meeting from the current request state.",
  BOOKING_DECLINED_BY_EMPLOYEE: "You already declined this request, so it is no longer available to you.",
  BOOKING_EXPIRED: "This meeting request has expired and can no longer be accepted.",
  BOOKING_NO_LONGER_AVAILABLE: "This meeting request is no longer available.",
  EMPLOYEE_NOT_AVAILABLE: "You are no longer available for this time. The request was returned for teammate routing.",
  CONCURRENT_MEETING_LIMIT: "Your company has reached its concurrent meeting limit for this time.",
  MONTHLY_MEETING_LIMIT: "Your plan has reached its monthly meeting limit.",
  MEETING_DURATION_LIMIT: "This meeting duration is above the current plan limit.",
  INVALID_DURATION: "This meeting duration is no longer allowed by the current meeting type or plan.",
  MEETING_DURATION_NOT_CONFIGURED: "This meeting type has no valid duration configured for the current plan.",
  INVALID_TIME_RANGE: "The selected time no longer matches the configured meeting duration.",
  WORKSPACE_NOT_FOUND: "The workspace scheduling configuration is no longer available.",
  MEETING_TYPE_NOT_FOUND: "The meeting type is no longer available.",
  RESOURCE_BUSY: "Another response is being processed. The request will refresh automatically.",
  GOOGLE_NOT_CONNECTED: "Google Calendar is not connected for this team member.",
  GOOGLE_TOKEN_REFRESH_FAILED: "Google Calendar needs to be reconnected before this meeting can be created.",
  GOOGLE_SCHEDULING_CONNECTION_REQUIRED: "Google Calendar scheduling access is required for this meeting.",
  GOOGLE_MEET_CONFERENCE_FAILED: "Google Meet could not be created. The request has been returned to retryable status.",
  GOOGLE_CALENDAR_EVENT_INVALID: "Google Calendar returned an invalid meeting event. The request has been returned to retryable status.",
  GOOGLE_CALENDAR_EVENT_MISSING: "The Google Calendar event could not be recovered. The request can be retried.",
  PARTICIPANT_NOT_FOUND: "A meeting participant is no longer available.",
  EMPLOYEE_NOT_ASSIGNED: "No team member is currently assigned to this request.",
  MEETING_NOT_FOUND: "The meeting record could not be found.",
  MEETING_ALREADY_ENDED: "This meeting has already ended.",
  MEETING_NOT_READY: "This meeting is still being prepared.",
  BOOKING_ALREADY_COMPLETED: "This booking has already been completed.",
  BOOKING_CANCELLED: "This booking has been cancelled and can no longer be accepted.",
  BOOKING_FAILED: "Meeting setup failed. The request can be retried after the underlying issue is resolved.",
  UNAUTHENTICATED: "Please sign in again to respond to this meeting request.",
  FORBIDDEN: "You do not have permission to respond to this meeting request.",
  COMPANY_NOT_CONFIGURED: "Your workspace company is not configured correctly.",
  PLAN_SUSPENDED: "Your company plan is suspended or expired. Purchase a plan or ask your platform administrator to restore access.",
  GOOGLE_API_400: "Google Calendar rejected the meeting request. Please check the connected calendar settings.",
  GOOGLE_API_401: "Google Calendar authentication needs to be refreshed.",
  GOOGLE_API_403: "The connected Google account does not have the required Calendar permission.",
  GOOGLE_API_404: "The Google Calendar event could not be found.",
  GOOGLE_API_409: "Google Calendar already has the deterministic event for this booking. Conventus will recover it safely.",
  GOOGLE_API_429: "Google Calendar is temporarily rate-limiting requests. Conventus will retry safely.",
  GOOGLE_API_500: "Google Calendar returned a temporary server error. Conventus will retry safely.",
  GOOGLE_API_502: "Google Calendar returned a temporary server error. Conventus will retry safely.",
  GOOGLE_API_503: "Google Calendar is temporarily unavailable. Conventus will retry safely.",
  FREE_FEATURE_DAYS_EXHAUSTED: "The free-plan trial window has ended for this workspace.",
  PLATFORM_ADMIN_CANNOT_ACCEPT_AS_EMPLOYEE: "Platform administrators cannot accept a meeting as an employee.",
  CSRF_ORIGIN_INVALID: "The request origin could not be verified."
};

export function friendlyBookingMessage(code: string) {
  const knownMessage = FRIENDLY_MESSAGES[code];
  if (knownMessage) return knownMessage;

  if (/^GOOGLE_API_[45]\d\d$/.test(code)) {
    return "Google Calendar returned a temporary or permission error. Conventus will refresh the meeting state and retry when safe.";
  }

  return "We could not complete that meeting action. The request will refresh to its current server state.";
}

export function bookingErrorCode(error: unknown) {
  const raw = error instanceof Error ? error.message : "";
  if (!raw) return "BOOKING_ACTION_FAILED";
  if (raw.startsWith("GOOGLE_API_")) return raw.split(":")[0].slice(0, 100);
  return raw.slice(0, 100);
}
