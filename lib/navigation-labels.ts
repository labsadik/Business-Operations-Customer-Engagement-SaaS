export const DEFAULT_NAVIGATION_LABELS = {
  dashboard: "Overview",
  meetings: "Meetings",
  team: "Team",
  feedback: "Feedback",
  supportTickets: "Support tickets",
  announcements: "Announcements",
  billing: "Billing",
  workspaceSettings: "Workspace settings",
  companyProfile: "Company profile",
  adminCompanies: "Companies",
  adminPublicUsers: "Public users",
  adminPlans: "Plans",
  adminAnnouncements: "Announcements",
  adminFeedback: "Feedback",
  adminSupportTickets: "Support tickets",
  adminAccess: "Admin access",
  adminPlatformSettings: "Platform settings"
} as const;

export type NavigationLabels = typeof DEFAULT_NAVIGATION_LABELS;

export function normalizeNavigationLabels(value: unknown): NavigationLabels {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const output = { ...DEFAULT_NAVIGATION_LABELS };

  for (const key of Object.keys(DEFAULT_NAVIGATION_LABELS) as Array<keyof NavigationLabels>) {
    const candidate = input[key];
    if (typeof candidate === "string") {
      const trimmed = candidate.trim().replace(/\\s+/g, " ").slice(0, 80);
      if (trimmed) output[key] = trimmed;
    }
  }

  return output;
}
