import { getMongo } from "@/lib/mongodb";
import { BookingRequest } from "@/models/booking-request";
import { Meeting } from "@/models/meeting";
import { User } from "@/models/user";
import { createCalendarEvent, getCalendarEvent } from "@/lib/google-calendar";
import { createMeetSpace } from "@/lib/google-meet";

function calendarEventIdForBooking(bookingId: string) {
  // Google Calendar event ids must use lower-case base32hex-compatible chars.
  return `conventus${bookingId}`;
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

  if (
    meeting.status === "READY" ||
    meeting.status === "LIVE" ||
    meeting.status === "COMPLETED"
  ) {
    if (booking.status !== "CONFIRMED") {
      booking.status = "CONFIRMED";
      booking.confirmedAt ??= new Date();
      await booking.save();
    }
    return meeting;
  }

  booking.status = "CREATING_MEETING";
  await booking.save();

  try {
    if (!meeting.googleMeetSpaceName || !meeting.googleMeetingUri) {
      const space = await createMeetSpace(String(employee._id));
      if (!space.name || !space.meetingUri) {
        throw new Error("GOOGLE_MEET_CREATE_INVALID");
      }

      meeting.googleMeetSpaceName = space.name;
      meeting.googleMeetingUri = space.meetingUri;
      meeting.status = "CREATING";
      await meeting.save();
    }

    if (!meeting.googleCalendarEventId) {
      const eventId = calendarEventIdForBooking(String(booking._id));
      let event;

      try {
        event = await createCalendarEvent(String(employee._id), {
          eventId,
          summary: `Conventus meeting with ${customer.name}`,
          description: `Conventus booking ${booking._id}`,
          startAt: booking.requestedStartAt,
          endAt: booking.requestedEndAt,
          attendeeEmails: [customer.email],
          meetingUri: meeting.googleMeetingUri!
        });
      } catch (error) {
        // A previous attempt may have created the deterministic event before
        // the process failed while persisting its id.
        if (error instanceof Error && error.message.startsWith("GOOGLE_API_409")) {
          event = await getCalendarEvent(String(employee._id), eventId);
        } else {
          throw error;
        }
      }

      meeting.googleCalendarEventId = event.id;
    }

    meeting.calendarSyncStatus = "SYNCED";
    meeting.status = "READY";
    await meeting.save();

    booking.status = "CONFIRMED";
    booking.confirmedAt = new Date();
    booking.assignedEmployeeId = meeting.employeeId;
    await booking.save();

    return meeting;
  } catch (error) {
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
