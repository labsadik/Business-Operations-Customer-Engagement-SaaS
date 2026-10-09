import { GoogleAccount } from "@/models/google-account";
import { Membership } from "@/models/membership";
import { AvailabilityRule } from "@/models/availability-rule";
import { BookingRequest } from "@/models/booking-request";
import { queryFreeBusy } from "@/lib/google-calendar";
import { isGoogleSchedulingReady } from "@/lib/google-scheduling";
import { Workspace } from "@/models/workspace";
import { getRedis } from "@/lib/redis";
import { getTodayIso, nextDateIso, zonedDateTimeToUtc } from "@/lib/timezone";
import {
  buildScheduleSlots,
  filterAvailableScheduleSlots,
  type ScheduleRule,
  type TimeInterval
} from "@/lib/scheduling-core";

type Slot = { startAt: string; endAt: string };

export type AvailabilityResult = {
  slots: Slot[];
  reason:
    | "AVAILABLE"
    | "NO_ACTIVE_MEMBERS"
    | "NO_GOOGLE_SCHEDULING_MEMBER"
    | "NO_CONFIGURED_SCHEDULE"
    | "GOOGLE_CALENDAR_ERROR"
    | "NO_FREE_SLOTS";
  schedulingReadyMemberCount: number;
  scheduleConfiguredMemberCount: number;
  calendarErrorCount: number;
};

const ACTIVE_BOOKING_STATUSES = [
  "ASSIGNED",
  "CREATING_MEETING",
  "CONFIRMED",
  "IN_PROGRESS"
] as const;

