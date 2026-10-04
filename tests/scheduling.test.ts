import assert from "node:assert/strict";
import test from "node:test";

import {
  PLANS,
  getMeetingDurationOptions,
  resolveMeetingDuration
} from "../lib/plans.ts";
import {
  buildScheduleSlots,
  filterAvailableScheduleSlots
} from "../lib/scheduling-core.ts";
import { zonedDateTimeToUtc } from "../lib/timezone.ts";

function at(dateIso: string, minute: number, timezone: string) {
  return zonedDateTimeToUtc(dateIso, minute, timezone);
}

test("every supported plan resolves configured durations against its own maximum", () => {
  const cases: Array<{
    plan: keyof typeof PLANS;
    configured: number[];
    valid: number;
    invalid: number;
  }> = [
    { plan: "free", configured: [5, 10], valid: 5, invalid: 10 },
    { plan: "starter", configured: [5, 10, 20, 25], valid: 20, invalid: 25 },
    { plan: "elite", configured: [10, 20, 45, 60, 90], valid: 60, invalid: 90 },
    { plan: "pro", configured: [15, 30, 60, 90, 120], valid: 90, invalid: 120 },
    { plan: "plus", configured: [30, 60, 90, 120, 180], valid: 120, invalid: 180 }
  ];

  for (const item of cases) {
    const plan = PLANS[item.plan];
    const options = getMeetingDurationOptions(
      plan.maxMeetingDurationMinutes,
      item.configured
    );

    assert.ok(options.includes(item.valid));
    assert.ok(!options.includes(item.invalid));
    assert.equal(
      resolveMeetingDuration(
        plan.maxMeetingDurationMinutes,
        item.configured,
        item.valid
      ).durationMinutes,
      item.valid
    );
    assert.throws(
      () =>
        resolveMeetingDuration(
          plan.maxMeetingDurationMinutes,
          item.configured,
          item.invalid
        ),
      /INVALID_DURATION/
    );
  }
});

test("Free plan accepts the configured 5-minute duration and rejects 10 minutes", () => {
  assert.deepEqual(getMeetingDurationOptions(PLANS.free.maxMeetingDurationMinutes, [5]), [5]);
  assert.equal(
    resolveMeetingDuration(
      PLANS.free.maxMeetingDurationMinutes,
      [5],
      5
    ).durationMinutes,
    5
  );
  assert.throws(
    () => resolveMeetingDuration(PLANS.free.maxMeetingDurationMinutes, [5], 10),
    /INVALID_DURATION/
  );
});

test("missing or stale duration configuration never falls back to invented options", () => {
  assert.deepEqual(
    getMeetingDurationOptions(PLANS.free.maxMeetingDurationMinutes, []),
    []
  );
  assert.throws(
    () => resolveMeetingDuration(PLANS.free.maxMeetingDurationMinutes, [], 5),
    /MEETING_DURATION_NOT_CONFIGURED/
  );
  assert.deepEqual(
    getMeetingDurationOptions(PLANS.starter.maxMeetingDurationMinutes, [20, 20, 99]),
    [20]
  );
});

test("custom weekend and evening schedules generate only configured slots", () => {
  const timezone = "Asia/Kolkata";
  const rules = [
    {
      dayOfWeek: 0,
      startMinute: 18 * 60,
      endMinute: 22 * 60,
      timezone
    },
    {
      dayOfWeek: 6,
      startMinute: 10 * 60,
      endMinute: 12 * 60,
      timezone
    }
  ];

  const sundaySlots = buildScheduleSlots(
    "2026-10-04",
    timezone,
    rules,
    60
  );
  assert.equal(sundaySlots.length, 4);
  assert.equal(sundaySlots[0].startAt.toISOString(), "2026-10-04T12:30:00.000Z");
  assert.equal(sundaySlots.at(-1)?.endAt.toISOString(), "2026-10-04T16:30:00.000Z");

  const saturdaySlots = buildScheduleSlots(
    "2026-10-03",
    timezone,
    rules,
    60
  );
  assert.equal(saturdaySlots.length, 2);
  assert.equal(saturdaySlots[0].startAt.toISOString(), "2026-10-03T04:30:00.000Z");
});

