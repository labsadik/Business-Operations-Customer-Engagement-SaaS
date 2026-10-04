import {
  getDayOfWeekForDate,
  nextDateIso,
  zonedDateTimeToUtc
} from "@/lib/timezone";

export const SCHEDULING_SLOT_STEP_MINUTES = 5;

export type ScheduleRule = {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  timezone: string;
  active?: boolean;
};

export type ScheduleWindow = {
  startAt: Date;
  endAt: Date;
};

export type TimeInterval = {
  startAt: Date;
  endAt: Date;
};

function addDaysIso(dateIso: string, days: number) {
  let value = dateIso;
  const count = Math.abs(days);
  const direction = days >= 0 ? 1 : -1;

  for (let index = 0; index < count; index += 1) {
    if (direction > 0) {
      value = nextDateIso(value);
    } else {
      const [year, month, day] = value.split("-").map(Number);
      const previous = new Date(Date.UTC(year, month - 1, day - 1, 12));
      value = [
        previous.getUTCFullYear(),
        String(previous.getUTCMonth() + 1).padStart(2, "0"),
        String(previous.getUTCDate()).padStart(2, "0")
      ].join("-");
    }
  }

  return value;
}

function isoDateAtTimezone(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);

  const map = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  if (!map.year || !map.month || !map.day) {
    throw new Error("INVALID_TIMEZONE");
  }

  return `${map.year}-${map.month}-${map.day}`;
}

function localDatesTouchingUtcRange(
  startAt: Date,
  endAt: Date,
  timezone: string
) {
  const startDate = isoDateAtTimezone(startAt, timezone);
  const endDate = isoDateAtTimezone(
    new Date(Math.max(startAt.getTime(), endAt.getTime() - 1)),
    timezone
  );

  const dates = new Set<string>();
  for (const base of [startDate, endDate]) {
    dates.add(addDaysIso(base, -1));
    dates.add(base);
    dates.add(addDaysIso(base, 1));
  }

  return [...dates];
}

function intervalsOverlap(left: TimeInterval, right: TimeInterval) {
  return (
    left.startAt < right.endAt &&
    left.endAt > right.startAt
  );
}

export function getScheduleWindowsForDate(
  dateIso: string,
  workspaceTimezone: string,
  rules: ScheduleRule[]
): ScheduleWindow[] {
  const dayStart = zonedDateTimeToUtc(dateIso, 0, workspaceTimezone);
  const dayEnd = zonedDateTimeToUtc(
    nextDateIso(dateIso),
    0,
    workspaceTimezone
  );
  const windows: ScheduleWindow[] = [];

  for (const rule of rules) {
    if (
      rule.active === false ||
      !Number.isInteger(rule.dayOfWeek) ||
      !Number.isInteger(rule.startMinute) ||
      !Number.isInteger(rule.endMinute) ||
      rule.endMinute <= rule.startMinute
    ) {
      continue;
    }

    let localDates: string[];
    try {
      localDates = localDatesTouchingUtcRange(
        dayStart,
        dayEnd,
        rule.timezone
      );
    } catch {
      continue;
    }

    for (const localDate of localDates) {
      let dayOfWeek: number;
      let startAt: Date;
      let endAt: Date;

      try {
        dayOfWeek = getDayOfWeekForDate(localDate, rule.timezone);
        if (dayOfWeek !== rule.dayOfWeek) continue;

        startAt = zonedDateTimeToUtc(
          localDate,
          rule.startMinute,
          rule.timezone
        );
        endAt = zonedDateTimeToUtc(
          localDate,
          rule.endMinute,
          rule.timezone
        );
      } catch {
        continue;
      }

      const start = new Date(
        Math.max(startAt.getTime(), dayStart.getTime())
      );
      const end = new Date(
        Math.min(endAt.getTime(), dayEnd.getTime())
      );

      if (start < end) {
        windows.push({ startAt: start, endAt: end });
      }
    }
  }

  return windows
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
    .filter(
      (window, index, all) =>
        index === 0 ||
        window.startAt.getTime() !== all[index - 1].startAt.getTime() ||
        window.endAt.getTime() !== all[index - 1].endAt.getTime()
    );
}

