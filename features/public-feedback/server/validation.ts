export type PublicEmbeddedFeedbackInput = {
  name: string;
  email: string;
  phone: string;
  rating: number;
  description: string;
};

function requiredText(value: unknown, field: string, maxLength: number) {
  if (typeof value !== "string") throw new Error(field + "_REQUIRED");
  const cleaned = value.replace(/\u0000/g, "").trim();
  if (!cleaned) throw new Error(field + "_REQUIRED");
  if (cleaned.length > maxLength) throw new Error(field + "_TOO_LONG");
  return cleaned;
}

export function validatePublicEmbeddedFeedback(value: unknown): PublicEmbeddedFeedbackInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("FEEDBACK_INPUT_INVALID");
  }

  const body = value as Record<string, unknown>;
  const name = requiredText(body.name, "FEEDBACK_NAME", 100);
  const email = requiredText(body.email, "FEEDBACK_EMAIL", 254).toLowerCase();
  const phone = requiredText(body.phone, "FEEDBACK_PHONE", 32);
  const description = requiredText(body.description, "FEEDBACK_DESCRIPTION", 1000);

  if (description.length < 5) throw new Error("FEEDBACK_DESCRIPTION_TOO_SHORT");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("FEEDBACK_EMAIL_INVALID");
  if (!/^[+0-9().\-\s]+$/.test(phone)) throw new Error("FEEDBACK_PHONE_INVALID");
  const phoneDigits = phone.replace(/\D/g, "");
  if (phoneDigits.length < 7 || phoneDigits.length > 15) throw new Error("FEEDBACK_PHONE_INVALID");

  if (!Number.isInteger(body.rating) || Number(body.rating) < 1 || Number(body.rating) > 5) {
    throw new Error("FEEDBACK_RATING_INVALID");
  }

  return { name, email, phone, rating: Number(body.rating), description };
}
