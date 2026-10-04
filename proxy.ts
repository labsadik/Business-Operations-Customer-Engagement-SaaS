import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { logger } from "@/lib/axiom/server";

export function proxy(request: NextRequest, event: NextFetchEvent) {
  logger.info("API request received", {
    method: request.method,
    path: request.nextUrl.pathname,
    traceparent: request.headers.get("traceparent") ?? undefined
  });

  event.waitUntil(logger.flush());

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"]
};
