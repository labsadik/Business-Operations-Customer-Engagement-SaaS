import {
  createCipheriv,
  createECDH,
  createHmac,
  createPrivateKey,
  randomBytes,
  sign
} from "node:crypto";
import { Types } from "mongoose";
import { PushSubscription } from "@/models/push-subscription";

export type WebPushPayload = {
  id: string;
  title: string;
  body: string;
  url: string;
  tag: string;
  type: "TASK_ASSIGNED" | "MEETING_REQUEST";
};

type PushRecipientEvent = {
  userId: string;
  payload: WebPushPayload;
};

function fromBase64Url(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function toBase64Url(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

function getVapidConfig() {
  const publicKeyText = process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  const privateKeyText = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.WEB_PUSH_VAPID_SUBJECT?.trim();
  if (!publicKeyText || !privateKeyText || !subject) return null;

  const publicKey = fromBase64Url(publicKeyText);
  const privateBytes = fromBase64Url(privateKeyText);
  if (publicKey.length !== 65 || publicKey[0] !== 4 || privateBytes.length !== 32) {
    return null;
  }
  if (!subject.startsWith("mailto:") && !subject.startsWith("https://")) return null;

  return { publicKey, publicKeyText, privateBytes, subject };
}

export function getWebPushPublicKey() {
  const config = getVapidConfig();
  return config?.publicKeyText ?? null;
}

export function isWebPushConfigured() {
  return getVapidConfig() !== null;
}

export function isAllowedPushEndpoint(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
    const host = url.hostname.toLowerCase();
    return [
      "fcm.googleapis.com",
      "updates.push.services.mozilla.com",
      "push.services.mozilla.com",
      "wns2.notify.windows.com",
      "notify.windows.com",
      "web.push.apple.com"
    ].some((allowed) => host === allowed || host.endsWith("." + allowed));
  } catch {
    return false;
  }
}

function vapidAuthorization(endpoint: string, config: NonNullable<ReturnType<typeof getVapidConfig>>) {
  const audience = new URL(endpoint).origin;
  const header = toBase64Url(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const payload = toBase64Url(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: config.subject
  }));
  const unsigned = header + "." + payload;
  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: toBase64Url(config.publicKey.subarray(1, 33)),
    y: toBase64Url(config.publicKey.subarray(33, 65)),
    d: toBase64Url(config.privateBytes),
    ext: true
  };
  const privateKey = createPrivateKey({ key: jwk, format: "jwk" });
  const signature = sign("sha256", Buffer.from(unsigned), {
    key: privateKey,
    dsaEncoding: "ieee-p1363"
  });
  return "vapid t=" + unsigned + "." + toBase64Url(signature) + ", k=" + config.publicKeyText;
}

function hmacSha256(key: Buffer, value: Buffer) {
  return createHmac("sha256", key).update(value).digest();
}

function hkdfExpand(prk: Buffer, info: Buffer, length: number) {
  const blocks: Buffer[] = [];
  let previous = Buffer.alloc(0);
  for (let counter = 1; Buffer.concat(blocks).length < length; counter += 1) {
    previous = hmacSha256(
      prk,
      Buffer.concat([previous, info, Buffer.from([counter])])
    );
    blocks.push(previous);
    if (counter > 255) throw new Error("WEB_PUSH_HKDF_LENGTH_INVALID");
  }
  return Buffer.concat(blocks).subarray(0, length);
}

function encryptPayload(
  payload: WebPushPayload,
  p256dhText: string,
  authText: string,
  config: NonNullable<ReturnType<typeof getVapidConfig>>
) {
  const userPublicKey = fromBase64Url(p256dhText);
  const authSecret = fromBase64Url(authText);
  if (userPublicKey.length !== 65 || userPublicKey[0] !== 4 || authSecret.length < 16) {
    throw new Error("WEB_PUSH_SUBSCRIPTION_KEYS_INVALID");
  }

  const ephemeral = createECDH("prime256v1");
  ephemeral.generateKeys();
  const serverPublicKey = ephemeral.getPublicKey(undefined, "uncompressed");
  const sharedSecret = ephemeral.computeSecret(userPublicKey);
  const keyInfo = Buffer.concat([
    Buffer.from("WebPush: info\0", "utf8"),
    userPublicKey,
    serverPublicKey
  ]);
  const authPrk = hmacSha256(authSecret, sharedSecret);
  const inputKeyMaterial = hkdfExpand(authPrk, keyInfo, 32);

  const salt = randomBytes(16);
  const prk = hmacSha256(salt, inputKeyMaterial);
  const contentKey = hkdfExpand(prk, Buffer.from("Content-Encoding: aes128gcm\0", "utf8"), 16);
  const nonce = hkdfExpand(prk, Buffer.from("Content-Encoding: nonce\0", "utf8"), 12);
  const plaintext = Buffer.concat([
    Buffer.from(JSON.stringify(payload), "utf8"),
    Buffer.from([2])
  ]);
  if (plaintext.length > 3900) throw new Error("WEB_PUSH_PAYLOAD_TOO_LARGE");

  const cipher = createCipheriv("aes-128-gcm", contentKey, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(4096, 0);
  const header = Buffer.concat([
    salt,
    recordSize,
    Buffer.from([serverPublicKey.length]),
    serverPublicKey
  ]);
  return Buffer.concat([header, ciphertext]);
}

async function sendOne(
  endpoint: string,
  p256dh: string,
  auth: string,
  payload: WebPushPayload,
  config: NonNullable<ReturnType<typeof getVapidConfig>>
) {
  if (!isAllowedPushEndpoint(endpoint)) return { expired: false };
  const body = encryptPayload(payload, p256dh, auth, config);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: vapidAuthorization(endpoint, config),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "300",
      Urgency: "high"
    },
    body,
    signal: AbortSignal.timeout(5000),
    cache: "no-store",
    redirect: "error"
  });
  return { expired: response.status === 404 || response.status === 410 };
}

/**
 * Best-effort fanout with a small fixed concurrency. Notification delivery must
 * never fail a task/booking write, and every recipient is loaded from server-side
 * records rather than trusting the client to pick a destination user.
 */
export async function sendWebPushNotifications(events: PushRecipientEvent[]) {
  const config = getVapidConfig();
  if (!config || !events.length) return;

  const normalized = events
    .filter((event) => Types.ObjectId.isValid(event.userId))
    .slice(0, 100);
  if (!normalized.length) return;
  const userIds = [...new Set(normalized.map((event) => event.userId))].map((id) => new Types.ObjectId(id));
  const subscriptions = await PushSubscription.find({ userId: { $in: userIds } })
    .select("_id userId endpoint p256dh auth")
    .limit(300)
    .lean();
  const byUser = new Map<string, typeof subscriptions>();
  for (const subscription of subscriptions) {
    const key = String(subscription.userId);
    byUser.set(key, [...(byUser.get(key) ?? []), subscription]);
  }

  const jobs: Array<{ id: Types.ObjectId; endpoint: string; run: () => Promise<boolean> }> = [];
  for (const event of normalized) {
    for (const subscription of byUser.get(event.userId) ?? []) {
      jobs.push({
        id: subscription._id,
        endpoint: subscription.endpoint,
        run: async () => {
          const result = await sendOne(subscription.endpoint, subscription.p256dh, subscription.auth, event.payload, config);
          return result.expired;
        }
      });
    }
  }

  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const index = next;
      next += 1;
      const job = jobs[index];
      try {
        if (await job.run()) await PushSubscription.deleteOne({ _id: job.id });
      } catch {
        // Push service outages and stale subscriptions must not break application work.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(5, jobs.length) }, () => worker()));
}
