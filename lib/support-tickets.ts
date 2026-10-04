export const SUPPORT_TICKET_STATUSES = ["NOT_SEEN", "PROCESSING", "COMPLETED"] as const;

export type SupportTicketStatus = typeof SUPPORT_TICKET_STATUSES[number];

export const SUPPORT_TICKET_SUBJECT_MAX = 120;
export const SUPPORT_TICKET_DESCRIPTION_MAX = 2000;
export const SUPPORT_TICKET_PAGE_SIZE_MAX = 50;
export const SUPPORT_TICKET_DEDUPE_WINDOW_MS = 2 * 60 * 1000;
export const SUPPORT_TICKET_RATE_WINDOW_MS = 60 * 60 * 1000;
export const SUPPORT_TICKET_RATE_LIMIT = 10;

export function cleanSupportTicketText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.replace(/\u0000/g, "").trim().slice(0, maxLength);
}

export function validateSupportTicketInput(subject: unknown, description: unknown) {
  if (typeof subject !== "string" || !subject.trim()) {
    throw new Error("SUPPORT_TICKET_SUBJECT_REQUIRED");
  }
  if (subject.length > SUPPORT_TICKET_SUBJECT_MAX) {
    throw new Error("SUPPORT_TICKET_SUBJECT_TOO_LONG");
  }
  if (typeof description !== "string" || !description.trim()) {
    throw new Error("SUPPORT_TICKET_DESCRIPTION_REQUIRED");
  }
  if (description.length > SUPPORT_TICKET_DESCRIPTION_MAX) {
    throw new Error("SUPPORT_TICKET_DESCRIPTION_TOO_LONG");
  }

  return {
    subject: cleanSupportTicketText(subject, SUPPORT_TICKET_SUBJECT_MAX),
    description: cleanSupportTicketText(description, SUPPORT_TICKET_DESCRIPTION_MAX)
  };
}

export function validateSupportTicketStatus(value: unknown): SupportTicketStatus {
  if (!SUPPORT_TICKET_STATUSES.includes(value as SupportTicketStatus)) {
    throw new Error("SUPPORT_TICKET_STATUS_INVALID");
  }
  return value as SupportTicketStatus;
}

export function isValidSupportTicketStatusTransition(
  current: SupportTicketStatus,
  next: unknown
): next is SupportTicketStatus {
  if (!SUPPORT_TICKET_STATUSES.includes(next as SupportTicketStatus)) return false;
  if (current === next) return true;
  if (current === "NOT_SEEN") return next === "PROCESSING" || next === "COMPLETED";
  if (current === "PROCESSING") return next === "NOT_SEEN" || next === "COMPLETED";
  return next === "PROCESSING";
}

export function supportTicketStatusLabel(status: SupportTicketStatus) {
  switch (status) {
    case "NOT_SEEN":
      return "Not seen";
    case "PROCESSING":
      return "Processing";
    case "COMPLETED":
      return "Completed";
  }
}
