const GOOGLE_REQUEST_TIMEOUT_MS = 10000;

type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
  id_token?: string;
};

type GoogleUserInfo = {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

const AUTH_SCOPES = ["openid", "email", "profile"];
const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/calendar.events"
];
export const GOOGLE_FULL_SCOPES = [...new Set([...AUTH_SCOPES, ...CALENDAR_SCOPES])];

function googleFetch(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(GOOGLE_REQUEST_TIMEOUT_MS)
  });
}

export async function exchangeGoogleCode(code: string, redirectUri: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("GOOGLE_OAUTH_NOT_CONFIGURED");

  const response = await googleFetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code"
    }),
    cache: "no-store"
  });

  if (!response.ok) throw new Error("GOOGLE_TOKEN_EXCHANGE_FAILED");
  return (await response.json()) as GoogleTokenResponse;
}

export async function fetchGoogleUserInfo(accessToken: string) {
  const response = await googleFetch(
    "https://openidconnect.googleapis.com/v1/userinfo",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store"
    }
  );

  if (!response.ok) throw new Error("GOOGLE_USERINFO_FAILED");
  return (await response.json()) as GoogleUserInfo;
}

export async function refreshGoogleAccessToken(refreshToken: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("GOOGLE_OAUTH_NOT_CONFIGURED");

  const response = await googleFetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    }),
    cache: "no-store"
  });

  if (!response.ok) throw new Error("GOOGLE_TOKEN_REFRESH_FAILED");
  return (await response.json()) as GoogleTokenResponse;
}

export async function googleApi<T>(accessToken: string, url: string, init?: RequestInit) {
  const response = await googleFetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GOOGLE_API_${response.status}:${body.slice(0, 500)}`);
  }

  return (await response.json()) as T;
}
