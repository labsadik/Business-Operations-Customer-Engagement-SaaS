export function encodeHistoryCursor(occurredAt: Date, id: string) {
  return Buffer.from(
    JSON.stringify({ at: occurredAt.toISOString(), id }),
    "utf8"
  ).toString("base64url");
}

export function decodeHistoryCursor(value: string | null) {
  if (!value) return null;

  try {
    const decoded = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8")
    ) as { at?: string; id?: string };

    if (!decoded.at || !decoded.id) return null;

    const at = new Date(decoded.at);
    if (Number.isNaN(at.getTime())) return null;

    return { at, id: decoded.id };
  } catch {
    return null;
  }
}
