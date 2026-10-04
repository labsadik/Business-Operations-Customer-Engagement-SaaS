"use client";

import Script from "next/script";
import { useEffect } from "react";
import { initializeClarity } from "@/lib/clarity";
import { initializeMixpanel } from "@/lib/mixpanel";

const umamiScriptUrl = process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL?.trim() ?? "";
const umamiWebsiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID?.trim() ?? "";

export default function AnalyticsProvider({
  children
}: Readonly<{ children: React.ReactNode }>) {
  useEffect(() => {
    initializeClarity();
    initializeMixpanel();
  }, []);

  return (
    <>
      {children}
      {umamiScriptUrl && umamiWebsiteId ? (
        <Script
          id="conventus-umami"
          src={umamiScriptUrl}
          data-website-id={umamiWebsiteId}
          data-auto-track="true"
          data-do-not-track="true"
          strategy="afterInteractive"
        />
      ) : null}
    </>
  );
}
