import type { MetadataRoute } from "next";
import { getConfiguredPublicOrigin } from "@/lib/public-origin";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getConfiguredPublicOrigin()?.toString().replace(/\/$/, "");
  if (!base) return [];

  const now = new Date();

  return [
    { url: base, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: base + "/login", lastModified: now, changeFrequency: "monthly", priority: 0.6 }
  ];
}
