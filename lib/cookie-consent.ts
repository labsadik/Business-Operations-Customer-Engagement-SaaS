export const COOKIE_CONSENT_STORAGE_KEY = "canvas_cookie_consent";
export const COOKIE_CONSENT_VERSION = "2026-10-04";

export type ConsentChoice = "accept-all" | "reject-optional" | "custom";

export type ConsentRecord = {
  version: string;
  timestamp: string;
  choice: ConsentChoice;
  essential: true;
};

const VALID_CHOICES: ConsentChoice[] = ["accept-all", "reject-optional", "custom"];

export function createConsentRecord(
  choice: ConsentChoice,
  now = new Date()
): ConsentRecord {
  return {
    version: COOKIE_CONSENT_VERSION,
    timestamp: now.toISOString(),
    choice,
    essential: true
  };
}

export function parseConsentRecord(raw: string | null): ConsentRecord | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<ConsentRecord>;
    if (
      parsed.version !== COOKIE_CONSENT_VERSION ||
      typeof parsed.timestamp !== "string" ||
      Number.isNaN(new Date(parsed.timestamp).getTime()) ||
      !VALID_CHOICES.includes(parsed.choice as ConsentChoice) ||
      parsed.essential !== true
    ) {
      return null;
    }

    return {
      version: COOKIE_CONSENT_VERSION,
      timestamp: parsed.timestamp,
      choice: parsed.choice as ConsentChoice,
      essential: true
    };
  } catch {
    return null;
  }
}

export function serializeConsentRecord(record: ConsentRecord) {
  return JSON.stringify(record);
}
