import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self';" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(self), geolocation=(), payment=()"
  }
];

const noStore = {
  key: "Cache-Control",
  value: "private, no-cache, no-store, max-age=0, must-revalidate"
};

const publicLongCache = {
  key: "Cache-Control",
  value: "public, s-maxage=31536000, stale-while-revalidate=86400"
};

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  typedRoutes: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.googleusercontent.com" }
    ]
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders
      },
      {
        source: "/",
        headers: [noStore]
      },
      {
        source: "/embed/feedback/:companySlug",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *;" }]
      },
      {
        source: "/embed/live-chat/:companySlug",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors *;" },
          noStore
        ]
      },
      {
        source: "/terms",
        headers: [publicLongCache]
      },
      {
        source: "/privacy",
        headers: [publicLongCache]
      },
      {
        source: "/api/:path*",
        headers: [noStore]
      },
      {
        source: "/dashboard",
        headers: [noStore]
      },
      {
        source: "/dashboard/:path*",
        headers: [noStore]
      },
      {
        source: "/admin",
        headers: [noStore]
      },
      {
        source: "/admin/:path*",
        headers: [noStore]
      },
      {
        source: "/billing",
        headers: [noStore]
      },
      {
        source: "/billing/:path*",
        headers: [noStore]
      },
      {
        source: "/invite",
        headers: [noStore]
      },
      {
        source: "/invite/:path*",
        headers: [noStore]
      },
      {
        source: "/login",
        headers: [noStore]
      },
      {
        source: "/:companySlug/login",
        headers: [noStore]
      },
      {
        source: "/:companySlug",
        headers: [noStore]
      }
    ];
  }
};

export default nextConfig;
