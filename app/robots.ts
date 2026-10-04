import type { MetadataRoute } from "next";
import { getPublicOrigin } from "@/lib/public-origin";

export default function robots(): MetadataRoute.Robots {
  const base = getPublicOrigin().toString().replace(/\/$/, "");
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: base + "/sitemap.xml"
  };
}