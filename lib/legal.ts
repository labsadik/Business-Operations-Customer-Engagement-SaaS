export const LEGAL_CONFIG = {
  siteName: process.env.NEXT_PUBLIC_APP_NAME?.trim() || "Canvas",
  policyVersion: "2026-10-12",
  lastUpdated: "October 12, 2026",
  effectiveDate: "[OWNER REVIEW REQUIRED — confirm effective date before launch]",
  legalEntityName: "AlgoQuit",
  legalContact: "[OWNER REVIEW REQUIRED — confirm the legal/privacy contact before launch]",
  jurisdiction: "[OWNER REVIEW REQUIRED — confirm governing law and venue before launch]"
} as const;
