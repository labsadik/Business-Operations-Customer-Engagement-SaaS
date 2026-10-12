import test from "node:test";
import assert from "node:assert/strict";
import { readSentrySampleRate } from "../lib/sentry/config.ts";

test("Sentry sample rates accept only finite values in the inclusive 0-1 range", () => {
  assert.equal(readSentrySampleRate(undefined, 0.1), 0.1);
  assert.equal(readSentrySampleRate("", 0.1), 0.1);
  assert.equal(readSentrySampleRate("0", 0.1), 0);
  assert.equal(readSentrySampleRate("1", 0.1), 1);
  assert.equal(readSentrySampleRate("0.25", 0.1), 0.25);
  for (const invalid of ["NaN", "Infinity", "-0.1", "1.1", "not-a-number"]) {
    assert.equal(readSentrySampleRate(invalid, 0.1), 0.1, invalid);
  }
});
