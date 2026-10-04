import { getMongo } from "@/lib/mongodb";
import { BookingRequest } from "@/models/booking-request";
import { Meeting } from "@/models/meeting";
import { User } from "@/models/user";
import { Membership } from "@/models/membership";
import {
  createCalendarEvent,
  getCalendarEvent,
  type GoogleCalendarEvent
} from "@/lib/google-calendar";
import { bookingErrorCode } from "@/lib/booking-errors";
import { recordBookingActivity, releaseMeetingUsage } from "@/lib/booking-history";

function calendarEventIdForBooking(bookingId: string) {
  return `conventus${bookingId}`;
}

function conferenceRequestIdForBooking(bookingId: string) {
  return `conventus-${bookingId}`;
}

function googleMeetUri(event: GoogleCalendarEvent | null | undefined) {
  if (event?.hangoutLink) return event.hangoutLink;
  return (
    event?.conferenceData?.entryPoints?.find(
      (entryPoint) => entryPoint.entryPointType === "video" && entryPoint.uri
    )?.uri ?? null
  );
}

function conferenceStatus(event: GoogleCalendarEvent | null | undefined) {
  return event?.conferenceData?.createRequest?.status?.statusCode?.toLowerCase() ?? null;
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForGoogleMeet(
  employeeId: string,
  eventId: string,
  initialEvent: GoogleCalendarEvent
) {
  const immediateUri = googleMeetUri(initialEvent);
  if (immediateUri) return immediateUri;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    await wait(1000);
    const event = await getCalendarEvent(employeeId, eventId);
    const uri = googleMeetUri(event);
    if (uri) return uri;

    if (conferenceStatus(event) === "failure") {
      throw new Error("GOOGLE_MEET_CONFERENCE_FAILED");
    }
  }

  throw new Error("GOOGLE_MEET_PENDING");
}

async function recordFailure(
  booking: {
    companyId: unknown;
    _id: unknown;
    status: string;
    expiresAt: Date;
    assignedEmployeeId?: unknown;
    nextRetryAt?: Date;
  },
  meeting: {
    companyId: unknown;
    _id: unknown;
    googleCalendarEventId?: string;
    employeeId: unknown;
    status: string;
    calendarSyncStatus: string;
  },
  error: unknown
) {
  const code = bookingErrorCode(error);
  const stillActive = booking.expiresAt.getTime() > Date.now();

  if (meeting.googleCalendarEventId) {
    meeting.status = "CREATING";
    meeting.calendarSyncStatus = "PENDING";
    await meeting.save();

    booking.status = stillActive ? "CREATING_MEETING" : "EXPIRED";
    booking.assignedEmployeeId = stillActive ? meeting.employeeId : undefined;
    booking.nextRetryAt = stillActive
      ? new Date(Date.now() + 20_000)
      : undefined;
    booking.lastMeetingErrorCode = code;
    booking.meetingCreationStartedAt = new Date();
    await booking.save();

    await recordBookingActivity({
      companyId: String(booking.companyId),
      bookingRequestId: String(booking._id),
      eventType: "MEETING_CREATION_FAILED",
      fromStatus: "CREATING_MEETING",
      toStatus: booking.status,
      outcome: stillActive ? "RETRYING" : "EXPIRED",
      actorRole: "SYSTEM",
      employeeId: String(meeting.employeeId),
      reasonCode: code
    });

    if (!stillActive) {
      await releaseMeetingUsage({
        bookingId: String(booking._id),
        companyId: String(booking.companyId)
      });
      await recordBookingActivity({
        companyId: String(booking.companyId),
        bookingRequestId: String(booking._id),
        eventType: "REQUEST_EXPIRED",
        fromStatus: "CREATING_MEETING",
        toStatus: "EXPIRED",
        outcome: "EXPIRED",
        actorRole: "SYSTEM",
        employeeId: String(meeting.employeeId)
      });
    }
    return code;
  }

  meeting.status = "FAILED";
  meeting.calendarSyncStatus = "FAILED";
  await meeting.save();

  booking.status = stillActive ? "RETRYING" : "EXPIRED";
  booking.assignedEmployeeId = undefined;
  booking.nextRetryAt = stillActive
    ? new Date(Date.now() + 20_000)
    : undefined;
  booking.lastMeetingErrorCode = code;
  booking.meetingCreationStartedAt = new Date();
  await booking.save();

  await recordBookingActivity({
    companyId: String(booking.companyId),
    bookingRequestId: String(booking._id),
    eventType: "MEETING_CREATION_FAILED",
    fromStatus: "CREATING_MEETING",
    toStatus: booking.status,
    outcome: stillActive ? "RETRYING" : "EXPIRED",
    actorRole: "SYSTEM",
    employeeId: meeting.employeeId ? String(meeting.employeeId) : null,
    reasonCode: code
  });

  if (!stillActive) {
    await releaseMeetingUsage({
      bookingId: String(booking._id),
      companyId: String(booking.companyId)
    });
    await recordBookingActivity({
      companyId: String(booking.companyId),
      bookingRequestId: String(booking._id),
      eventType: "REQUEST_EXPIRED",
      fromStatus: "CREATING_MEETING",
      toStatus: "EXPIRED",
      outcome: "EXPIRED",
      actorRole: "SYSTEM"
    });
  }
  return code;
}

