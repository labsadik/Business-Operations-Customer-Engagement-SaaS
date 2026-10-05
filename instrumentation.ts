import { createOnRequestError } from "@axiomhq/nextjs";
import { logger } from "@/lib/axiom/server";

function isCloudflareWorkers() {
  return (
    typeof navigator !== "undefined" &&
    navigator.userAgent === "Cloudflare-Workers"
  );
}

export async function register() {
  // OpenTelemetry's NodeSDK is not required for Cloudflare Workers and can
  // call Node APIs that are only stubbed by the Workers compatibility layer.
  // Keep it for ordinary Node.js deployments, but never boot it on Workers.
  if (
    !isCloudflareWorkers() &&
    process.env.NEXT_RUNTIME === "nodejs"
  ) {
    await import("./instrumentation.node");
  }
}

export const onRequestError = createOnRequestError(logger);
