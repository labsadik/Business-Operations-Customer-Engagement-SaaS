import { AvailabilityRule } from "@/models/availability-rule";
import { Membership } from "@/models/membership";
import { GoogleAccount } from "@/models/google-account";
import { queryFreeBusy } from "@/lib/google-calendar";
import { getEmployeePresence } from "@/lib/employee-presence";
import { isGoogleSchedulingReady } from "@/lib/google-scheduling";

function localParts(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
  );
  const days: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    dayOfWeek: days[parts.weekday],
    minute: Number(parts.hour) * 60 + Number(parts.minute)
  };
}

export async function eligibleEmployees(companyId: string, startAt: Date, endAt: Date, excludedIds: string[] = []) {
  const memberships = await Membership.find({
    companyId,
    active: true,
    role: { $in: ["COMPANY_OWNER", "COMPANY_ADMIN", "EMPLOYEE"] },
    userId: { $nin: excludedIds }
  }).lean();

  const results: string[] = [];
  for (const membership of memberships) {
    const userId = String(membership.userId);
    const account = await GoogleAccount.findOne({ userId, status: "CONNECTED" }).lean();
    if (!isGoogleSchedulingReady(account)) continue;

    const presence = await getEmployeePresence(companyId, userId);
    if (presence.status !== "AVAILABLE") continue;

    const rules = await AvailabilityRule.find({
      companyId,
      employeeId: userId,
      active: true
    }).lean();

    if (rules.length === 0) continue;

    const parts = localParts(startAt, rules[0]?.timezone ?? "Asia/Kolkata");
    const durationMinutes = Math.round((endAt.getTime() - startAt.getTime()) / 60000);
    const hasRule = rules.some((rule) => {
      const start = rule.startMinute;
      const end = rule.endMinute;
      return rule.dayOfWeek === parts.dayOfWeek && parts.minute >= start && parts.minute + durationMinutes <= end;
    });
    if (!hasRule) continue;

    const freeBusy = await queryFreeBusy(userId, startAt, endAt);
    const busy = freeBusy.calendars?.primary?.busy ?? [];
    if (busy.length === 0) results.push(userId);
  }

  return results;
}