function slotReservedInterval(
  startAt: Date,
  endAt: Date,
  bufferBeforeMinutes: number,
  bufferAfterMinutes: number
) {
  return {
    startAt: new Date(startAt.getTime() - bufferBeforeMinutes * 60_000),
    endAt: new Date(endAt.getTime() + bufferAfterMinutes * 60_000)
  };
}

export function buildScheduleSlots(
  dateIso: string,
  workspaceTimezone: string,
  rules: ScheduleRule[],
  durationMinutes: number,
  bufferBeforeMinutes = 0,
  bufferAfterMinutes = 0
) {
  const windows = getScheduleWindowsForDate(
    dateIso,
    workspaceTimezone,
    rules
  );
  const slots: ScheduleWindow[] = [];

  if (
    !Number.isInteger(durationMinutes) ||
    durationMinutes <= 0 ||
    !Number.isInteger(bufferBeforeMinutes) ||
    bufferBeforeMinutes < 0 ||
    !Number.isInteger(bufferAfterMinutes) ||
    bufferAfterMinutes < 0
  ) {
    return slots;
  }

  for (const window of windows) {
    let startAt = new Date(
      window.startAt.getTime() + bufferBeforeMinutes * 60_000
    );

    while (true) {
      const endAt = new Date(
        startAt.getTime() + durationMinutes * 60_000
      );
      const reserved = slotReservedInterval(
        startAt,
        endAt,
        bufferBeforeMinutes,
        bufferAfterMinutes
      );

      if (reserved.endAt.getTime() > window.endAt.getTime()) break;
      slots.push({ startAt, endAt });
      startAt = new Date(
        startAt.getTime() + SCHEDULING_SLOT_STEP_MINUTES * 60_000
      );
    }
  }

  return slots;
}

export function filterAvailableScheduleSlots({
  slots,
  now = new Date(),
  busyIntervals = [],
  employeeBookingIntervals = [],
  companyBookingIntervals = [],
  bufferBeforeMinutes = 0,
  bufferAfterMinutes = 0,
  maxConcurrentMeetings = Number.POSITIVE_INFINITY
}: {
  slots: ScheduleWindow[];
  now?: Date;
  busyIntervals?: TimeInterval[];
  employeeBookingIntervals?: TimeInterval[];
  companyBookingIntervals?: TimeInterval[];
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  maxConcurrentMeetings?: number;
}) {
  return slots.filter((slot) => {
    if (slot.startAt.getTime() <= now.getTime()) return false;

    const reserved = slotReservedInterval(
      slot.startAt,
      slot.endAt,
      bufferBeforeMinutes,
      bufferAfterMinutes
    );

    if (busyIntervals.some((item) => intervalsOverlap(reserved, item))) {
      return false;
    }

    if (
      employeeBookingIntervals.some((item) =>
        intervalsOverlap(reserved, item)
      )
    ) {
      return false;
    }

    const concurrentCompanyMeetings = companyBookingIntervals.filter(
      (item) => intervalsOverlap(slot, item)
    ).length;

    if (concurrentCompanyMeetings >= maxConcurrentMeetings) {
      return false;
    }

    return true;
  });
}

export function isExactScheduleSlot({
  dateIso,
  workspaceTimezone,
  rules,
  startAt,
  endAt,
  durationMinutes,
  bufferBeforeMinutes = 0,
  bufferAfterMinutes = 0
}: {
  dateIso: string;
  workspaceTimezone: string;
  rules: ScheduleRule[];
  startAt: Date;
  endAt: Date;
  durationMinutes: number;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
}) {
  return buildScheduleSlots(
    dateIso,
    workspaceTimezone,
    rules,
    durationMinutes,
    bufferBeforeMinutes,
    bufferAfterMinutes
  ).some(
    (slot) =>
      slot.startAt.getTime() === startAt.getTime() &&
      slot.endAt.getTime() === endAt.getTime()
  );
}

export function intervalFromSlot(
  startAt: Date,
  endAt: Date
): TimeInterval {
  return { startAt, endAt };
}
