export const GOOGLE_SCHEDULING_SCOPES = [
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/meetings.space.created"
] as const;

type GoogleSchedulingAccount = {
  status: string;
  scopes?: string[];
};

export function isGoogleSchedulingReady(account: GoogleSchedulingAccount | null | undefined) {
  if (!account || account.status !== "CONNECTED") return false;
  const scopes = new Set(account.scopes ?? []);
  return GOOGLE_SCHEDULING_SCOPES.every((scope) => scopes.has(scope));
}
