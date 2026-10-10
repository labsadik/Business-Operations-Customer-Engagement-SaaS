const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type LiveChatSettingsDraft = {
  publicWidgetEnabled: boolean;
  title: string;
  welcomeMessage: string;
  primaryColor: string;
  theme: "LIGHT" | "DARK";
  position: "LEFT" | "RIGHT";
  collectName: boolean;
  collectEmail: boolean;
  collectPhone: boolean;
  allowedDomains: string[];
};

export function normalizeDomain(value: string): string | null {
  const raw = value.trim();
  if (!raw || raw.length > 255 || raw.includes("*")) return null;
  try {
    const parsed = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : "https://" + raw);
    if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname) return null;
    if (parsed.username || parsed.password) return null;
    return parsed.host.toLowerCase();
  } catch {
    return null;
  }
}

export function normalizeDomainList(value: unknown): string[] {
  const entries = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : typeof value === "string" ? value.split(/[\n,]/) : [];
  const result = new Set<string>();
  for (const entry of entries) {
    if (!entry.trim()) continue;
    const domain = normalizeDomain(entry);
    if (!domain) throw new Error("LIVE_CHAT_DOMAIN_INVALID");
    result.add(domain);
  }
  if (result.size > 30) throw new Error("LIVE_CHAT_TOO_MANY_DOMAINS");
  return [...result];
}

export function isAllowedOrigin(origin: string, domains: string[]): boolean {
  try {
    const parsed = new URL(origin);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    const host = parsed.host.toLowerCase();
    return domains.some((entry) => {
      const allowed = normalizeDomain(entry);
      if (!allowed) return false;
      return host === allowed || (!host.includes(":") && host.endsWith("." + allowed));
    });
  } catch {
    return false;
  }
}

export function validateLiveChatSettingsDraft(input: Record<string, unknown>): LiveChatSettingsDraft {
  const bool = (key: string, fallback: boolean) => input[key] === undefined ? fallback :
    typeof input[key] === "boolean" ? input[key] as boolean : (() => { throw new Error("LIVE_CHAT_SETTINGS_INVALID"); })();
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const welcomeMessage = typeof input.welcomeMessage === "string" ? input.welcomeMessage.trim() : "";
  const primaryColor = typeof input.primaryColor === "string" ? input.primaryColor.trim() : "";
  const theme = input.theme === "DARK" ? "DARK" : input.theme === "LIGHT" ? "LIGHT" : null;
  const position = input.position === "LEFT" ? "LEFT" : input.position === "RIGHT" ? "RIGHT" : null;
  if (title.length < 1 || title.length > 80 || welcomeMessage.length > 300 || !HEX_COLOR.test(primaryColor) || !theme || !position) {
    throw new Error("LIVE_CHAT_SETTINGS_INVALID");
  }
  return {
    publicWidgetEnabled: bool("publicWidgetEnabled", false),
    title,
    welcomeMessage,
    primaryColor,
    theme,
    position,
    collectName: bool("collectName", false),
    collectEmail: bool("collectEmail", false),
    collectPhone: bool("collectPhone", false),
    allowedDomains: normalizeDomainList(input.allowedDomains)
  };
}

export function validateChatMessage(value: unknown): string {
  if (typeof value !== "string") throw new Error("LIVE_CHAT_MESSAGE_INVALID");
  const cleaned = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  if (!cleaned || cleaned.length > 2000) throw new Error("LIVE_CHAT_MESSAGE_INVALID");
  return cleaned;
}

export function validateContact(value: unknown, settings: Pick<LiveChatSettingsDraft, "collectName" | "collectEmail" | "collectPhone">) {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 120) : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase().slice(0, 254) : "";
  const phone = typeof input.phone === "string" ? input.phone.replace(/[^0-9+(). -]/g, "").trim().slice(0, 40) : "";
  if (settings.collectName && !name) throw new Error("LIVE_CHAT_NAME_REQUIRED");
  if (settings.collectEmail && (!email || !EMAIL.test(email))) throw new Error("LIVE_CHAT_EMAIL_REQUIRED");
  if (settings.collectPhone && phone.replace(/\D/g, "").length < 7) throw new Error("LIVE_CHAT_PHONE_REQUIRED");
  if (email && !EMAIL.test(email)) throw new Error("LIVE_CHAT_EMAIL_INVALID");
  return { name, email, phone };
}
