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
  MEETING_NOT_READY: "This meeting is still being prepared."
};

export function friendlyBookingMessage(code: string) {
  return FRIENDLY_MESSAGES[code] ?? "We could not complete that meeting action. The request will refresh to its current server state.";
}
