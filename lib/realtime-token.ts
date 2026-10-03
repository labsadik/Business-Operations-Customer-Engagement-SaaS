import { createHmac, timingSafeEqual } from "node:crypto";

type RealtimeTokenPayload = {
  userId: string;
  companyId: string;
  role: string;
  exp: number;
};

function secret() {
  const value = process.env.REALTIME_SECRET || process.env.AUTH_SECRET;
  if (!value) throw new Error("REALTIME_SECRET_NOT_CONFIGURED");
  return value;
}

function encode(payload: RealtimeTokenPayload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function signature(body: string) {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

export function createRealtimeToken(input: {
  userId: string;
  companyId: string;
  role: string;
}) {
  const payload: RealtimeTokenPayload = {
    ...input,
    exp: Math.floor(Date.now() / 1000) + 10 * 60
  };
  const body = encode(payload);
  return body + "." + signature(body);
}

export function verifyRealtimeToken(token: string): RealtimeTokenPayload | null {
  const [body, supplied] = token.split(".");
  if (!body || !supplied) return null;

  const expected = signature(body);
  if (supplied.length !== expected.length) return null;

  const valid = timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
  if (!valid) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as RealtimeTokenPayload;
    if (
      !payload.userId ||
      !payload.companyId ||
      !payload.role ||
      !Number.isFinite(payload.exp) ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
