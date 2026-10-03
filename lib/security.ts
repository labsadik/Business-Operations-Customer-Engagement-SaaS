import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function getEncryptionKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY is not configured");
  const key = Buffer.from(raw, "base64url");
  if (key.length !== 32) throw new Error("ENCRYPTION_KEY must decode to exactly 32 bytes");
  return key;
}

export async function encryptSecret(plainText: string) {
  const crypto = await import("node:crypto");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, ciphertext]).toString("base64url");
}

export async function decryptSecret(payload: string) {
  const crypto = await import("node:crypto");
  const raw = Buffer.from(payload, "base64url");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

function getMeetingTokenKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY is not configured");
  const key = Buffer.from(raw, "base64url");
  if (key.length !== 32) throw new Error("ENCRYPTION_KEY must decode to exactly 32 bytes");
  return key;
}

function signMeetingTokenPayload(payload: string) {
  return createHmac("sha256", getMeetingTokenKey()).update(payload).digest("base64url");
}

export function createMeetingAccessToken(meetingId: string, expiresAt?: Date) {
  const expiry = expiresAt?.getTime() ?? Date.now() + 7 * 24 * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ m: meetingId, e: expiry }), "utf8").toString("base64url");
  return `${payload}.${signMeetingTokenPayload(payload)}`;
}

export function verifyMeetingAccessToken(token: string) {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) throw new Error("INVALID_MEETING_TOKEN");

  const expected = signMeetingTokenPayload(payload);
  const providedBuffer = Buffer.from(signature, "base64url");
  const expectedBuffer = Buffer.from(expected, "base64url");

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    throw new Error("INVALID_MEETING_TOKEN");
  }

  let parsed: { m?: string; e?: number };
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { m?: string; e?: number };
  } catch {
    throw new Error("INVALID_MEETING_TOKEN");
  }

  if (!parsed.m || !parsed.e || !Number.isFinite(parsed.e) || parsed.e <= Date.now()) {
    throw new Error("MEETING_TOKEN_EXPIRED");
  }

  return { meetingId: parsed.m };
}
