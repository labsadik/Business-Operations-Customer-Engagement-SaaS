import { Membership } from "@/models/membership";
import { GoogleAccount } from "@/models/google-account";
import { AvailabilityRule } from "@/models/availability-rule";
import { BookingRequest } from "@/models/booking-request";
import { Workspace } from "@/models/workspace";
import { queryFreeBusy } from "@/lib/google-calendar";
import { isGoogleSchedulingReady } from "@/lib/google-scheduling";
import {
  buildScheduleSlots,
  filterAvailableScheduleSlots,
  isoDateAtTimezone,
  type ScheduleRule,
  type TimeInterval
} from "@/lib/scheduling-core";

const ACTIVE_BOOKING_STATUSES = [
  "ASSIGNED",
  "CREATING_MEETING",
  "CONFIRMED",
  "IN_PROGRESS"
] as const;

export async function eligibleEmployees(
  companyId: string,
  startAt: Date,
  endAt: Date,
  excludedIds: string[] = [],
  options: {
    bufferBeforeMinutes?: number;
    bufferAfterMinutes?: number;
    excludeBookingId?: string;
  } = {}
) {
  if (endAt <= startAt) return [];

  const workspace = await Workspace.findOne({ companyId, active: true })
    .select("timezone")
    .lean();
  if (!workspace) return [];

  const memberships = await Membership.find({
    companyId,
    active: true,
    role: { $in: ["COMPANY_OWNER", "COMPANY_ADMIN", "EMPLOYEE"] },
    userId: { $nin: excludedIds }
  })
    .select("userId")
    .lean();

  const durationMinutes = Math.round(
    (endAt.getTime() - startAt.getTime()) / 60000
  );
  if (durationMinutes <= 0) return [];

  const employeeIds = memberships.map((membership) => membership.userId);
  const [accounts, rules, activeBookings] = await Promise.all([
    GoogleAccount.find({
      userId: { $in: employeeIds },
      status: "CONNECTED"
    })
      .select("userId status scopes")
      .lean(),
    AvailabilityRule.find({
      companyId,
      employeeId: { $in: employeeIds },
      active: true
    })
      .select("employeeId dayOfWeek startMinute endMinute timezone active")
      .lean(),
    BookingRequest.find({
      companyId,
      ...(options.excludeBookingId ? { _id: { $ne: options.excludeBookingId } } : {}),
      assignedEmployeeId: { $in: employeeIds },
      status: { $in: ACTIVE_BOOKING_STATUSES },
      requestedStartAt: {
        $lt: new Date(
          endAt.getTime() + (options.bufferAfterMinutes ?? 0) * 60_000
        )
      },
      requestedEndAt: {
        $gt: new Date(
          startAt.getTime() - (options.bufferBeforeMinutes ?? 0) * 60_000
        )
      }
    })
      .select("assignedEmployeeId requestedStartAt requestedEndAt")
      .lean()
  ]);

  const accountMap = new Map(
    accounts.map((account) => [String(account.userId), account])
  );
  const rulesByEmployee = new Map<string, ScheduleRule[]>();
  for (const rule of rules) {
    const employeeId = String(rule.employeeId);
    const current = rulesByEmployee.get(employeeId) ?? [];
    current.push({
      dayOfWeek: rule.dayOfWeek,
      startMinute: rule.startMinute,
      endMinute: rule.endMinute,
      timezone: rule.timezone,
      active: rule.active
    });
    rulesByEmployee.set(employeeId, current);
  }

  const bookingIntervalsByEmployee = new Map<string, TimeInterval[]>();
  for (const booking of activeBookings) {
    if (!booking.assignedEmployeeId) continue;
    const employeeId = String(booking.assignedEmployeeId);
    const current = bookingIntervalsByEmployee.get(employeeId) ?? [];
    current.push({
      startAt: new Date(booking.requestedStartAt),
      endAt: new Date(booking.requestedEndAt)
    });
    bookingIntervalsByEmployee.set(employeeId, current);
  }

  let dateIso: string;
  try {
    dateIso = isoDateAtTimezone(startAt, workspace.timezone);
  } catch {
    return [];
  }

  const results = await Promise.all(
    memberships.map(async (membership) => {
      const userId = String(membership.userId);
      const account = accountMap.get(userId);
      if (!isGoogleSchedulingReady(account)) return null;

      const employeeRules = rulesByEmployee.get(userId) ?? [];
      const scheduleSlots = buildScheduleSlots(
        dateIso,
        workspace.timezone,
        employeeRules,
        durationMinutes,
        options.bufferBeforeMinutes ?? 0,
        options.bufferAfterMinutes ?? 0
      );

      if (
        !scheduleSlots.some(
          (slot) =>
            slot.startAt.getTime() === startAt.getTime() &&
            slot.endAt.getTime() === endAt.getTime()
        )
      ) {
        return null;
      }

      try {
        const freeBusy = await queryFreeBusy(
          userId,
          new Date(startAt.getTime() - (options.bufferBeforeMinutes ?? 0) * 60_000),
          new Date(endAt.getTime() + (options.bufferAfterMinutes ?? 0) * 60_000)
        );
        const busyIntervals: TimeInterval[] = (
          freeBusy.calendars?.primary?.busy ?? []
        ).map((item) => ({
          startAt: new Date(item.start),
          endAt: new Date(item.end)
        }));

        const available = filterAvailableScheduleSlots({
          slots: [{ startAt, endAt }],
          busyIntervals,
          employeeBookingIntervals: bookingIntervalsByEmployee.get(userId) ?? [],
          now: new Date(),
          bufferBeforeMinutes: options.bufferBeforeMinutes ?? 0,
          bufferAfterMinutes: options.bufferAfterMinutes ?? 0
        });

        return available.length > 0 ? userId : null;
      } catch {
        return null;
      }
    })
  );

  return results.filter((userId): userId is string => Boolean(userId));
}
