import * as Sentry from "@sentry/nextjs";
import { createOnRequestError } from "@axiomhq/nextjs";
import { logger } from "@/lib/axiom/server";

function isCloudflareWorkers() {
  return (
    typeof navigator !== "undefined" &&
    navigator.userAgent === "Cloudflare-Workers"
  );
}

const axiomOnRequestError = createOnRequestError(logger);

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");

    // OpenTelemetry's NodeSDK is not required for Cloudflare Workers and can
    // call Node APIs that are only stubbed by the Workers compatibility layer.
    if (!isCloudflareWorkers()) {
      await import("./instrumentation.node");
    }
  } else if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Keep both observability backends active. A failure in one exporter should
// not prevent the other backend from receiving the request error.
export async function onRequestError(...args: Parameters<typeof axiomOnRequestError>) {
  await Promise.allSettled([
    Promise.resolve().then(() => Sentry.captureRequestError(...args)),
    Promise.resolve().then(() => axiomOnRequestError(...args))
  ]);
}
