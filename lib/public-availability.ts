import { AvailabilityRule } from "@/models/availability-rule";
import { GoogleAccount } from "@/models/google-account";
import { Membership } from "@/models/membership";
import { queryFreeBusy } from "@/lib/google-calendar";
import { Workspace } from "@/models/workspace";
import { isGoogleSchedulingReady } from "@/lib/google-scheduling";
import { getDayOfWeekForDate, nextDateIso, zonedDateTimeToUtc } from "@/lib/timezone";

type Slot = { startAt: string; endAt: string };

export type AvailabilityResult = {
  slots: Slot[];
  reason:
    | "AVAILABLE"
    | "NO_ACTIVE_MEMBERS"
    | "NO_GOOGLE_SCHEDULING_MEMBER"
    | "NO_WORKING_HOURS"
    | "NO_FREE_SLOTS";
  schedulingReadyMemberCount: number;
  membersWithWorkingHoursCount: number;
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
  const workspaceTimezone = workspace?.timezone || "Asia/Kolkata";

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
      membersWithWorkingHoursCount: 0
    };
  }

  const dayCache = new Map<string, number>();
  const slots = new Map<string, Slot>();

  const employeeResults = await Promise.all(
    memberships.map(async (membership) => {
      const employeeId = String(membership.userId);
      const account = await GoogleAccount.findOne({
        userId: employeeId,
        status: "CONNECTED"
      }).lean();

      if (!isGoogleSchedulingReady(account)) {
        return {
          accountReady: false,
          hasWorkingHours: false,
          slots: [] as Slot[]
        };
      }

      const rules = await AvailabilityRule.find({
        companyId,
        employeeId,
        active: true
      }).lean();

      const relevantRules = rules.filter((rule) => {
        const timezone = rule.timezone || workspaceTimezone;
        const key = dateIso + ":" + timezone;
        let dayOfWeek = dayCache.get(key);
        if (dayOfWeek === undefined) {
          dayOfWeek = getDayOfWeekForDate(dateIso, timezone);
          dayCache.set(key, dayOfWeek);
        }
        return rule.dayOfWeek === dayOfWeek;
      });

      if (relevantRules.length === 0) {
        return {
          accountReady: true,
          hasWorkingHours: false,
          slots: [] as Slot[]
        };
      }

      let freeBusy;
      try {
        const firstTimezone = relevantRules[0].timezone || workspaceTimezone;
        const dayStart = zonedDateTimeToUtc(dateIso, 0, firstTimezone);
        const dayEnd = zonedDateTimeToUtc(nextDateIso(dateIso), 0, firstTimezone);
        freeBusy = await queryFreeBusy(employeeId, dayStart, dayEnd);
      } catch {
        return {
          accountReady: true,
          hasWorkingHours: true,
          slots: [] as Slot[]
        };
      }

      const busy = freeBusy.calendars?.primary?.busy ?? [];
      const employeeSlots = new Map<string, Slot>();

      for (const rule of relevantRules) {
        const timezone = rule.timezone || workspaceTimezone;
        const firstMinute =
          Math.ceil(rule.startMinute / SLOT_STEP_MINUTES) * SLOT_STEP_MINUTES;

        for (
          let minute = firstMinute;
          minute + durationMinutes <= rule.endMinute;
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
            const key = startAt.toISOString();
            employeeSlots.set(key, {
              startAt: startAt.toISOString(),
              endAt: endAt.toISOString()
            });
          }
        }
      }

      return {
        accountReady: true,
        hasWorkingHours: true,
        slots: [...employeeSlots.values()]
      };
    })
  );

  const schedulingReadyMemberCount = employeeResults.filter(
    (result) => result.accountReady
  ).length;
  const membersWithWorkingHoursCount = employeeResults.filter(
    (result) => result.hasWorkingHours
  ).length;

  for (const result of employeeResults) {
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
    } else if (membersWithWorkingHoursCount === 0) {
      reason = "NO_WORKING_HOURS";
    } else {
      reason = "NO_FREE_SLOTS";
    }
  }

  return {
    slots: sortedSlots,
    reason,
    schedulingReadyMemberCount,
    membersWithWorkingHoursCount
  };
}
