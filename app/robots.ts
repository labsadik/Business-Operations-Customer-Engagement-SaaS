import type { MetadataRoute } from "next";
import { getConfiguredPublicOrigin } from "@/lib/public-origin";

export default function robots(): MetadataRoute.Robots {
  const base = getConfiguredPublicOrigin()?.toString().replace(/\/$/, "");

  return {
    rules: { userAgent: "*", allow: "/" },
    ...(base ? { sitemap: base + "/sitemap.xml" } : {})
  };
}
