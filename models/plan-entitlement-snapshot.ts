import { Schema } from "mongoose";

/**
 * The one canonical schema for the plan entitlements captured by payments,
 * subscriptions, and invoices. The stored values intentionally remain
 * snapshots, while this schema keeps their shape in sync with PlanEntitlements.
 */
export const planEntitlementSnapshotSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    priceInr: { type: Number, required: true, min: 0 },
    maxWorkspaces: { type: Number, required: true, min: 1 },
    maxCompanies: { type: Number, required: true, min: 1 },
    maxEmployees: { type: Number, required: true, min: 1 },
    monthlyMeetingLimit: { type: Number, required: true, min: 1 },
    maxMeetingDurationMinutes: { type: Number, required: true, min: 1 },
    maxConcurrentMeetings: { type: Number, required: true, min: 1 },
    taskManagementEnabled: { type: Boolean, required: true, default: false },
    taskManagementDailyLimit: { type: Number, default: 10, min: 1, max: 1000000 },
    vaultEnabled: { type: Boolean, required: true, default: false },
    vaultQuotaBytes: { type: Number, required: true, default: 5368709120, min: 1048576, max: Number.MAX_SAFE_INTEGER },
    vaultMaxFileBytes: { type: Number, required: true, default: 104857600, min: 1048576, max: 262144000 },
    vaultMaxItems: { type: Number, required: true, default: 1000, min: 1, max: 10000000 },
    liveChatEnabled: { type: Boolean, required: true, default: false },
    liveChatMonthlyLimit: { type: Number, required: true, default: 1000, min: 1, max: 10000000 },
    liveChatCustomerLimit: { type: Number, required: true, default: 500, min: 1, max: 10000000 },
    liveChatAgentLimit: { type: Number, required: true, default: 5, min: 1, max: 1000 },
    liveChatRetentionDays: { type: Number, required: true, default: 30, min: 1, max: 3650 },
    liveChatMessageCooldownSeconds: { type: Number, required: true, default: 15, min: 15, max: 600 },
    liveChatPdfExportEnabled: { type: Boolean, required: true, default: true },
    liveChatDeleteEnabled: { type: Boolean, required: true, default: true },
    validityDays: { type: Number, required: true, min: 1, max: 3650 },
    freeFeatureDays: { type: Number, default: null, min: 0, max: 3650 },
    requiresPayment: { type: Boolean, required: true }
  },
  { _id: false }
);
