/** Parse an optional sample rate without allowing invalid telemetry settings to break startup. */
export function readSentrySampleRate(value: string | undefined, fallback: number): number {
  if (typeof value !== "string" || value.trim() === "") return fallback;

  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return fallback;
  return parsed;
}
