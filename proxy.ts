import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { logger } from "@/lib/axiom/server";

const TELEMETRY_FLUSH_TIMEOUT_MS = 2000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("TELEMETRY_FLUSH_TIMEOUT"));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export function proxy(request: NextRequest, event: NextFetchEvent) {
  logger.info("API request received", {
    method: request.method,
    path: request.nextUrl.pathname,
    traceparent: request.headers.get("traceparent") ?? undefined
  });

  event.waitUntil(
    withTimeout(logger.flush(), TELEMETRY_FLUSH_TIMEOUT_MS).catch((error) => {
      console.warn("[Conventus] background telemetry flush failed", {
        error: error instanceof Error ? error.message : "UNKNOWN"
      });
    })
  );

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"]
};
