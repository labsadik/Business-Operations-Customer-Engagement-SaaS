import { createOnRequestError } from "@axiomhq/nextjs";
import { logger } from "@/lib/axiom/server";

type NodeProcessLike = {
  release?: { name?: string };
  cpuUsage?: () => unknown;
};

function isGenuineNodeProcess() {
  const runtimeProcess = (globalThis as typeof globalThis & {
    process?: NodeProcessLike;
  }).process;

  return (
    runtimeProcess?.release?.name === "node" &&
    typeof runtimeProcess.cpuUsage === "function"
  );
}

export async function register() {
  if (!isGenuineNodeProcess()) return;
  await import("./instrumentation.node");
}

export const onRequestError = createOnRequestError(logger);
