const DEVELOPMENT_ORIGIN = "http://localhost:3000";

function isDevelopmentOnlyHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".local") ||
    host.endsWith(".localhost")
  );
}

function parseOrigin(value: string) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (url.username || url.password) return null;
    if (isDevelopmentOnlyHostname(url.hostname)) return null;
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

export function getPublicOrigin() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (process.env.NODE_ENV !== "production") {
    return configured ? new URL(configured) : new URL(DEVELOPMENT_ORIGIN);
  }

  const parsed = configured ? parseOrigin(configured) : null;
  if (!parsed) throw new Error("PUBLIC_ORIGIN_NOT_CONFIGURED");
  return parsed;
}

export function isDevelopmentOnlyUrl(value: string) {
  try {
    const url = new URL(value, "https://conventus.invalid");
    return isDevelopmentOnlyHostname(url.hostname);
  } catch {
    return true;
  }
}

export function getSafeWebsiteUrl(value?: string | null) {
  const raw = value?.trim();
  if (!raw) return "";

  const parsed = parseOrigin(raw);
  return parsed ? parsed.toString().replace(/\/$/, "") : "";
}

export function getPublicOriginString() {
  return getPublicOrigin().toString().replace(/\/$/, "");
}