async function calculateAvailableSlots(
  companyId: string,
  dateIso: string,
  durationMinutes: number,
  options: {
    bufferBeforeMinutes?: number;
    bufferAfterMinutes?: number;
    maxConcurrentMeetings?: number;
  } = {}
): Promise<AvailabilityResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
    throw new Error("INVALID_DATE");
  }
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
    throw new Error("INVALID_DURATION");
  }

  const workspace = await Workspace.findOne({ companyId, active: true })
    .select("_id timezone")
    .lean();
  if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");

  const timezone = workspace.timezone || "Asia/Kolkata";
  if (dateIso < getTodayIso(timezone)) {
    throw new Error("DATE_IN_PAST");
  }

  const memberships = await Membership.find({
    companyId,
    active: true,
    role: { $in: ["COMPANY_OWNER", "COMPANY_ADMIN", "EMPLOYEE"] }
  })
    .select("userId")
    .lean();

  if (memberships.length === 0) {
    return {
      slots: [],
      reason: "NO_ACTIVE_MEMBERS",
      schedulingReadyMemberCount: 0,
      scheduleConfiguredMemberCount: 0,
      calendarErrorCount: 0
    };
  }

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
      status: { $in: ACTIVE_BOOKING_STATUSES },
      requestedStartAt: {
        $lt: zonedDateTimeToUtc(nextDateIso(dateIso), 0, timezone)
      },
      requestedEndAt: {
        $gt: zonedDateTimeToUtc(dateIso, 0, timezone)
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

  const companyBookingIntervals: TimeInterval[] = activeBookings
    .filter((booking) => Boolean(booking.requestedStartAt && booking.requestedEndAt))
    .map((booking) => ({
      startAt: new Date(booking.requestedStartAt),
      endAt: new Date(booking.requestedEndAt)
    }));

  const employeeBookingIntervals = new Map<string, TimeInterval[]>();
  for (const booking of activeBookings) {
    if (!booking.assignedEmployeeId) continue;
    const employeeId = String(booking.assignedEmployeeId);
    const current = employeeBookingIntervals.get(employeeId) ?? [];
    current.push({
      startAt: new Date(booking.requestedStartAt),
      endAt: new Date(booking.requestedEndAt)
    });
    employeeBookingIntervals.set(employeeId, current);
  }

  let scheduleConfiguredMemberCount = 0;
  let calendarErrorCount = 0;

  const dayStart = zonedDateTimeToUtc(dateIso, 0, timezone);
  const dayEnd = zonedDateTimeToUtc(nextDateIso(dateIso), 0, timezone);

  const results = await Promise.all(
    memberships.map(async (membership) => {
      const employeeId = String(membership.userId);
      const account = accountMap.get(employeeId);
      if (!isGoogleSchedulingReady(account)) {
        return {
          ready: false,
          scheduleConfigured: false,
          calendarError: false,
          slots: [] as Slot[]
        };
      }

      const rulesForEmployee = rulesByEmployee.get(employeeId) ?? [];
      const scheduleSlots = buildScheduleSlots(
        dateIso,
        timezone,
        rulesForEmployee,
        durationMinutes,
        options.bufferBeforeMinutes ?? 0,
        options.bufferAfterMinutes ?? 0
      );

      if (scheduleSlots.length === 0) {
        return {
          ready: true,
          scheduleConfigured: false,
          calendarError: false,
          slots: [] as Slot[]
        };
      }

      let freeBusy;
      try {
        freeBusy = await queryFreeBusy(employeeId, dayStart, dayEnd);
      } catch {
        return {
          ready: true,
          scheduleConfigured: true,
          calendarError: true,
          slots: [] as Slot[]
        };
      }

      const busyIntervals: TimeInterval[] = (
        freeBusy.calendars?.primary?.busy ?? []
      ).map((item) => ({
        startAt: new Date(item.start),
        endAt: new Date(item.end)
      }));

      const filtered = filterAvailableScheduleSlots({
        slots: scheduleSlots,
        busyIntervals,
        employeeBookingIntervals:
          employeeBookingIntervals.get(employeeId) ?? [],
        companyBookingIntervals,
        bufferBeforeMinutes: options.bufferBeforeMinutes ?? 0,
        bufferAfterMinutes: options.bufferAfterMinutes ?? 0,
        maxConcurrentMeetings:
          options.maxConcurrentMeetings ?? Number.POSITIVE_INFINITY
      });

      return {
        ready: true,
        scheduleConfigured: true,
        calendarError: false,
        slots: filtered.map((slot) => ({
          startAt: slot.startAt.toISOString(),
          endAt: slot.endAt.toISOString()
        }))
      };
    })
  );

  for (const result of results) {
    if (result.ready && result.scheduleConfigured) {
      scheduleConfiguredMemberCount += 1;
    }
    if (result.calendarError) {
      calendarErrorCount += 1;
    }
  }

  const slots = new Map<string, Slot>();
  for (const result of results) {
    for (const slot of result.slots) {
      slots.set(slot.startAt, slot);
    }
  }

  const sortedSlots = [...slots.values()].sort((a, b) =>
    a.startAt.localeCompare(b.startAt)
  );

  const schedulingReadyMemberCount = results.filter((result) => result.ready).length;

  let reason: AvailabilityResult["reason"] = "AVAILABLE";
  if (sortedSlots.length === 0) {
    if (schedulingReadyMemberCount === 0) {
      reason = "NO_GOOGLE_SCHEDULING_MEMBER";
    } else if (scheduleConfiguredMemberCount === 0) {
      reason = "NO_CONFIGURED_SCHEDULE";
    } else if (calendarErrorCount === scheduleConfiguredMemberCount) {
      reason = "GOOGLE_CALENDAR_ERROR";
    } else {
      reason = "NO_FREE_SLOTS";
    }
  }

  return {
    slots: sortedSlots,
    reason,
    schedulingReadyMemberCount,
    scheduleConfiguredMemberCount,
    calendarErrorCount
  };
}


const AVAILABILITY_CACHE_TTL_SECONDS = 75;
const AVAILABILITY_LOCAL_SHARED_TTL_MS = 10_000;
const MAX_AVAILABILITY_CACHE_ENTRIES = 128;
const MAX_CONCURRENT_AVAILABILITY_CALCULATIONS = 10;
const MAX_QUEUED_AVAILABILITY_CALCULATIONS = 40;
let activeAvailabilityCalculations = 0;
const queuedAvailabilityCalculations: Array<() => void> = [];

