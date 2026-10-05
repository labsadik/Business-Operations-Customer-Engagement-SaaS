import { createOnRequestError } from "@axiomhq/nextjs";
import { logger } from "@/lib/axiom/server";

function isGenuineNodeProcess() {
  return (
    typeof process !== "undefined" &&
    typeof process.cpuUsage === "function"
  );
}

export async function register() {
  if (!isGenuineNodeProcess()) return;
  await import("./instrumentation.node");
}

export const onRequestError = createOnRequestError(logger);