export async function createMeetingForBooking(bookingId: string) {
  await getMongo();

  const booking = await BookingRequest.findById(bookingId);
  if (!booking) throw new Error("BOOKING_NOT_FOUND");
  if (!booking.assignedEmployeeId) throw new Error("EMPLOYEE_NOT_ASSIGNED");

  if (booking.expiresAt.getTime() <= Date.now()) {
    const previousStatus = booking.status;
    booking.status = "EXPIRED";
    booking.assignedEmployeeId = undefined;
    booking.nextRetryAt = undefined;
    await booking.save();
    await releaseMeetingUsage({
      bookingId,
      companyId: String(booking.companyId)
    });
    await recordBookingActivity({
      companyId: String(booking.companyId),
      bookingRequestId: bookingId,
      eventType: "REQUEST_EXPIRED",
      fromStatus: previousStatus,
      toStatus: "EXPIRED",
      outcome: "EXPIRED",
      actorRole: "SYSTEM"
    });
    throw new Error("BOOKING_EXPIRED");
  }

  const employee = await User.findById(booking.assignedEmployeeId).lean();
  const customer = await User.findById(booking.customerId).lean();
  if (!employee || !customer) throw new Error("PARTICIPANT_NOT_FOUND");

  const membership = await Membership.findOne({
    companyId: booking.companyId,
    userId: booking.assignedEmployeeId,
    active: true
  }).lean();
  if (!membership) throw new Error("EMPLOYEE_NOT_AVAILABLE");

  let meeting = await Meeting.findOne({
    bookingRequestId: booking._id,
    companyId: booking.companyId
  });

  if (!meeting) {
    try {
      meeting = await Meeting.create({
        companyId: booking.companyId,
        bookingRequestId: booking._id,
        employeeId: booking.assignedEmployeeId,
        customerId: booking.customerId,
        startAt: booking.requestedStartAt,
        endAt: booking.requestedEndAt,
        status: "CREATING",
        calendarSyncStatus: "PENDING"
      });
    } catch (error) {
      const duplicate = await Meeting.findOne({
        bookingRequestId: booking._id,
        companyId: booking.companyId
      });
      if (!duplicate) throw error;
      meeting = duplicate;
    }
  }

  if (meeting.status === "COMPLETED" || meeting.status === "CANCELLED") {
    throw new Error("MEETING_ALREADY_ENDED");
  }

  if (meeting.status === "READY" || meeting.status === "LIVE") {
    if (booking.status !== "CONFIRMED") {
      booking.status = "CONFIRMED";
      booking.confirmedAt ??= new Date();
      booking.nextRetryAt = undefined;
      booking.lastMeetingErrorCode = undefined;
      await booking.save();
    }
    return meeting;
  }

  if (
    meeting.googleCalendarEventId &&
    String(meeting.employeeId) !== String(booking.assignedEmployeeId)
  ) {
    booking.assignedEmployeeId = meeting.employeeId;
    await booking.save();
  }

  if (
    meeting.status === "FAILED" &&
    !meeting.googleCalendarEventId
  ) {
    meeting.employeeId = booking.assignedEmployeeId;
    meeting.customerId = booking.customerId;
    meeting.startAt = booking.requestedStartAt;
    meeting.endAt = booking.requestedEndAt;
    meeting.status = "CREATING";
    meeting.calendarSyncStatus = "PENDING";
    await meeting.save();
  }

  if (booking.status !== "CREATING_MEETING") {
    const fromStatus = booking.status;
    booking.status = "CREATING_MEETING";
    booking.assignedEmployeeId = meeting.employeeId;
    booking.nextRetryAt = new Date(Date.now() + 20_000);
    booking.meetingCreationStartedAt = new Date();
    await booking.save();

    await recordBookingActivity({
      companyId: String(booking.companyId),
      bookingRequestId: bookingId,
      eventType: "MEETING_CREATING",
      fromStatus,
      toStatus: "CREATING_MEETING",
      outcome: "ACCEPTED",
      actorRole: "SYSTEM",
      employeeId: String(meeting.employeeId)
    });
  } else {
    booking.nextRetryAt = new Date(Date.now() + 20_000);
    booking.meetingCreationStartedAt = new Date();
    booking.meetingCreationAttempts = (booking.meetingCreationAttempts ?? 0) + 1;
    await booking.save();
  }

  try {
    let event: GoogleCalendarEvent | null = null;

    if (!meeting.googleCalendarEventId) {
      const eventId = calendarEventIdForBooking(String(booking._id));
      const conferenceRequestId = conferenceRequestIdForBooking(String(booking._id));

      try {
        event = await createCalendarEvent(String(meeting.employeeId), {
          eventId,
          conferenceRequestId,
          summary: `Conventus meeting with ${customer.name}`,
          description: `Conventus booking ${String(booking._id)}`,
          startAt: booking.requestedStartAt,
          endAt: booking.requestedEndAt,
          attendeeEmails: [customer.email]
        });
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("GOOGLE_API_409")) {
          event = await getCalendarEvent(String(meeting.employeeId), eventId);
        } else {
          throw error;
        }
      }

      if (!event?.id) throw new Error("GOOGLE_CALENDAR_EVENT_INVALID");
      meeting.googleCalendarEventId = event.id;
      await meeting.save();
    }

    const eventId = meeting.googleCalendarEventId;
    if (!eventId) throw new Error("GOOGLE_CALENDAR_EVENT_MISSING");

    const resolvedEvent = event ?? (await getCalendarEvent(String(meeting.employeeId), eventId));
    const meetingUri = await waitForGoogleMeet(
      String(meeting.employeeId),
      eventId,
      resolvedEvent
    );

    meeting.googleMeetingUri = meetingUri;
    meeting.calendarSyncStatus = "SYNCED";
    meeting.status = "READY";
    await meeting.save();

    const fromStatus = booking.status;
    booking.status = "CONFIRMED";
    booking.confirmedAt ??= new Date();
    booking.assignedEmployeeId = meeting.employeeId;
    booking.nextRetryAt = undefined;
    booking.lastMeetingErrorCode = undefined;
    booking.meetingCreationStartedAt = undefined;
    await booking.save();

    if (fromStatus !== "CONFIRMED") {
      await recordBookingActivity({
        companyId: String(booking.companyId),
        bookingRequestId: bookingId,
        eventType: "MEETING_CONFIRMED",
        fromStatus,
        toStatus: "CONFIRMED",
        outcome: "CONFIRMED",
        actorRole: "SYSTEM",
        employeeId: String(meeting.employeeId)
      });
    }

    return meeting;
  } catch (error) {
    const code = await recordFailure(booking, meeting, error);
    if (code === "GOOGLE_MEET_PENDING" && booking.status !== "EXPIRED") {
      await recordBookingActivity({
        companyId: String(booking.companyId),
        bookingRequestId: bookingId,
        eventType: "RETRY_SCHEDULED",
        fromStatus: "CREATING_MEETING",
        toStatus: "CREATING_MEETING",
        outcome: "RETRYING",
        actorRole: "SYSTEM",
        employeeId: String(meeting.employeeId),
        reasonCode: code
      });
    } else if (booking.status === "RETRYING") {
      await recordBookingActivity({
        companyId: String(booking.companyId),
        bookingRequestId: bookingId,
        eventType: "RETRY_SCHEDULED",
        fromStatus: "CREATING_MEETING",
        toStatus: "RETRYING",
        outcome: "RETRYING",
        actorRole: "SYSTEM",
        reasonCode: code
      });
    }
    throw error;
  }
}
