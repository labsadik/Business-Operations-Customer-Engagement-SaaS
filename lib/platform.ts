export const PLATFORM_BRAND = {
  name: "Conventus",
  description: "Company scheduling infrastructure for customer meetings.",
  logoPath: "/conventus-mark.svg"
} as const;

export function platformLogoUrl() {
  const configured = process.env.CONVENTUS_LOGO_URL?.trim();
  if (configured) return configured;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
  return new URL(PLATFORM_BRAND.logoPath, baseUrl).toString();
}

export function isPlatformAdminEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  const configured = process.env.PLATFORM_ADMIN_EMAILS ?? "";
  return configured
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .includes(normalized);
}