test("calendar busy periods, employee bookings, and company concurrency remove slots", () => {
  const timezone = "Asia/Kolkata";
  const rules = [
    {
      dayOfWeek: 0,
      startMinute: 9 * 60,
      endMinute: 12 * 60,
      timezone
    }
  ];
  const schedule = buildScheduleSlots(
    "2026-10-04",
    timezone,
    rules,
    60
  );

  const base = at("2026-10-04", 9 * 60, timezone);
  const ten = at("2026-10-04", 10 * 60, timezone);
  const eleven = at("2026-10-04", 11 * 60, timezone);

  const filtered = filterAvailableScheduleSlots({
    slots: schedule,
    now: new Date("2026-10-03T00:00:00.000Z"),
    busyIntervals: [{ startAt: base, endAt: ten }],
    employeeBookingIntervals: [{ startAt: ten, endAt: eleven }],
    companyBookingIntervals: [],
    maxConcurrentMeetings: 2
  });

  assert.deepEqual(
    filtered.map((slot) => slot.startAt.toISOString()),
    [eleven.toISOString()]
  );

  const concurrencyBlocked = filterAvailableScheduleSlots({
    slots: schedule,
    now: new Date("2026-10-03T00:00:00.000Z"),
    companyBookingIntervals: [{ startAt: base, endAt: ten }],
    maxConcurrentMeetings: 1
  });

  assert.equal(
    concurrencyBlocked.some((slot) => slot.startAt.getTime() === base.getTime()),
    false
  );
  assert.equal(
    concurrencyBlocked.some((slot) => slot.startAt.getTime() === ten.getTime()),
    true
  );
});

test("meeting buffers prevent unsafe back-to-back employee scheduling", () => {
  const timezone = "Asia/Kolkata";
  const rules = [
    {
      dayOfWeek: 0,
      startMinute: 9 * 60,
      endMinute: 12 * 60,
      timezone
    }
  ];
  const schedule = buildScheduleSlots(
    "2026-10-04",
    timezone,
    rules,
    60,
    10,
    10
  );

  assert.equal(schedule[0].startAt.toISOString(), "2026-10-04T03:40:00.000Z");
  assert.equal(schedule[0].endAt.toISOString(), "2026-10-04T04:40:00.000Z");
  assert.equal(schedule.at(-1)?.endAt.toISOString(), "2026-10-04T06:20:00.000Z");
});

test("date/time conversion rejects non-existent DST local times and preserves valid local instants", () => {
  assert.throws(
    () => at("2026-03-08", 2 * 60 + 30, "America/New_York"),
    /INVALID_TIME/
  );

  assert.equal(
    at("2026-03-08", 9 * 60, "America/New_York").toISOString(),
    "2026-03-08T13:00:00.000Z"
  );
});

test("isolated company schedules cannot leak into each other", () => {
  const timezone = "Asia/Kolkata";
  const companyA = [
    { dayOfWeek: 6, startMinute: 18 * 60, endMinute: 20 * 60, timezone }
  ];
  const companyB = [
    { dayOfWeek: 1, startMinute: 9 * 60, endMinute: 11 * 60, timezone }
  ];

  const a = buildScheduleSlots("2026-10-03", timezone, companyA, 60);
  const b = buildScheduleSlots("2026-10-03", timezone, companyB, 60);

  assert.equal(a.length, 2);
  assert.equal(b.length, 0);
});


test("extreme positive-offset timezones use the local date for weekday resolution", () => {
  const timezone = "Pacific/Kiritimati";
  const sunday = buildScheduleSlots(
    "2026-10-04",
    timezone,
    [{ dayOfWeek: 0, startMinute: 9 * 60, endMinute: 10 * 60, timezone }],
    60
  );
  const saturday = buildScheduleSlots(
    "2026-10-03",
    timezone,
    [{ dayOfWeek: 0, startMinute: 9 * 60, endMinute: 10 * 60, timezone }],
    60
  );

  assert.equal(sunday.length, 1);
  assert.equal(saturday.length, 0);
});

test("fall-back DST keeps the configured local interval on the same scheduling date", () => {
  const timezone = "America/New_York";
  const start = zonedDateTimeToUtc("2026-11-01", 1 * 60 + 30, timezone);
  const end = zonedDateTimeToUtc("2026-11-01", 2 * 60 + 30, timezone);

  assert.equal(start.toISOString(), "2026-11-01T05:30:00.000Z");
  assert.equal(end.toISOString(), "2026-11-01T07:30:00.000Z");
  assert.equal((end.getTime() - start.getTime()) / 60_000, 120);
});
