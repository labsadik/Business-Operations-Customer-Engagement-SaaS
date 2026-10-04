import assert from "node:assert/strict";
import test from "node:test";
import {
  COOKIE_CONSENT_STORAGE_KEY,
  COOKIE_CONSENT_VERSION,
  createConsentRecord,
  parseConsentRecord,
  serializeConsentRecord
} from "../lib/cookie-consent.ts";

test("cookie consent records are versioned and timestamped without identity data", () => {
  const timestamp = new Date("2026-10-04T08:30:00.000Z");
  const record = createConsentRecord("reject-optional", timestamp);

  assert.equal(COOKIE_CONSENT_STORAGE_KEY, "conventus_cookie_consent");
  assert.equal(record.version, COOKIE_CONSENT_VERSION);
  assert.equal(record.timestamp, timestamp.toISOString());
  assert.equal(record.essential, true);
  assert.deepEqual(
    Object.keys(record).sort(),
    ["choice", "essential", "timestamp", "version"].sort()
  );
  assert.equal("email" in record, false);
  assert.equal("companyId" in record, false);
});

test("cookie consent records round-trip and reject old or malformed versions", () => {
  const record = createConsentRecord("custom", new Date("2026-10-04T09:00:00.000Z"));
  const encoded = serializeConsentRecord(record);

  assert.deepEqual(parseConsentRecord(encoded), record);
  assert.equal(
    parseConsentRecord(JSON.stringify({ ...record, version: "2026-01-01" })),
    null
  );
  assert.equal(
    parseConsentRecord(JSON.stringify({ ...record, timestamp: "not-a-date" })),
    null
  );
  assert.equal(
    parseConsentRecord(JSON.stringify({ ...record, choice: "marketing" })),
    null
  );
  assert.equal(
    parseConsentRecord(JSON.stringify({ ...record, essential: false })),
    null
  );
  assert.equal(parseConsentRecord("not-json"), null);
  assert.equal(parseConsentRecord(null), null);
});
