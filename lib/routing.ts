import { Membership } from "@/models/membership";
import { GoogleAccount } from "@/models/google-account";
import { queryFreeBusy } from "@/lib/google-calendar";
import { isGoogleSchedulingReady } from "@/lib/google-scheduling";

export async function eligibleEmployees(
  companyId: string,
  startAt: Date,
  endAt: Date,
  excludedIds: string[] = []
) {
  const memberships = await Membership.find({
    companyId,
    active: true,
    role: { $in: ["COMPANY_OWNER", "COMPANY_ADMIN", "EMPLOYEE"] },
    userId: { $nin: excludedIds }
  }).lean();

  const durationMinutes = Math.round(
    (endAt.getTime() - startAt.getTime()) / 60000
  );

  if (durationMinutes <= 0) return [];

  const results: string[] = [];

  for (const membership of memberships) {
    const userId = String(membership.userId);

    const account = await GoogleAccount.findOne({
      userId,
      status: "CONNECTED"
    }).lean();

    if (!isGoogleSchedulingReady(account)) continue;

    try {
      const freeBusy = await queryFreeBusy(userId, startAt, endAt);
      const busy = freeBusy.calendars?.primary?.busy ?? [];
      if (busy.length === 0) results.push(userId);
    } catch {
      // A failed/revoked Google connection must not block other employees.
      continue;
    }
  }

  return results;
}
