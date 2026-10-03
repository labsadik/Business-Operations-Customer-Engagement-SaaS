export const PLATFORM_BRAND = {
  name: "Conventus",
  description: "Company scheduling infrastructure for customer meetings.",
  logoPath: "/conventus-mark.svg"
} as const;

function envValue(name: string) {
  return process.env[name]?.trim() || "";
}

function emailValue(value: string) {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim();
}

export type PlatformAddress = {
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export type PlatformLegalProfile = {
  legalName: string;
  websiteUrl: string;
  email: string;
  phone: string;
  taxId: string;
  gstin: string;
  sacCode: string;
  address: PlatformAddress;
};

export function platformLogoUrl() {
  const configured = envValue("CONVENTUS_LOGO_URL");
  if (configured) return configured;

  const baseUrl = envValue("NEXT_PUBLIC_APP_URL") || "http://localhost:3000";
  return new URL(PLATFORM_BRAND.logoPath, baseUrl).toString();
}

export function platformLegalProfile(): PlatformLegalProfile {
  const websiteUrl = envValue("CONVENTUS_WEBSITE_URL") || envValue("NEXT_PUBLIC_APP_URL") || "http://localhost:3000";
  const taxId = envValue("CONVENTUS_TAX_ID");
  return {
    legalName: envValue("CONVENTUS_LEGAL_NAME") || PLATFORM_BRAND.name,
    websiteUrl,
    email: emailValue(envValue("CONVENTUS_BILLING_EMAIL") || envValue("EMAIL_FROM")),
    phone: envValue("CONVENTUS_PHONE"),
    taxId,
    gstin: envValue("CONVENTUS_GSTIN") || taxId,
    sacCode: envValue("CONVENTUS_SAC_CODE"),
    address: {
      line1: envValue("CONVENTUS_ADDRESS_LINE1"),
      line2: envValue("CONVENTUS_ADDRESS_LINE2"),
      city: envValue("CONVENTUS_ADDRESS_CITY"),
      state: envValue("CONVENTUS_ADDRESS_STATE"),
      postalCode: envValue("CONVENTUS_ADDRESS_POSTAL_CODE"),
      country: envValue("CONVENTUS_ADDRESS_COUNTRY") || "India"
    }
  };
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
