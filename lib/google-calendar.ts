import { decryptSecret } from "@/lib/security";
import { getMongo } from "@/lib/mongodb";
import { GoogleAccount } from "@/models/google-account";
import { googleApi, refreshGoogleAccessToken } from "@/lib/google";

export async function getGoogleAccessToken(userId: string) {
  await getMongo();
  const account = await GoogleAccount.findOne({ userId, status: "CONNECTED" });
  if (!account) throw new Error("GOOGLE_NOT_CONNECTED");

  const refreshToken = await decryptSecret(account.encryptedRefreshToken);
  const refreshed = await refreshGoogleAccessToken(refreshToken);

  account.accessTokenExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
  account.status = "CONNECTED";
  account.lastSuccessfulSyncAt = new Date();
  await account.save();

  return { accessToken: refreshed.access_token };
}

export async function queryFreeBusy(userId: string, timeMin: Date, timeMax: Date) {
  const { accessToken } = await getGoogleAccessToken(userId);

  return googleApi<{ calendars?: Record<string, { busy?: Array<{ start: string; end: string }> }> }>(
    accessToken,
    "https://www.googleapis.com/calendar/v3/freeBusy",
    {
      method: "POST",
      body: JSON.stringify({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        items: [{ id: "primary" }]
      })
    }
  );
}

export async function createCalendarEvent(userId: string, input: {
  summary: string;
  description?: string;
  startAt: Date;
  endAt: Date;
  attendeeEmails: string[];
  meetingUri: string;
}) {
  const { accessToken } = await getGoogleAccessToken(userId);

  return googleApi<{ id: string; htmlLink?: string }>(
    accessToken,
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    {
      method: "POST",
      body: JSON.stringify({
        summary: input.summary,
        description: input.description,
        start: { dateTime: input.startAt.toISOString() },
        end: { dateTime: input.endAt.toISOString() },
        attendees: input.attendeeEmails.map((email) => ({ email })),
        location: input.meetingUri
      })
    }
  );
}
