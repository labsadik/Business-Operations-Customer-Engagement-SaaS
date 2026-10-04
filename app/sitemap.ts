import type { MetadataRoute } from "next";
import { getPublicOrigin } from "@/lib/public-origin";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getPublicOrigin().toString().replace(/\/$/, "");
  const now = new Date();

  return [
    { url: base, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: base + "/login", lastModified: now, changeFrequency: "monthly", priority: 0.6 }
  ];
}