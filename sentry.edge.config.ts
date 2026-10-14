import * as Sentry from "@sentry/nextjs";
import { readSentrySampleRate } from "@/lib/sentry/config";

const dsn = process.env.SENTRY_DSN?.trim();
const defaultTracesSampleRate = process.env.NODE_ENV === "production" ? 0.1 : 1;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment:
    process.env.SENTRY_ENVIRONMENT?.trim() ||
process.env.NODE_ENV ||
    "development",
  release:
    process.env.SENTRY_RELEASE?.trim() || undefined,
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: { request: false, response: false },
    httpBodies: [],
    urlQueryParams: false,
    genAI: { inputs: false, outputs: false },
    databaseQueryData: false,
    queues: false,
    graphQL: { document: false, variables: false }
  },
  tracesSampleRate: readSentrySampleRate(
    process.env.SENTRY_TRACES_SAMPLE_RATE,
    defaultTracesSampleRate
  )
});
