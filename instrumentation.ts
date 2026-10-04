import { createOnRequestError } from "@axiomhq/nextjs";
import { logger } from "@/lib/axiom/server";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation.node");
  }
}

export const onRequestError = createOnRequestError(logger);
