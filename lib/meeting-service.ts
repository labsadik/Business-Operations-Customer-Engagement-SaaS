import { getMongo } from "@/lib/mongodb";
import { BookingRequest } from "@/models/booking-request";
import { Meeting } from "@/models/meeting";
import { User } from "@/models/user";
import {
  createCalendarEvent,
  getCalendarEvent,
  type GoogleCalendarEvent
} from "@/lib/google-calendar";

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

export async function createMeetingForBooking(bookingId: string) {
  await getMongo();

  const booking = await BookingRequest.findById(bookingId);
  if (!booking) throw new Error("BOOKING_NOT_FOUND");
  if (!booking.assignedEmployeeId) throw new Error("EMPLOYEE_NOT_ASSIGNED");

  const employee = await User.findById(booking.assignedEmployeeId).lean();
  const customer = await User.findById(booking.customerId).lean();
  if (!employee || !customer) throw new Error("PARTICIPANT_NOT_FOUND");

  let meeting = await Meeting.findOne({ bookingRequestId: booking._id });

  if (!meeting) {
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
  }

  if (meeting.status === "COMPLETED" || meeting.status === "CANCELLED") {
    throw new Error("MEETING_ALREADY_ENDED");
  }

  if (meeting.status === "READY" || meeting.status === "LIVE") {
    if (booking.status !== "CONFIRMED") {
      booking.status = "CONFIRMED";
      booking.confirmedAt ??= new Date();
      await booking.save();
    }
    return meeting;
  }

  booking.status = "CREATING_MEETING";
  booking.assignedEmployeeId = meeting.employeeId;
  await booking.save();

  try {
    let event: GoogleCalendarEvent | null = null;

    if (!meeting.googleCalendarEventId) {
      const eventId = calendarEventIdForBooking(String(booking._id));
      const conferenceRequestId = conferenceRequestIdForBooking(String(booking._id));

      try {
        event = await createCalendarEvent(String(employee._id), {
          eventId,
          conferenceRequestId,
          summary: `Conventus meeting with ${customer.name}`,
          description: `Conventus booking ${booking._id}`,
          startAt: booking.requestedStartAt,
          endAt: booking.requestedEndAt,
          attendeeEmails: [customer.email]
        });
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("GOOGLE_API_409")) {
          event = await getCalendarEvent(String(employee._id), eventId);
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

    const resolvedEvent = event ?? (await getCalendarEvent(String(employee._id), eventId));
    const meetingUri = await waitForGoogleMeet(
      String(employee._id),
      eventId,
      resolvedEvent
    );

    meeting.googleMeetingUri = meetingUri;
    meeting.calendarSyncStatus = "SYNCED";
    meeting.status = "READY";
    await meeting.save();

    booking.status = "CONFIRMED";
    booking.confirmedAt = new Date();
    booking.assignedEmployeeId = meeting.employeeId;
    booking.nextRetryAt = undefined;
    await booking.save();

    return meeting;
  } catch (error) {
    if (error instanceof Error && error.message === "GOOGLE_MEET_PENDING") {
      meeting.status = "CREATING";
      meeting.calendarSyncStatus = "PENDING";
      await meeting.save();

      booking.status = "CREATING_MEETING";
      booking.assignedEmployeeId = meeting.employeeId;
      await booking.save();
      throw error;
    }

    meeting.status = "FAILED";
    meeting.calendarSyncStatus = "FAILED";
    await meeting.save();

    const stillActive = booking.expiresAt.getTime() > Date.now();
    booking.status = stillActive ? "RETRYING" : "EXPIRED";
    booking.assignedEmployeeId = undefined;
    booking.nextRetryAt = stillActive ? new Date(Date.now() + 20_000) : undefined;
    await booking.save();

    throw error;
  }
}
