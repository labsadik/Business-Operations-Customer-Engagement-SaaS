import { NextResponse } from "next/server";
import { getMongo } from "@/lib/mongodb";
import { OAuthState } from "@/models/oauth-state";
import { GOOGLE_FULL_SCOPES } from "@/lib/google";
import { getSession } from "@/lib/session";
import { randomToken } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_INTENTS = ["workspace", "customer", "employee", "connect"] as const;
type Intent = (typeof ALLOWED_INTENTS)[number];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedIntent = url.searchParams.get("intent") ?? "workspace";
  const intent: Intent = ALLOWED_INTENTS.includes(requestedIntent as Intent) ? requestedIntent as Intent : "workspace";
  const companySlug = url.searchParams.get("companySlug") || undefined;
  const invitationToken = url.searchParams.get("invitationToken") || undefined;
  const requestedReturnTo = url.searchParams.get("returnTo") || undefined;

  if ((intent === "customer" || intent === "employee") && !companySlug && !invitationToken) {
    return NextResponse.redirect(new URL("/login?error=missing_company_context", request.url));
  }

  const currentSession = await getSession();
  if (intent === "connect" && !currentSession) {
    return NextResponse.redirect(new URL("/login?error=signin_required", request.url));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return NextResponse.redirect(new URL("/login?error=google_not_configured", request.url));
  }

  const returnTo =
    requestedReturnTo ||
    (intent === "customer" && companySlug ? `/${companySlug}` :
      intent === "employee" ? "/dashboard?employee=connected" :
      intent === "connect" ? "/dashboard?google=connected" : "/dashboard");

  const state = randomToken(24);
  await getMongo();
  await OAuthState.create({
    state,
    intent,
    companySlug,
    invitationToken,
    returnTo,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000)
  });

  const scope = intent === "connect"
    ? GOOGLE_FULL_SCOPES.join(" ")
    : "openid email profile";

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: intent === "connect" ? "consent" : "select_account",
    scope,
    state
  });

  const response = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  response.cookies.set("conventus_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/api/auth/google"
  });
  return response;
}