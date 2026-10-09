import test from "node:test";
import assert from "node:assert/strict";
import { PLAN_IDS, PLANS } from "../lib/plans.ts";
import {
  calculatePlanPricing,
  isPlanPubliclyPurchasable,
  validatePlanDraft
} from "../lib/plan-rules.ts";

const baseDraft = {
  identifier: "growth",
  name: "Growth",
  description: "A managed team plan",
  status: "PUBLIC" as const,
  popular: false,
  recommended: false,
  priceInr: 1000,
  discountType: "NONE" as const,
  discountValue: 0,
  maxWorkspaces: 1,
  maxCompanies: 1,
  maxEmployees: 25,
  monthlyMeetingLimit: 500,
  maxMeetingDurationMinutes: 60,
  maxConcurrentMeetings: 10,
  validityDays: 30,
  freeFeatureDays: null
};

test("legacy plan identifiers and entitlement values stay intact", () => {
  assert.deepEqual([...PLAN_IDS], ["free", "starter", "elite", "pro", "plus"]);
  assert.equal(PLANS.free.priceInr, 0);
  assert.equal(PLANS.free.maxEmployees, 1);
  assert.equal(PLANS.free.monthlyMeetingLimit, 10);
  assert.equal(PLANS.starter.priceInr, 99);
  assert.equal(PLANS.starter.maxEmployees, 10);
  assert.equal(PLANS.elite.monthlyMeetingLimit, 850);
  assert.equal(PLANS.pro.maxMeetingDurationMinutes, 90);
  assert.equal(PLANS.plus.maxConcurrentMeetings, 100);
});

test("percentage discounts calculate exact server-side minor-unit amounts", () => {
  assert.deepEqual(calculatePlanPricing(1000, "PERCENTAGE", 0), {
    baseAmountMinor: 100000,
    discountAmountMinor: 0,
    discountedAmountMinor: 100000,
    basePriceInr: 1000,
    discountAmountInr: 0,
    finalPriceInr: 1000
  });
  assert.equal(calculatePlanPricing(1000, "PERCENTAGE", 100).discountedAmountMinor, 0);
  assert.equal(calculatePlanPricing(999.99, "PERCENTAGE", 12.5).discountAmountMinor, 12500);
  assert.throws(() => calculatePlanPricing(1000, "PERCENTAGE", 100.01), /DISCOUNT_PERCENTAGE_INVALID/);
});

test("fixed discounts cannot make the final price negative", () => {
  assert.equal(calculatePlanPricing(1000, "FIXED_AMOUNT", 1000).discountedAmountMinor, 0);
  assert.equal(calculatePlanPricing(1000, "FIXED_AMOUNT", 250).discountAmountMinor, 25000);
  assert.throws(() => calculatePlanPricing(1000, "FIXED_AMOUNT", 1000.01), /DISCOUNT_FIXED_INVALID/);
  assert.throws(() => calculatePlanPricing(0, "FIXED_AMOUNT", 1), /DISCOUNT_ON_FREE_PLAN_INVALID/);
  assert.throws(() => calculatePlanPricing(1000, "NONE", 1), /DISCOUNT_VALUE_INVALID/);
});

test("plan validation keeps tags as labels and derives payment requirement from price", () => {
  const plain = validatePlanDraft(baseDraft);
  const tagged = validatePlanDraft({
    ...baseDraft,
    popular: true,
    recommended: true,
    discountType: "PERCENTAGE",
    discountValue: 10
  });

  assert.equal(plain.requiresPayment, true);
  assert.equal(plain.taskManagementEnabled, false);
  assert.equal(validatePlanDraft({ ...baseDraft, taskManagementEnabled: true }).taskManagementEnabled, true);
  assert.throws(() => validatePlanDraft({ ...baseDraft, taskManagementEnabled: "true" }), /TASK_MANAGEMENT_ENABLED_INVALID/);
  assert.equal(tagged.requiresPayment, true);
  assert.equal(tagged.popular, true);
  assert.equal(tagged.recommended, true);
  assert.equal(tagged.pricing.finalPriceInr, 900);
  assert.notEqual(plain.pricing.finalPriceInr, tagged.pricing.finalPriceInr);
});

test("plan identifiers and entitlement units are validated server-side", () => {
  assert.throws(
    () => validatePlanDraft({ ...baseDraft, identifier: "Bad Identifier" }),
    /PLAN_IDENTIFIER_INVALID/
  );
  assert.throws(
    () => validatePlanDraft({ ...baseDraft, maxEmployees: 0 }),
    /MAX_EMPLOYEES_INVALID/
  );
  assert.throws(
    () => validatePlanDraft({ ...baseDraft, maxMeetingDurationMinutes: 1441 }),
    /MAX_MEETING_DURATION_MINUTES_INVALID/
  );
  assert.throws(
    () => validatePlanDraft({ ...baseDraft, freeFeatureDays: -1 }),
    /FREE_FEATURE_DAYS_INVALID/
  );
});

test("public purchase eligibility is status-controlled, not client visibility controlled", () => {
  assert.equal(isPlanPubliclyPurchasable({ status: "PUBLIC", archivedAt: null }), true);
  assert.equal(isPlanPubliclyPurchasable({ status: "COMING_SOON", archivedAt: null }), false);
  assert.equal(isPlanPubliclyPurchasable({ status: "PRIVATE", archivedAt: null }), false);
  assert.equal(isPlanPubliclyPurchasable({ status: "PUBLIC", archivedAt: new Date() }), false);
});




test("custom identifiers normalize without changing the stable identity", () => {
  const draft = validatePlanDraft({ ...baseDraft, identifier: "Growth_2026" });
  assert.equal(draft.identifier, "growth_2026");
});

test("invalid price and discount boundaries are rejected server-side", () => {
  assert.throws(() => validatePlanDraft({ ...baseDraft, priceInr: -1 }), /PLAN_PRICE_INVALID/);
  assert.throws(() => validatePlanDraft({ ...baseDraft, priceInr: 10000001 }), /PLAN_PRICE_INVALID/);
  assert.throws(
    () => validatePlanDraft({ ...baseDraft, discountType: "PERCENTAGE", discountValue: 100.01 }),
    /DISCOUNT_PERCENTAGE_INVALID/
  );
  assert.throws(
    () => validatePlanDraft({ ...baseDraft, discountType: "FIXED_AMOUNT", discountValue: 1000.01 }),
    /DISCOUNT_FIXED_INVALID/
  );
});

test("unsupported plan statuses are rejected server-side", () => {
  assert.throws(
    () => validatePlanDraft({ ...baseDraft, status: "DRAFT" as never }),
    /PLAN_STATUS_INVALID/
  );
});
