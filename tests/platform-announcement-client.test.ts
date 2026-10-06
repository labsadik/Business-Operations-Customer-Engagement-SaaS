import test from "node:test";
import assert from "node:assert/strict";
import {
  parsePlatformAnnouncementResponse,
  visiblePlatformAnnouncements
} from "../lib/platform-announcement-client.ts";
import {
  companyPlatformAnnouncementFilter,
  landingPlatformAnnouncementFilter
} from "../lib/platform-announcement-query.ts";

test("announcement response parser accepts the API { ok, data } contract", () => {
  assert.deepEqual(
    parsePlatformAnnouncementResponse({
      ok: true,
      data: [
        { id: "a", title: "Notice", message: "Hello", audience: "ALL_COMPANIES" },
        { id: "b", title: "Landing", message: "World" }
      ]
    }).map(({ id, title, message }) => ({ id, title, message })),
    [
      { id: "a", title: "Notice", message: "Hello" },
      { id: "b", title: "Landing", message: "World" }
    ]
  );
});

test("announcement response parser rejects failed or malformed API responses", () => {
  assert.throws(
    () => parsePlatformAnnouncementResponse({ ok: false, error: "FAILED" }),
    /ANNOUNCEMENTS_INVALID_RESPONSE/
  );
  assert.throws(
    () => parsePlatformAnnouncementResponse({ ok: true, data: null }),
    /ANNOUNCEMENTS_INVALID_RESPONSE/
  );
});

test("dismissed announcements stay hidden without changing the fetched audience", () => {
  const items = [
    { id: "a", title: "A", message: "A" },
    { id: "b", title: "B", message: "B" }
  ];
  assert.deepEqual(
    visiblePlatformAnnouncements(items, new Set(["b"])).map((item) => item.id),
    ["a"]
  );
});

test("landing query is published and landing-only", () => {
  assert.deepEqual(landingPlatformAnnouncementFilter(), {
    status: "PUBLISHED",
    audience: "LANDING_PAGE"
  });
});

test("company query is published and exact for all-or-selected audience", () => {
  const companyId = "507f1f77bcf86cd799439011";
  const filter = companyPlatformAnnouncementFilter(companyId);
  assert.equal(filter.status, "PUBLISHED");
  assert.deepEqual(filter.$or[0], { audience: "ALL_COMPANIES" });
  assert.equal(filter.$or[1].audience, "SELECTED_COMPANIES");
  assert.equal(String(filter.$or[1].targetCompanyIds), companyId);
  assert.throws(
    () => companyPlatformAnnouncementFilter("not-an-object-id"),
    /INVALID_COMPANY_ID/
  );
});


test("landing announcement dismissal is session-only while dashboard dismissal remains persistent", async () => {
  const banner = await (await import("node:fs/promises")).readFile(
    new URL("../components/platform-announcement-banner.tsx", import.meta.url),
    "utf8"
  );
  assert.match(banner, /surface === "landing" \? new Set<string>\(\) : getDismissed\(scope\)/);
  assert.match(banner, /if \(surface !== "landing"\)/);
  assert.match(banner, /bg-\[#fff8e6\]/);
  assert.match(banner, /border-amber-200/);
});
