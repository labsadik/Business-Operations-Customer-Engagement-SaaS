import { Types } from "mongoose";

export const TASK_PAGE_SIZE_DEFAULT = 25;
export const TASK_PAGE_SIZE_MAX = 100;

export function parseTaskLimit(value: string | null) {
  const raw = Number(value ?? String(TASK_PAGE_SIZE_DEFAULT));
  if (!Number.isFinite(raw)) return TASK_PAGE_SIZE_DEFAULT;
  return Math.min(TASK_PAGE_SIZE_MAX, Math.max(1, Math.floor(raw)));
}

export function encodeTaskCursor(createdAt: Date, id: string) {
  return Buffer.from(JSON.stringify({ at: createdAt.toISOString(), id }), "utf8").toString("base64url");
}

export function decodeTaskCursor(value: string | null) {
  if (!value) return null;
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { at?: unknown; id?: unknown };
    const at = typeof decoded.at === "string" ? new Date(decoded.at) : new Date(NaN);
    if (!Number.isFinite(at.getTime()) || typeof decoded.id !== "string" || !Types.ObjectId.isValid(decoded.id)) {
      return null;
    }
    return { at, id: new Types.ObjectId(decoded.id) };
  } catch {
    return null;
  }
}
