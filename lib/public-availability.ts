import { AvailabilityRule } from "@/models/availability-rule";
import { GoogleAccount } from "@/models/google-account";
import { Membership } from "@/models/membership";
import { queryFreeBusy } from "@/lib/google-calendar";
import { Workspace } from "@/models/workspace";
import { isGoogleSchedulingReady } from "@/lib/google-scheduling";
import { getDayOfWeekForDate, nextDateIso, zonedDateTimeToUtc } from "@/lib/timezone";

type Slot = { startAt: string; endAt: string };

export async function getAvailableSlots(companyId: string, dateIso: string, durationMinutes: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) throw new Error("INVALID_DATE");
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) throw new Error("INVALID_DURATION");

  const workspace = await Workspace.findOne({ companyId, active: true }).select("timezone").lean();
  const workspaceTimezone = workspace?.timezone || "Asia/Kolkata";

  const memberships = await Membership.find({
    companyId,
    active: true,
    role: { $in: ["COMPANY_OWNER", "COMPANY_ADMIN", "EMPLOYEE"] }
  }).lean();

  const slots = new Map<string, Slot>();

  for (const membership of memberships) {
    const employeeId = String(membership.userId);
    const account = await GoogleAccount.findOne({ userId: employeeId, status: "CONNECTED" }).lean();
    if (!isGoogleSchedulingReady(account)) continue;

    const rules = await AvailabilityRule.find({ companyId, employeeId, active: true }).lean();
    if (rules.length === 0) continue;

    const relevantRule = rules.find((rule) => {
      const timezone = rule.timezone || workspaceTimezone;
      return getDayOfWeekForDate(dateIso, timezone) === rule.dayOfWeek;
    });
    if (!relevantRule) continue;

    const timezone = relevantRule.timezone || workspaceTimezone;
    const dayStart = zonedDateTimeToUtc(dateIso, 0, timezone);
    const dayEnd = zonedDateTimeToUtc(nextDateIso(dateIso), 0, timezone);
    const freeBusy = await queryFreeBusy(employeeId, dayStart, dayEnd);
    const busy = freeBusy.calendars?.primary?.busy ?? [];

    for (
      let minute = relevantRule.startMinute;
      minute + durationMinutes <= relevantRule.endMinute;
      minute += 30
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
        slots.set(key, {
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString()
        });
      }
    }
  }

  return [...slots.values()].sort((a, b) =>
    a.startAt.localeCompare(b.startAt)
  );
}
