import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Conventus — Connect. Schedule. Meet.",
    template: "%s — Conventus"
  },
  description:
    "Conventus helps companies let customers request meetings and automatically route them to available employees.",
  applicationName: "Conventus",
  keywords: ["meeting scheduling", "Google Meet", "Google Calendar", "customer booking", "team scheduling"],
  robots: { index: true, follow: true }
};

export const viewport: Viewport = {
  themeColor: "#f7f8fb",
  colorScheme: "light"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}