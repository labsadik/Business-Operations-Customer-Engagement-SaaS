# Canvas observability

Canvas uses a global App Router analytics provider for browser telemetry and a server-side Axiom observability layer.

## Environment

Copy the observability section from `.env.example` into `.env.local`.

Server-only Axiom variables:

- `AXIOM_HOST`: Axiom base host used by the OTLP trace exporter.
- `AXIOM_DATASET`: Axiom dataset name.
- `AXIOM_TOKEN`: Axiom ingest token. Keep this server-only.
- `AXIOM_SERVICE_NAME`: Service name shown in telemetry.

Browser analytics variables:

- `NEXT_PUBLIC_UMAMI_SCRIPT_URL`: full Umami tracker script URL from the Umami website's Tracking code settings.
- `NEXT_PUBLIC_UMAMI_WEBSITE_ID`: Umami website ID.
- `NEXT_PUBLIC_MIXPANEL_TOKEN`: Mixpanel project token.
- `NEXT_PUBLIC_CLARITY_PROJECT_ID`: Microsoft Clarity project ID.

The three browser identifiers are intentionally prefixed with `NEXT_PUBLIC_`. They are configuration identifiers used by browser SDKs, not server secrets. Never place the Axiom token in a `NEXT_PUBLIC_` variable.

## Axiom

Next.js 16's stable `instrumentation.ts` lifecycle is used to initialize OpenTelemetry on Node.js. Next.js already emits OpenTelemetry spans for its own request lifecycle, so the exporter provides automatic server/request tracing without editing every route file.

A root `proxy.ts` matches `/api/:path*` so every current and future API endpoint also emits a structured request log containing method, path, and trace context.

The `lib/axiom/server.ts` logger is available for manual transactional logging and exposes `withAxiom` for route handlers that need the current Axiom request-context helper.

Example:

```ts
import { logger } from "@/lib/axiom/server";

logger.info("Payment completed", {
  paymentId: payment._id.toString(),
  companyId: payment.companyId.toString(),
  planId: payment.planId
});
```

Do not log passwords, OAuth codes, payment secrets, full authorization headers, or raw request bodies.

## Umami

The root `AnalyticsProvider` injects the Umami script once. Umami automatically observes SPA navigation, so new pages and multi-tenant paths do not need page-view code.

## Mixpanel

`lib/mixpanel.ts` is the reusable client utility. Import `trackEvent` in a Client Component:

```ts
import { trackEvent } from "@/lib/mixpanel";

trackEvent("Calendar Authorization Started", {
  source: "booking-settings"
});
```

Mixpanel page-view tracking is also enabled at SDK initialization.

## Microsoft Clarity

The root provider initializes Clarity once from the public project ID. Clarity remains active through client-side navigation and records supported interaction, page, diagnostic, and playback telemetry.

## Verification

Run:

```bash
npm install
npm run typecheck
npm run lint
npm test
npm run build
```

In development, missing analytics variables disable only the related integration; the application continues to run.
