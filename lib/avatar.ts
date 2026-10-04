export function googleAvatarUrl(value?: string | null) {
  if (!value) return "";

  try {
    const url = new URL(value.trim());
    const hostname = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      (hostname !== "googleusercontent.com" && !hostname.endsWith(".googleusercontent.com"))
    ) {
      return "";
    }
    return url.toString();
  } catch {
    return "";
  }
}
