import assert from "node:assert/strict";
import test from "node:test";
import { googleApi } from "../lib/google.ts";

test("Google API errors keep the stable status code without upstream response bodies", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: "private upstream detail" }), {
      status: 503,
      headers: { "content-type": "application/json" }
    });

  try {
    await assert.rejects(
      googleApi("access-token", "https://example.test/calendar"),
      (error: unknown) => {
        assert.equal(error instanceof Error, true);
        assert.equal((error as Error).message, "GOOGLE_API_503");
        assert.doesNotMatch((error as Error).message, /private upstream detail/);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
