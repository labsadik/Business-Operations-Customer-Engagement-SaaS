import { decryptSecret } from "@/lib/security";
import { getMongo } from "@/lib/mongodb";
import { getRedis } from "@/lib/redis";
import { GoogleAccount } from "@/models/google-account";
import { googleApi, refreshGoogleAccessToken } from "@/lib/google";

const GOOGLE_CALENDAR_REQUEST_TIMEOUT_MS = 10000;
const MAX_ACCESS_TOKEN_CACHE_ENTRIES = 500;
// Redis token entries expire 60 seconds before the Google token itself, so a
// 30-second warm cache avoids repeated Redis REST calls while keeping a safety margin.
const TOKEN_CACHE_FROM_REDIS_TTL_MS = 30_000;

// Each warm server instance limits simultaneous Google free/busy traffic.
// A finite queue gives a hard bound during large workspace refreshes.
const MAX_CONCURRENT_FREE_BUSY_REQUESTS = 20;
const MAX_QUEUED_FREE_BUSY_REQUESTS = 500;
let activeFreeBusyRequests = 0;
const queuedFreeBusyRequests: Array<() => void> = [];

async function withFreeBusyCapacity<T>(request: () => Promise<T>): Promise<T> {
  if (activeFreeBusyRequests >= MAX_CONCURRENT_FREE_BUSY_REQUESTS) {
    if (queuedFreeBusyRequests.length >= MAX_QUEUED_FREE_BUSY_REQUESTS) {
      throw new Error("GOOGLE_CALENDAR_BUSY");
    }
    await new Promise<void>((resolve) => queuedFreeBusyRequests.push(resolve));
  } else {
    activeFreeBusyRequests += 1;
  }

  try {
    return await request();
  } finally {
    const next = queuedFreeBusyRequests.shift();
    if (next) next();
    else activeFreeBusyRequests = Math.max(0, activeFreeBusyRequests - 1);
  }
}

const accessTokenMemoryCache = new Map<
  string,
  { accessToken: string; expiresAt: number }
>();
const pendingAccessTokenLoads = new Map<
  string,
  Promise<{ accessToken: string }>
>();

function getMemoryAccessToken(userId: string) {
  const cached = accessTokenMemoryCache.get(userId);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    accessTokenMemoryCache.delete(userId);
    return null;
  }
  // LRU recency without allowing this cache to grow with arbitrary user IDs.
  accessTokenMemoryCache.delete(userId);
  accessTokenMemoryCache.set(userId, cached);
  return cached.accessToken;
}

function rememberAccessToken(userId: string, accessToken: string, ttlMs: number) {
  accessTokenMemoryCache.delete(userId);
  accessTokenMemoryCache.set(userId, {
    accessToken,
    expiresAt: Date.now() + Math.max(1, ttlMs)
  });
  for (const [key, entry] of accessTokenMemoryCache) {
    if (entry.expiresAt <= Date.now()) accessTokenMemoryCache.delete(key);
  }
  while (accessTokenMemoryCache.size > MAX_ACCESS_TOKEN_CACHE_ENTRIES) {
    const oldestKey = accessTokenMemoryCache.keys().next().value;
    if (oldestKey === undefined) break;
    accessTokenMemoryCache.delete(oldestKey);
  }
}

export async function clearGoogleAccessTokenCache(userId: string) {
  accessTokenMemoryCache.delete(userId);
  try {
    const redis = await getRedis();
    if (redis) {
      await redis.del(`google:access:${userId}`);
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : "REDIS_CACHE_CLEAR_FAILED";
    console.warn("[Conventus] Google access-token cache clear failed", { code });
  }
}

async function loadGoogleAccessToken(userId: string) {
  const cacheKey = `google:access:${userId}`;
  let redis: Awaited<ReturnType<typeof getRedis>> = null;

  try {
    redis = await getRedis();
    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          // Redis does not expose remaining TTL through this wrapper. Keep this
          // cache hit only briefly; tokens refreshed by this process use the known expiry.
          rememberAccessToken(userId, cached, TOKEN_CACHE_FROM_REDIS_TTL_MS);
          return { accessToken: cached };
        }
      } catch (error) {
        const code = error instanceof Error ? error.message : "REDIS_CACHE_READ_FAILED";
        console.warn("[Conventus] Google access-token cache read failed", { code });
        redis = null;
      }
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : "REDIS_CACHE_UNAVAILABLE";
    console.warn("[Conventus] Google access-token cache unavailable", { code });
  }

  await getMongo();

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

  const ttl = Math.max(30, Math.floor(refreshed.expires_in) - 60);
  rememberAccessToken(userId, refreshed.access_token, ttl * 1000);

  if (redis) {
    try {
      await redis.set(cacheKey, refreshed.access_token, { EX: ttl });
    } catch (error) {
      const code = error instanceof Error ? error.message : "REDIS_CACHE_WRITE_FAILED";
      console.warn("[Conventus] Google access-token cache write failed", { code });
    }
  }

  return { accessToken: refreshed.access_token };
}

export async function queryFreeBusy(userId: string, timeMin: Date, timeMax: Date) {
  return withFreeBusyCapacity(async () => {
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
  });
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


export async function getGoogleAccessToken(userId: string) {
  const cached = getMemoryAccessToken(userId);
  if (cached) return { accessToken: cached };

  const existing = pendingAccessTokenLoads.get(userId);
  if (existing) return existing;

  const pending = loadGoogleAccessToken(userId);
  pendingAccessTokenLoads.set(userId, pending);
  try {
    return await pending;
  } finally {
    if (pendingAccessTokenLoads.get(userId) === pending) {
      pendingAccessTokenLoads.delete(userId);
    }
  }
}
