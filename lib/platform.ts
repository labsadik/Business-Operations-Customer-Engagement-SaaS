import { getMongo } from "@/lib/mongodb";
import { PlatformSettings } from "@/models/platform-settings";
import { getSafeWebsiteUrl } from "@/lib/public-origin";

export const PLATFORM_COMPANY_NAME = process.env.NEXT_PUBLIC_COMPANY_NAME?.trim() || "AlgoQuit";
export const PLATFORM_COMPANY_URL = getSafeWebsiteUrl(process.env.NEXT_PUBLIC_COMPANY_URL?.trim()) || "https://algoquit.com";

export const PLATFORM_BRAND = {
  name: process.env.NEXT_PUBLIC_APP_NAME?.trim() || "Canvas",
  description: "Canvas by AlgoQuit brings scheduling, team tasks, private files, and client communication into one workspace.",
  logoPath: "/favicon.svg"
} as const;

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
  description: string;
  websiteUrl: string;
  email: string;
  phone: string;
  logoUrl: string;
  taxId: string;
  gstin: string;
  sacCode: string;
  address: PlatformAddress;
  gst: {
    enabled: boolean;
    ratePercent: number;
    inclusive: boolean;
  };
};

function emailValue(value: string) {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim();
}

function defaultWebsiteUrl() {
  return PLATFORM_COMPANY_URL;
}

export async function getPlatformSettings() {
  await getMongo();
  const existing = await PlatformSettings.findOne({ key: "default" }).lean();
  if (existing) return existing;

  const created = await PlatformSettings.findOneAndUpdate(
    { key: "default" },
    {
      $setOnInsert: {
        key: "default",
        legalName: PLATFORM_COMPANY_NAME,
        description: PLATFORM_BRAND.description,
        websiteUrl: defaultWebsiteUrl(),
        logoUrl: PLATFORM_BRAND.logoPath
      }
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  ).lean();

  if (!created) throw new Error("PLATFORM_SETTINGS_UNAVAILABLE");
  return created;
}

export async function platformLegalProfile(): Promise<PlatformLegalProfile> {
  const settings = await getPlatformSettings();
  const configuredWebsite = getSafeWebsiteUrl(settings.websiteUrl);
  const fallbackWebsite = configuredWebsite || defaultWebsiteUrl();

  return {
    legalName: settings.legalName?.trim() || PLATFORM_COMPANY_NAME,
    description: settings.description?.trim() || PLATFORM_BRAND.description,
    websiteUrl: fallbackWebsite,
    email: emailValue(settings.billingEmail?.trim() || ""),
    phone: settings.phone?.trim() || "",
    logoUrl: PLATFORM_BRAND.logoPath,
    taxId: settings.taxId?.trim() || "",
    gstin: settings.gstin?.trim() || settings.taxId?.trim() || "",
    sacCode: settings.sacCode?.trim() || "",
    address: {
      line1: settings.address?.line1?.trim() || "",
      line2: settings.address?.line2?.trim() || "",
      city: settings.address?.city?.trim() || "",
      state: settings.address?.state?.trim() || "",
      postalCode: settings.address?.postalCode?.trim() || "",
      country: settings.address?.country?.trim() || "India"
    },
    gst: {
      enabled: settings.gst?.enabled !== false,
      ratePercent: Number.isFinite(Number(settings.gst?.ratePercent))
        ? Number(settings.gst?.ratePercent)
        : 18,
      inclusive: settings.gst?.inclusive === true
    }
  };
}

export async function platformLogoUrl() {
  const legal = await platformLegalProfile();
  return legal.logoUrl;
}