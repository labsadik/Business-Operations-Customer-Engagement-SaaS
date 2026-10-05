import { decryptSecret } from "@/lib/security";
import { getMongo } from "@/lib/mongodb";
import { getRedis } from "@/lib/redis";
import { GoogleAccount } from "@/models/google-account";
import { googleApi, refreshGoogleAccessToken } from "@/lib/google";

const GOOGLE_CALENDAR_REQUEST_TIMEOUT_MS = 10000;

export async function clearGoogleAccessTokenCache(userId: string) {
  const redis = await getRedis();
  if (redis) await redis.del(`google:access:${userId}`);
}

export async function getGoogleAccessToken(userId: string) {
  await getMongo();
  const redis = await getRedis();
  const cacheKey = `google:access:${userId}`;

  if (redis) {
    const cached = await redis.get(cacheKey);
    if (cached) return { accessToken: cached };
  }

  const account = await GoogleAccount.findOne({ userId, status: "CONNECTED" });
  if (!account) throw new Error("GOOGLE_NOT_CONNECTED");

  const refreshToken = await decryptSecret(account.encryptedRefreshToken);

  let refreshed;
  try {
    refreshed = await refreshGoogleAccessToken(refreshToken);
  } catch (error) {
    account.status = "REAUTH_REQUIRED";
    account.lastErrorAt = new Date();
    account.lastErrorCode =
      error instanceof Error
        ? error.message.slice(0, 200)
        : "GOOGLE_TOKEN_REFRESH_FAILED";
    await account.save();
    if (redis) await redis.del(cacheKey);
    throw error;
  }

  account.accessTokenExpiresAt = new Date(
    Date.now() + refreshed.expires_in * 1000
  );
  account.status = "CONNECTED";
  account.lastSuccessfulSyncAt = new Date();
  account.lastErrorAt = undefined;
  account.lastErrorCode = undefined;
  await account.save();

  if (redis) {
    const ttl = Math.max(30, Math.floor(refreshed.expires_in) - 60);
    await redis.set(cacheKey, refreshed.access_token, { EX: ttl });
  }

  return { accessToken: refreshed.access_token };
}

export async function queryFreeBusy(userId: string, timeMin: Date, timeMax: Date) {
  const { accessToken } = await getGoogleAccessToken(userId);
  return googleApi<
    { calendars?: Record<string, { busy?: Array<{ start: string; end: string }> }> }
  >(
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

export type GoogleCalendarEvent = {
  id: string;
  htmlLink?: string;
  hangoutLink?: string;
  conferenceData?: {
    createRequest?: {
      requestId?: string;
      status?: { statusCode?: string };
    };
    entryPoints?: Array<{
      entryPointType?: string;
      uri?: string;
    }>;
  };
};

export async function getCalendarEvent(userId: string, eventId: string) {
  const { accessToken } = await getGoogleAccessToken(userId);
  return googleApi<GoogleCalendarEvent>(
    accessToken,
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
    { method: "GET" }
  );
}

export async function deleteCalendarEvent(userId: string, eventId: string) {
  const { accessToken } = await getGoogleAccessToken(userId);
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "content-type": "application/json"
      },
      cache: "no-store",
      signal: AbortSignal.timeout(GOOGLE_CALENDAR_REQUEST_TIMEOUT_MS)
    }
  );

  if (response.status === 404) return;
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GOOGLE_API_${response.status}:${body.slice(0, 500)}`);
  }
}

export async function createCalendarEvent(userId: string, input: {
  eventId?: string;
  conferenceRequestId?: string;
  summary: string;
  description?: string;
  startAt: Date;
  endAt: Date;
  attendeeEmails: string[];
}) {
  const { accessToken } = await getGoogleAccessToken(userId);

  const params = new URLSearchParams({
    conferenceDataVersion: "1",
    sendUpdates: "all"
  });

  return googleApi<GoogleCalendarEvent>(
    accessToken,
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
    {
      method: "POST",
      body: JSON.stringify({
        ...(input.eventId ? { id: input.eventId } : {}),
        summary: input.summary,
        description: input.description,
        start: { dateTime: input.startAt.toISOString() },
        end: { dateTime: input.endAt.toISOString() },
        attendees: input.attendeeEmails.map((email) => ({ email })),
        conferenceData: input.conferenceRequestId
          ? {
              createRequest: {
                requestId: input.conferenceRequestId,
                conferenceSolutionKey: { type: "hangoutsMeet" }
              }
            }
          : undefined
      })
    }
  );
}
