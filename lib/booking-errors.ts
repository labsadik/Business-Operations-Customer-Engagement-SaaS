import { NextResponse } from "next/server";
import {
  bookingErrorCode,
  friendlyBookingMessage
} from "@/lib/booking-error-codes";

export { bookingErrorCode, friendlyBookingMessage };

export function bookingJsonError(code: string, status: number, details?: unknown) {
  return NextResponse.json(
    {
      ok: false,
      error: code,
      message: friendlyBookingMessage(code),
      ...(details !== undefined ? { details } : {})
    },
    { status }
  );
}
