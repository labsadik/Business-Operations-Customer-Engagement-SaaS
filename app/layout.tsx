import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import NavigationProgress from "@/components/navigation-progress";
import NavigationLabelsProvider from "@/components/navigation-labels-provider";
import CookieConsent from "@/components/cookie-consent";
import SoundAutoplay from "@/components/sound-autoplay";
import AnalyticsProvider from "@/components/analytics-provider";
import { getConfiguredPublicOrigin } from "@/lib/public-origin";
import "./globals.css";

const publicOrigin = getConfiguredPublicOrigin() ?? undefined;

export const metadata: Metadata = {
  title: {
    default: "Canvas by AlgoQuit — Connect. Schedule. Meet.",
    template: "%s — Canvas by AlgoQuit"
  },
  description:
    "Canvas by AlgoQuit helps teams coordinate customer meetings, employees, tasks, private files, billing, and client communication.",
  applicationName: "Canvas",
  keywords: ["meeting scheduling", "Google Meet", "Google Calendar", "customer booking", "team scheduling"],
  ...(publicOrigin ? { metadataBase: publicOrigin } : {}),
  robots: { index: true, follow: true },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" }
};

export const viewport: Viewport = {
  themeColor: "#faf9f1",
  colorScheme: "light"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        <AnalyticsProvider>
          <NavigationLabelsProvider>
            {children}
          </NavigationLabelsProvider>
        </AnalyticsProvider>
        <SoundAutoplay />
        <CookieConsent />
      </body>
    </html>
  );
}
