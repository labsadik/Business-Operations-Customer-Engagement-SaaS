import { getMongo } from "@/lib/mongodb";
import { BookingRequest } from "@/models/booking-request";
import { Meeting } from "@/models/meeting";
import { User } from "@/models/user";
import { createCalendarEvent } from "@/lib/google-calendar";
import { createMeetSpace } from "@/lib/google-meet";

export async function createMeetingForBooking(bookingId: string) {
  await getMongo();

  const booking = await BookingRequest.findById(bookingId);
  if (!booking) throw new Error("BOOKING_NOT_FOUND");
  if (!booking.assignedEmployeeId) throw new Error("EMPLOYEE_NOT_ASSIGNED");

  const existing = await Meeting.findOne({ bookingRequestId: booking._id });
  if (existing?.status === "READY" || existing?.status === "LIVE" || existing?.status === "COMPLETED") {
    return existing;
  }

  const employee = await User.findById(booking.assignedEmployeeId).lean();
  const customer = await User.findById(booking.customerId).lean();
  if (!employee || !customer) throw new Error("PARTICIPANT_NOT_FOUND");

  const meeting = await Meeting.findOneAndUpdate(
    { bookingRequestId: booking._id },
    {
      $setOnInsert: {
        companyId: booking.companyId,
        bookingRequestId: booking._id,
        employeeId: booking.assignedEmployeeId,
        customerId: booking.customerId,
        startAt: booking.requestedStartAt,
        endAt: booking.requestedEndAt,
        status: "CREATING",
        calendarSyncStatus: "PENDING"
      }
    },
    { upsert: true, new: true }
  );

  if (meeting.googleMeetSpaceName && meeting.googleMeetingUri) return meeting;

  try {
    const space = await createMeetSpace(String(employee._id));
    if (!space.name || !space.meetingUri) throw new Error("GOOGLE_MEET_CREATE_INVALID");

    const event = await createCalendarEvent(String(employee._id), {
      summary: `Conventus meeting with ${customer.name}`,
      description: `Conventus booking ${booking._id}`,
      startAt: booking.requestedStartAt,
      endAt: booking.requestedEndAt,
      attendeeEmails: [customer.email],
      meetingUri: space.meetingUri
    });

    meeting.googleMeetSpaceName = space.name;
    meeting.googleMeetingUri = space.meetingUri;
    meeting.googleCalendarEventId = event.id;
    meeting.calendarSyncStatus = "SYNCED";
    meeting.status = "READY";
    await meeting.save();

    booking.status = "CONFIRMED";
    booking.confirmedAt = new Date();
    await booking.save();

    return meeting;
  } catch (error) {
    meeting.status = "FAILED";
    meeting.calendarSyncStatus = "FAILED";
    await meeting.save();

    booking.status = "RETRYING";
    booking.assignedEmployeeId = undefined;
    booking.nextRetryAt = new Date(Date.now() + 20_000);
    await booking.save();

    throw error;
  }
}