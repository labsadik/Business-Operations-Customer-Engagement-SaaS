export const PLAN_IDS = ["free", "starter", "elite", "pro", "plus"] as const;

export type PlanId = string;

export type PlanEntitlements = {
  id: string;
  name: string;
  priceInr: number;
  maxWorkspaces: number;
  maxCompanies: number;
  maxEmployees: number;
  monthlyMeetingLimit: number;
  maxMeetingDurationMinutes: number;
  maxConcurrentMeetings: number;
  taskManagementEnabled: boolean;
  taskManagementDailyLimit: number | null;
  vaultEnabled: boolean;
  vaultQuotaBytes: number;
  vaultMaxFileBytes: number;
  vaultMaxItems: number;
  liveChatEnabled: boolean;
  liveChatMonthlyLimit: number;
  liveChatCustomerLimit: number;
  liveChatAgentLimit: number;
  liveChatRetentionDays: number;
  liveChatMessageCooldownSeconds: number;
  liveChatPdfExportEnabled: boolean;
  liveChatDeleteEnabled: boolean;
  validityDays: number;
  freeFeatureDays: number | null;
  requiresPayment: boolean;
};

export const PLANS: Record<PlanId, PlanEntitlements> = {
  free: {
    id: "free",
    name: "Free",
    priceInr: 0,
    maxWorkspaces: 1,
    maxCompanies: 1,
    maxEmployees: 1,
    monthlyMeetingLimit: 10,
    maxMeetingDurationMinutes: 5,
    maxConcurrentMeetings: 1,
    taskManagementEnabled: false,
    taskManagementDailyLimit: 10,
    vaultEnabled: false,
    vaultQuotaBytes: 5368709120,
    vaultMaxFileBytes: 104857600,
    vaultMaxItems: 1000,
    liveChatEnabled: false,
    liveChatMonthlyLimit: 1000,
    liveChatCustomerLimit: 500,
    liveChatAgentLimit: 5,
    liveChatRetentionDays: 30,
    liveChatMessageCooldownSeconds: 15,
    liveChatPdfExportEnabled: true,
    liveChatDeleteEnabled: true,
    validityDays: 30,
    freeFeatureDays: 14,
    requiresPayment: false
  },
  starter: {
    id: "starter",
    name: "Starter",
    priceInr: 99,
    maxWorkspaces: 1,
    maxCompanies: 1,
    maxEmployees: 10,
    monthlyMeetingLimit: 100,
    maxMeetingDurationMinutes: 20,
    maxConcurrentMeetings: 10,
    taskManagementEnabled: false,
    taskManagementDailyLimit: 10,
    vaultEnabled: false,
    vaultQuotaBytes: 5368709120,
    vaultMaxFileBytes: 104857600,
    vaultMaxItems: 1000,
    liveChatEnabled: false,
    liveChatMonthlyLimit: 1000,
    liveChatCustomerLimit: 500,
    liveChatAgentLimit: 5,
    liveChatRetentionDays: 30,
    liveChatMessageCooldownSeconds: 15,
    liveChatPdfExportEnabled: true,
    liveChatDeleteEnabled: true,
    validityDays: 30,
    freeFeatureDays: null,
    requiresPayment: true
  },
  elite: {
    id: "elite",
    name: "Elite",
    priceInr: 399,
    maxWorkspaces: 1,
    maxCompanies: 1,
    maxEmployees: 50,
    monthlyMeetingLimit: 850,
    maxMeetingDurationMinutes: 60,
    maxConcurrentMeetings: 25,
    taskManagementEnabled: false,
    taskManagementDailyLimit: 10,
    vaultEnabled: false,
    vaultQuotaBytes: 5368709120,
    vaultMaxFileBytes: 104857600,
    vaultMaxItems: 1000,
    liveChatEnabled: false,
    liveChatMonthlyLimit: 1000,
    liveChatCustomerLimit: 500,
    liveChatAgentLimit: 5,
    liveChatRetentionDays: 30,
    liveChatMessageCooldownSeconds: 15,
    liveChatPdfExportEnabled: true,
    liveChatDeleteEnabled: true,
    validityDays: 30,
    freeFeatureDays: null,
    requiresPayment: true
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceInr: 799,
    maxWorkspaces: 1,
    maxCompanies: 1,
    maxEmployees: 100,
    monthlyMeetingLimit: 1500,
    maxMeetingDurationMinutes: 90,
    maxConcurrentMeetings: 50,
    taskManagementEnabled: false,
    taskManagementDailyLimit: 10,
    vaultEnabled: false,
    vaultQuotaBytes: 5368709120,
    vaultMaxFileBytes: 104857600,
    vaultMaxItems: 1000,
    liveChatEnabled: false,
    liveChatMonthlyLimit: 1000,
    liveChatCustomerLimit: 500,
    liveChatAgentLimit: 5,
    liveChatRetentionDays: 30,
    liveChatMessageCooldownSeconds: 15,
    liveChatPdfExportEnabled: true,
    liveChatDeleteEnabled: true,
    validityDays: 30,
    freeFeatureDays: null,
    requiresPayment: true
  },
  plus: {
    id: "plus",
    name: "Plus",
    priceInr: 1499,
    maxWorkspaces: 1,
    maxCompanies: 1,
    maxEmployees: 250,
    monthlyMeetingLimit: 3000,
    maxMeetingDurationMinutes: 120,
    maxConcurrentMeetings: 100,
    taskManagementEnabled: false,
    taskManagementDailyLimit: 10,
    vaultEnabled: false,
    vaultQuotaBytes: 5368709120,
    vaultMaxFileBytes: 104857600,
    vaultMaxItems: 1000,
    liveChatEnabled: false,
    liveChatMonthlyLimit: 1000,
    liveChatCustomerLimit: 500,
    liveChatAgentLimit: 5,
    liveChatRetentionDays: 30,
    liveChatMessageCooldownSeconds: 15,
    liveChatPdfExportEnabled: true,
    liveChatDeleteEnabled: true,
    validityDays: 30,
    freeFeatureDays: null,
    requiresPayment: true
  }
};

export function getPlan(planId: string | null | undefined): PlanEntitlements | null {
  if (!planId || !(planId in PLANS)) return null;
  return PLANS[planId as PlanId];
}

export const STANDARD_MEETING_DURATIONS_MINUTES = [5, 10, 15, 20, 25, 30, 35, 45, 60, 90, 120] as const;

export function getMeetingDurationOptions(
  planMaxMinutes: number,
  configured: number[] = []
) {
  if (!Number.isInteger(planMaxMinutes) || planMaxMinutes <= 0) return [];

  return [...new Set(configured)]
    .filter(
      (minutes) =>
        Number.isInteger(minutes) &&
        minutes > 0 &&
        minutes <= planMaxMinutes
    )
    .sort((a, b) => a - b);
}

export function resolveMeetingDuration(
  planMaxMinutes: number,
  configured: number[],
  requestedDurationMinutes: number
) {
  const options = getMeetingDurationOptions(planMaxMinutes, configured);

  if (options.length === 0) {
    throw new Error("MEETING_DURATION_NOT_CONFIGURED");
  }

  if (
    !Number.isInteger(requestedDurationMinutes) ||
    !options.includes(requestedDurationMinutes)
  ) {
    throw new Error("INVALID_DURATION");
  }

  return {
    durationMinutes: requestedDurationMinutes,
    allowedDurationsMinutes: options
  };
}
