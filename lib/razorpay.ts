import { createHmac, timingSafeEqual } from "node:crypto";

const RAZORPAY_BASE_URL = "https://api.razorpay.com/v1";

type RazorpayResponse = Record<string, unknown>;

function credentials() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("RAZORPAY_NOT_CONFIGURED");
  return { keyId, keySecret };
}

function authorization(keyId: string, keySecret: string) {
  return "Basic " + Buffer.from(keyId + ":" + keySecret).toString("base64");
}

async function razorpayRequest<T extends RazorpayResponse>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const { keyId, keySecret } = credentials();
  const response = await fetch(RAZORPAY_BASE_URL + path, {
    ...init,
    headers: {
      Authorization: authorization(keyId, keySecret),
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  });
  const body = await response.text();
  let parsed: T;
  try {
    parsed = body ? JSON.parse(body) as T : ({} as T);
  } catch {
    parsed = {} as T;
  }
  if (!response.ok) {
    const message =
      typeof parsed.error === "object" && parsed.error && "description" in parsed.error
        ? String((parsed.error as { description?: unknown }).description ?? "Razorpay request failed")
        : "Razorpay request failed";
    throw new Error("RAZORPAY_API_" + response.status + ":" + message.slice(0, 400));
  }
  return parsed;
}

export function razorpayKeyId() {
  return credentials().keyId;
}

export async function createRazorpayOrder(input: {
  amount: number;
  currency: "INR";
  receipt: string;
  notes: Record<string, string>;
}) {
  return razorpayRequest<{
    id: string;
    entity: string;
    amount: number;
    currency: string;
    receipt: string;
  }>("/orders", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function fetchRazorpayPayment(paymentId: string) {
  return razorpayRequest<{
    id: string;
    order_id?: string;
    amount?: number;
    currency?: string;
    status?: string;
    created_at?: number;
  }>("/payments/" + encodeURIComponent(paymentId), { method: "GET" });
}

export function verifyRazorpayPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string
) {
  const { keySecret } = credentials();
  const expected = createHmac("sha256", keySecret)
    .update(orderId + "|" + paymentId)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  return expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer);
}

export function verifyRazorpayWebhookSignature(body: string, signature: string) {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret || !signature) return false;
  const expected = createHmac("sha256", webhookSecret).update(body).digest("hex");
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  return expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer);
}
