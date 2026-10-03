import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(oauthError)}`, request.url));
  }

  const cookieHeader = request.headers.get("cookie") ?? "";
  const expected = cookieHeader.match(/(?:^|; )conventus_oauth_state=([^;]+)/)?.[1];

  if (!state || !expected || state !== expected) {
    return NextResponse.redirect(new URL("/login?error=invalid_oauth_state", request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_oauth_code", request.url));
  }

  // Token exchange, Google identity verification, encrypted refresh-token storage,
  // and session creation are implemented in the identity/tenancy phase.
  return NextResponse.redirect(new URL("/login?error=oauth_exchange_pending", request.url));
}