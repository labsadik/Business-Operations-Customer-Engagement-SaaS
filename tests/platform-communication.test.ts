import test from "node:test";
import assert from "node:assert/strict";
import {
  canSeeCompanyPlatformFeedback,
  isValidFeedbackStatusTransition,
  platformAnnouncementVisibleInCompany,
  validateAnnouncementAudience,
  validateAnnouncementContent,
  validateFeedbackInput
} from "../lib/platform-communication.ts";

test("platform announcement content rejects oversized values", () => {
  assert.throws(
    () => validateAnnouncementContent("x".repeat(121), "hello"),
    /ANNOUNCEMENT_TITLE_TOO_LONG/
  );
  assert.throws(
    () => validateAnnouncementContent("hello", "x".repeat(501)),
    /ANNOUNCEMENT_MESSAGE_TOO_LONG/
  );
});

test("platform announcement audience rules never treat empty selected targets as all", () => {
  assert.deepEqual(validateAnnouncementAudience("LANDING_PAGE", []), []);
  assert.deepEqual(validateAnnouncementAudience("ALL_COMPANIES", []), []);
  assert.throws(
    () => validateAnnouncementAudience("SELECTED_COMPANIES", []),
    /ANNOUNCEMENT_TARGETS_REQUIRED/
  );
  assert.throws(
    () => validateAnnouncementAudience("LANDING_PAGE", ["company"]),
    /ANNOUNCEMENT_TARGETS_NOT_ALLOWED/
  );
});

test("company visibility is exact and landing-only announcements stay out of workspaces", () => {
  assert.equal(platformAnnouncementVisibleInCompany("LANDING_PAGE", "a", []), false);
  assert.equal(platformAnnouncementVisibleInCompany("ALL_COMPANIES", "a", []), true);
  assert.equal(platformAnnouncementVisibleInCompany("SELECTED_COMPANIES", "a", ["b"]), false);
  assert.equal(platformAnnouncementVisibleInCompany("SELECTED_COMPANIES", "a", ["a", "b"]), true);
});

test("feedback validation enforces 1-5 stars and 300 character description limit", () => {
  assert.deepEqual(validateFeedbackInput(5, "Great scheduling"), {
    rating: 5,
    description: "Great scheduling"
  });
  assert.throws(() => validateFeedbackInput(0, ""), /FEEDBACK_RATING_INVALID/);
  assert.throws(() => validateFeedbackInput(6, ""), /FEEDBACK_RATING_INVALID/);
  assert.throws(
    () => validateFeedbackInput(5, "x".repeat(301)),
    /FEEDBACK_DESCRIPTION_TOO_LONG/
  );
});

test("company feedback visibility is available to every company role but not customers", () => {
  assert.equal(canSeeCompanyPlatformFeedback("COMPANY_ADMIN"), true);
  assert.equal(canSeeCompanyPlatformFeedback("COMPANY_ADMIN"), true);
  assert.equal(canSeeCompanyPlatformFeedback("EMPLOYEE"), true);
  assert.equal(canSeeCompanyPlatformFeedback("PLATFORM_ADMIN"), false);
  assert.equal(canSeeCompanyPlatformFeedback("CUSTOMER"), false);
});

test("feedback review status transitions stay explicit", () => {
  assert.equal(isValidFeedbackStatusTransition("NEW", "REVIEWED"), true);
  assert.equal(isValidFeedbackStatusTransition("NEW", "RESOLVED"), true);
  assert.equal(isValidFeedbackStatusTransition("RESOLVED", "NEW"), false);
  assert.equal(isValidFeedbackStatusTransition("REVIEWED", "NEW"), true);
  assert.equal(isValidFeedbackStatusTransition("RESOLVED", "REVIEWED"), true);
  assert.equal(isValidFeedbackStatusTransition("NEW", "INVALID"), false);
});
