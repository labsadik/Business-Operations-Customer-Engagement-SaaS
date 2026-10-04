function parseDateParts(dateIso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) throw new Error("INVALID_DATE");
  const [year, month, day] = dateIso.split("-").map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day, 12));
  if (
    Number.isNaN(probe.getTime()) ||
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new Error("INVALID_DATE");
  }
  return { year, month, day };
}

function timezoneOffsetMs(date: Date, timezone: string) {
  const part = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "longOffset"
  })
    .formatToParts(date)
    .find((item) => item.type === "timeZoneName");

  const value = part?.value ?? "GMT";
  if (value === "GMT" || value === "UTC") return 0;

  const match = value.match(/^GMT([+-])(\d{2}):?(\d{2})?$/);
  if (!match) throw new Error("INVALID_TIMEZONE");

  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? 0);
  const offset = (hours * 60 + minutes) * 60_000;
  return match[1] === "-" ? -offset : offset;
}

export function getDayOfWeekForDate(dateIso: string, timezone: string) {
  const { year, month, day } = parseDateParts(dateIso);
  const noonUtc = new Date(Date.UTC(year, month - 1, day, 12));
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short"
  }).format(noonUtc);
  const days: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6
  };
  return days[weekday];
}

export function nextDateIso(dateIso: string) {
  const { year, month, day } = parseDateParts(dateIso);
  const next = new Date(Date.UTC(year, month - 1, day + 1, 12));
  return [
    next.getUTCFullYear(),
    String(next.getUTCMonth() + 1).padStart(2, "0"),
    String(next.getUTCDate()).padStart(2, "0")
  ].join("-");
}

export function zonedDateTimeToUtc(dateIso: string, minute: number, timezone: string) {
  const { year, month, day } = parseDateParts(dateIso);
  if (!Number.isInteger(minute) || minute < 0 || minute > 24 * 60) {
    throw new Error("INVALID_TIME");
  }

  const wallClockUtc = new Date(
    Date.UTC(year, month - 1, day, Math.floor(minute / 60), minute % 60)
  );

  const firstOffset = timezoneOffsetMs(wallClockUtc, timezone);
  const firstUtc = new Date(wallClockUtc.getTime() - firstOffset);
  const correctedOffset = timezoneOffsetMs(firstUtc, timezone);
  const result = new Date(wallClockUtc.getTime() - correctedOffset);

  const actualParts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    })
      .formatToParts(result)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  const expectedParts = {
    year: String(wallClockUtc.getUTCFullYear()),
    month: String(wallClockUtc.getUTCMonth() + 1).padStart(2, "0"),
    day: String(wallClockUtc.getUTCDate()).padStart(2, "0"),
    hour: String(wallClockUtc.getUTCHours()).padStart(2, "0"),
    minute: String(wallClockUtc.getUTCMinutes()).padStart(2, "0")
  };

  if (
    actualParts.year !== expectedParts.year ||
    actualParts.month !== expectedParts.month ||
    actualParts.day !== expectedParts.day ||
    actualParts.hour !== expectedParts.hour ||
    actualParts.minute !== expectedParts.minute
  ) {
    throw new Error("INVALID_TIME");
  }

  return result;
}

export function getTodayIso(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const map = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return `${map.year}-${map.month}-${map.day}`;
}
