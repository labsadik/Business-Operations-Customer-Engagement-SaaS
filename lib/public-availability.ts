import { GoogleAccount } from "@/models/google-account";
import { Membership } from "@/models/membership";
import { queryFreeBusy } from "@/lib/google-calendar";
import { isGoogleSchedulingReady } from "@/lib/google-scheduling";
import { Workspace } from "@/models/workspace";
import { nextDateIso, zonedDateTimeToUtc } from "@/lib/timezone";

type Slot = { startAt: string; endAt: string };

export type AvailabilityResult = {
  slots: Slot[];
  reason:
    | "AVAILABLE"
    | "NO_ACTIVE_MEMBERS"
    | "NO_GOOGLE_SCHEDULING_MEMBER"
    | "GOOGLE_CALENDAR_ERROR"
    | "NO_FREE_SLOTS";
  schedulingReadyMemberCount: number;
  calendarErrorCount: number;
};

const SLOT_STEP_MINUTES = 5;

export async function getAvailableSlots(
  companyId: string,
  dateIso: string,
  durationMinutes: number
): Promise<AvailabilityResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) throw new Error("INVALID_DATE");
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
    throw new Error("INVALID_DURATION");
  }

  const workspace = await Workspace.findOne({ companyId, active: true })
    .select("timezone")
    .lean();
  const timezone = workspace?.timezone || "Asia/Kolkata";

  const memberships = await Membership.find({
    companyId,
    active: true,
    role: { $in: ["COMPANY_OWNER", "COMPANY_ADMIN", "EMPLOYEE"] }
  }).lean();

  if (memberships.length === 0) {
    return {
      slots: [],
      reason: "NO_ACTIVE_MEMBERS",
      schedulingReadyMemberCount: 0,
      calendarErrorCount: 0
    };
  }

  const dayStart = zonedDateTimeToUtc(dateIso, 0, timezone);
  const dayEnd = zonedDateTimeToUtc(nextDateIso(dateIso), 0, timezone);
  const slots = new Map<string, Slot>();

  let schedulingReadyMemberCount = 0;
  let calendarErrorCount = 0;

  const results = await Promise.all(
    memberships.map(async (membership) => {
      const employeeId = String(membership.userId);
      const account = await GoogleAccount.findOne({
        userId: employeeId,
        status: "CONNECTED"
      }).lean();

      if (!isGoogleSchedulingReady(account)) {
        return { ready: false, calendarError: false, slots: [] as Slot[] };
      }

      let freeBusy;
      try {
        freeBusy = await queryFreeBusy(employeeId, dayStart, dayEnd);
      } catch {
        return { ready: true, calendarError: true, slots: [] as Slot[] };
      }

      const busy = freeBusy.calendars?.primary?.busy ?? [];
      const employeeSlots: Slot[] = [];

      for (
        let minute = 0;
        minute + durationMinutes <= 24 * 60;
        minute += SLOT_STEP_MINUTES
      ) {
        const startAt = zonedDateTimeToUtc(dateIso, minute, timezone);
        const endAt = zonedDateTimeToUtc(
          dateIso,
          minute + durationMinutes,
          timezone
        );

        if (startAt.getTime() <= Date.now()) continue;

        const overlaps = busy.some(
          (item) =>
            startAt < new Date(item.end) &&
            endAt > new Date(item.start)
        );

        if (!overlaps) {
          employeeSlots.push({
            startAt: startAt.toISOString(),
            endAt: endAt.toISOString()
          });
        }
      }

      return { ready: true, calendarError: false, slots: employeeSlots };
    })
  );

  for (const result of results) {
    if (result.ready) schedulingReadyMemberCount += 1;
    if (result.calendarError) calendarErrorCount += 1;

    for (const slot of result.slots) {
      slots.set(slot.startAt, slot);
    }
  }

  const sortedSlots = [...slots.values()].sort((a, b) =>
    a.startAt.localeCompare(b.startAt)
  );

  let reason: AvailabilityResult["reason"] = "AVAILABLE";
  if (sortedSlots.length === 0) {
    if (schedulingReadyMemberCount === 0) {
      reason = "NO_GOOGLE_SCHEDULING_MEMBER";
    } else if (calendarErrorCount === schedulingReadyMemberCount) {
      reason = "GOOGLE_CALENDAR_ERROR";
    } else {
      reason = "NO_FREE_SLOTS";
    }
  }

  return {
    slots: sortedSlots,
    reason,
    schedulingReadyMemberCount,
    calendarErrorCount
  };
}
