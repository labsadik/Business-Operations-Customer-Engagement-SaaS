import { decryptSecret } from "@/lib/security";
import { getMongo } from "@/lib/mongodb";
import { getRedis } from "@/lib/redis";
import { GoogleAccount } from "@/models/google-account";
import { googleApi, refreshGoogleAccessToken } from "@/lib/google";

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
    account.lastErrorCode = error instanceof Error ? error.message.slice(0, 200) : "GOOGLE_TOKEN_REFRESH_FAILED";
    await account.save();
    if (redis) await redis.del(cacheKey);
    throw error;
  }

  account.accessTokenExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
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
