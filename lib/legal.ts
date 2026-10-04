export const LEGAL_CONFIG = {
  siteName: process.env.NEXT_PUBLIC_APP_NAME?.trim() || "Conventus",
  policyVersion: "2026-10-04",
  lastUpdated: "October 4, 2026",
  effectiveDate: "[OWNER REVIEW REQUIRED — confirm effective date before launch]",
  legalEntityName: "[OWNER REVIEW REQUIRED — confirm the legal entity name before launch]",
  legalContact: "[OWNER REVIEW REQUIRED — confirm the legal/privacy contact before launch]",
  jurisdiction: "[OWNER REVIEW REQUIRED — confirm governing law and venue before launch]"
} as const;