async function withAvailabilityCalculationCapacity<T>(
  work: () => Promise<T>
): Promise<T> {
  if (activeAvailabilityCalculations >= MAX_CONCURRENT_AVAILABILITY_CALCULATIONS) {
    if (queuedAvailabilityCalculations.length >= MAX_QUEUED_AVAILABILITY_CALCULATIONS) {
      throw new Error("AVAILABILITY_BUSY");
    }
    await new Promise<void>((resolve) => queuedAvailabilityCalculations.push(resolve));
  } else {
    activeAvailabilityCalculations += 1;
  }

  try {
    return await work();
  } finally {
    const next = queuedAvailabilityCalculations.shift();
    if (next) next();
    else activeAvailabilityCalculations = Math.max(0, activeAvailabilityCalculations - 1);
  }
}

const availabilityCache = new Map<
  string,
  { expiresAt: number; value: AvailabilityResult }
>();
const inFlightAvailability = new Map<string, Promise<AvailabilityResult>>();

function isAvailabilityResult(value: unknown): value is AvailabilityResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<AvailabilityResult>;
  return (
    Array.isArray(result.slots) &&
    typeof result.reason === "string" &&
    Number.isFinite(result.schedulingReadyMemberCount) &&
    Number.isFinite(result.scheduleConfiguredMemberCount) &&
    Number.isFinite(result.calendarErrorCount)
  );
}

function rememberAvailability(
  key: string,
  value: AvailabilityResult,
  ttlMs: number
) {
  availabilityCache.delete(key);
  availabilityCache.set(key, { value, expiresAt: Date.now() + ttlMs });
  while (availabilityCache.size > MAX_AVAILABILITY_CACHE_ENTRIES) {
    const oldestKey = availabilityCache.keys().next().value;
    if (oldestKey === undefined) break;
    availabilityCache.delete(oldestKey);
  }
}

export async function getAvailableSlots(
  companyId: string,
  dateIso: string,
  durationMinutes: number,
  options: {
    bufferBeforeMinutes?: number;
    bufferAfterMinutes?: number;
    maxConcurrentMeetings?: number;
  } = {}
): Promise<AvailabilityResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
    throw new Error("INVALID_DATE");
  }
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
    throw new Error("INVALID_DURATION");
  }

  const cacheKey = "conventus:availability:v1:" + [
    companyId,
    dateIso,
    durationMinutes,
    options.bufferBeforeMinutes ?? 0,
    options.bufferAfterMinutes ?? 0,
    options.maxConcurrentMeetings ?? "unlimited"
  ].join(":");

  const cached = availabilityCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    // Refresh recency for bounded in-process eviction.
    availabilityCache.delete(cacheKey);
    availabilityCache.set(cacheKey, cached);
    return cached.value;
  }
  if (cached) availabilityCache.delete(cacheKey);

  const existing = inFlightAvailability.get(cacheKey);
  if (existing) return existing;

  const pending = withAvailabilityCalculationCapacity(async () => {
    let redis: Awaited<ReturnType<typeof getRedis>> = null;
    try {
      redis = await getRedis();
    } catch {
      redis = null;
    }

    if (redis) {
      try {
        const raw = await redis.get(cacheKey);
        if (raw) {
          const parsed: unknown = JSON.parse(raw);
          if (isAvailabilityResult(parsed)) {
            rememberAvailability(
              cacheKey,
              parsed,
              AVAILABILITY_LOCAL_SHARED_TTL_MS
            );
            return parsed;
          }
        }
      } catch {
        // Redis is an optimization only; booking availability still works without it.
        redis = null;
      }
    }

    const result = await calculateAvailableSlots(
      companyId,
      dateIso,
      durationMinutes,
      options
    );

    if (redis) {
      try {
        await redis.set(
          cacheKey,
          JSON.stringify(result),
          { EX: AVAILABILITY_CACHE_TTL_SECONDS }
        );
      } catch {
        redis = null;
      }
    }

    rememberAvailability(
      cacheKey,
      result,
      redis
        ? AVAILABILITY_LOCAL_SHARED_TTL_MS
        : AVAILABILITY_CACHE_TTL_SECONDS * 1000
    );
    return result;
  });

  inFlightAvailability.set(cacheKey, pending);
  try {
    return await pending;
  } finally {
    if (inFlightAvailability.get(cacheKey) === pending) {
      inFlightAvailability.delete(cacheKey);
    }
  }
}
