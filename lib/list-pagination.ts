import { Types } from "mongoose";

export const DEFAULT_LIST_PAGE_SIZE = 5;
export const MAX_LIST_PAGE_SIZE = 50;

export function parseListLimit(value: string | null, fallback = DEFAULT_LIST_PAGE_SIZE, max = MAX_LIST_PAGE_SIZE) {
  const raw = Number(value ?? String(fallback));
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(raw)));
}

export function encodeListCursor(key: string | Date, id: string | Types.ObjectId) {
  const value = key instanceof Date ? key.toISOString() : key;
  return Buffer.from(JSON.stringify({ key: value, id: String(id) }), "utf8").toString("base64url");
}

export function decodeListCursor(value: string | null) {
  if (!value) return null;
  if (value.length > 1024) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { key?: unknown; id?: unknown };
    if (typeof parsed.key !== "string" || parsed.key.length > 300 || typeof parsed.id !== "string" || !Types.ObjectId.isValid(parsed.id)) {
      return null;
    }
    return { key: parsed.key, id: new Types.ObjectId(parsed.id) };
  } catch {
    return null;
  }
}
