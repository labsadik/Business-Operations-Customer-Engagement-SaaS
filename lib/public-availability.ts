import { AvailabilityRule } from "@/models/availability-rule";
import { GoogleAccount } from "@/models/google-account";
import { Membership } from "@/models/membership";
import { queryFreeBusy } from "@/lib/google-calendar";
import { Workspace } from "@/models/workspace";
import { getEmployeePresence } from "@/lib/employee-presence";
import { isGoogleSchedulingReady } from "@/lib/google-scheduling";

type Slot = { startAt: string; endAt: string };

function dayParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const map = Object.fromEntries(parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
  const days: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { dayOfWeek: days[map.weekday], year: Number(map.year), month: Number(map.month), day: Number(map.day) };
}

function sameLocalDay(date: Date, day: { year: number; month: number; day: number }, timezone: string) {
  const current = dayParts(date, timezone);
  return current.year === day.year && current.month === day.month && current.day === day.day;
}

export async function getAvailableSlots(companyId: string, dateIso: string, durationMinutes: number) {
  const workspace = await Workspace.findOne({ companyId, active: true }).select("timezone").lean();
  const timezone = workspace?.timezone || "Asia/Kolkata";
  const parsed = new Date(`${dateIso}T00:00:00+05:30`);
  if (Number.isNaN(parsed.getTime())) throw new Error("INVALID_DATE");

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
    const presence = await getEmployeePresence(companyId, employeeId);
    if (presence.status !== "AVAILABLE") continue;

    const rules = await AvailabilityRule.find({ companyId, employeeId, active: true }).lean();
    const relevantRule = rules.find((r) => {
      const day = dayParts(parsed, r.timezone || timezone).dayOfWeek;
      return day === r.dayOfWeek;
    });
    if (!relevantRule) continue;

    const dayStart = new Date(parsed);
    const dayEnd = new Date(parsed.getTime() + 24 * 60 * 60 * 1000);
    const freeBusy = await queryFreeBusy(employeeId, dayStart, dayEnd);
    const busy = freeBusy.calendars?.primary?.busy ?? [];

    for (let minute = relevantRule.startMinute; minute + durationMinutes <= relevantRule.endMinute; minute += 30) {
      const startAt = new Date(parsed.getTime() + minute * 60_000);
      const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);
      if (startAt.getTime() <= Date.now()) continue;
      if (!sameLocalDay(startAt, dayParts(parsed, relevantRule.timezone || timezone), relevantRule.timezone || timezone)) continue;
      const overlaps = busy.some((item) => startAt < new Date(item.end) && endAt > new Date(item.start));
      if (!overlaps) {
        const key = startAt.toISOString();
        slots.set(key, { startAt: startAt.toISOString(), endAt: endAt.toISOString() });
      }
    }
  }

  const result = [...slots.values()].sort((a, b) => a.startAt.localeCompare(b.startAt));
  return result;
}