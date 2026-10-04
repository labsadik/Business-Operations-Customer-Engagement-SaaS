export const PLATFORM_ANNOUNCEMENT_AUDIENCES = [
  "LANDING_PAGE",
  "ALL_COMPANIES",
  "SELECTED_COMPANIES"
] as const;

export const PLATFORM_ANNOUNCEMENT_STATUSES = ["DRAFT", "PUBLISHED"] as const;

export const FEEDBACK_SOURCES = ["CUSTOMER_BOOKING", "COMPANY_PLATFORM"] as const;
export const FEEDBACK_REVIEW_STATUSES = ["NEW", "REVIEWED", "RESOLVED"] as const;

export type PlatformAnnouncementAudience = typeof PLATFORM_ANNOUNCEMENT_AUDIENCES[number];
export type PlatformAnnouncementStatus = typeof PLATFORM_ANNOUNCEMENT_STATUSES[number];
export type FeedbackSource = typeof FEEDBACK_SOURCES[number];
export type FeedbackReviewStatus = typeof FEEDBACK_REVIEW_STATUSES[number];

export function cleanPlainText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.replace(/\u0000/g, "").trim().slice(0, maxLength);
}

export function validateAnnouncementContent(title: unknown, message: unknown) {
  if (typeof title !== "string" || !title.trim()) {
    throw new Error("ANNOUNCEMENT_TITLE_REQUIRED");
  }
  if (typeof message !== "string" || !message.trim()) {
    throw new Error("ANNOUNCEMENT_MESSAGE_REQUIRED");
  }
  if (title.length > 120) throw new Error("ANNOUNCEMENT_TITLE_TOO_LONG");
  if (message.length > 500) throw new Error("ANNOUNCEMENT_MESSAGE_TOO_LONG");

  return {
    title: cleanPlainText(title, 120),
    message: cleanPlainText(message, 500)
  };
}

export function validateAnnouncementAudience(
  audience: unknown,
  rawCompanyIds: unknown
) {
  if (!PLATFORM_ANNOUNCEMENT_AUDIENCES.includes(audience as PlatformAnnouncementAudience)) {
    throw new Error("INVALID_ANNOUNCEMENT_AUDIENCE");
  }

  const companyIds = Array.isArray(rawCompanyIds)
    ? [...new Set(rawCompanyIds.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean))]
    : [];

  if (companyIds.length > 50) throw new Error("TOO_MANY_ANNOUNCEMENT_TARGETS");

  if (audience === "SELECTED_COMPANIES" && companyIds.length === 0) {
    throw new Error("ANNOUNCEMENT_TARGETS_REQUIRED");
  }

  if (audience !== "SELECTED_COMPANIES" && companyIds.length > 0) {
    throw new Error("ANNOUNCEMENT_TARGETS_NOT_ALLOWED");
  }

  return companyIds;
}

export function validateAnnouncementStatus(value: unknown): PlatformAnnouncementStatus {
  if (!PLATFORM_ANNOUNCEMENT_STATUSES.includes(value as PlatformAnnouncementStatus)) {
    throw new Error("INVALID_ANNOUNCEMENT_STATUS");
  }
  return value as PlatformAnnouncementStatus;
}

export function validateFeedbackInput(rating: unknown, description: unknown) {
  if (!Number.isInteger(rating) || Number(rating) < 1 || Number(rating) > 5) {
    throw new Error("FEEDBACK_RATING_INVALID");
  }
  const cleanDescription = cleanPlainText(description, 300);
  if (typeof description === "string" && description.length > 300) {
    throw new Error("FEEDBACK_DESCRIPTION_TOO_LONG");
  }
  return {
    rating: Number(rating),
    description: cleanDescription
  };
}

export function canSeeCompanyPlatformFeedback(role: string) {
  return role === "COMPANY_OWNER" || role === "COMPANY_ADMIN";
}

export function isValidFeedbackStatusTransition(
  current: FeedbackReviewStatus,
  next: unknown
): next is FeedbackReviewStatus {
  if (!FEEDBACK_REVIEW_STATUSES.includes(next as FeedbackReviewStatus)) return false;
  if (current === next) return true;
  if (current === "NEW") return next === "REVIEWED" || next === "RESOLVED";
  if (current === "REVIEWED") return next === "NEW" || next === "RESOLVED";
  return next === "REVIEWED";
}
