import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import NavigationProgress from "@/components/navigation-progress";
import { getPublicOrigin } from "@/lib/public-origin";
import "./globals.css";

const configuredPublicOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim();
const publicOrigin = configuredPublicOrigin ? getPublicOrigin() : undefined;

export const metadata: Metadata = {
  title: {
    default: "Conventus — Connect. Schedule. Meet.",
    template: "%s — Conventus"
  },
  description:
    "Conventus helps companies let customers request meetings and automatically route them to available employees.",
  applicationName: "Conventus",
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
        {children}
      </body>
    </html>
  );
}
