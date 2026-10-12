import * as Sentry from "@sentry/nextjs";
import { readSentrySampleRate } from "@/lib/sentry/config";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();
const defaultTracesSampleRate = process.env.NODE_ENV === "production" ? 0.1 : 1;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment:
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT?.trim() || process.env.NODE_ENV || "development",
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE?.trim() || undefined,
  sendDefaultPii: false,
  tracesSampleRate: readSentrySampleRate(
    process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
    defaultTracesSampleRate
  )
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
