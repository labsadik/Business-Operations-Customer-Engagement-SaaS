# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Public NEXT_PUBLIC_* values are compiled into the browser bundle at build time.
# Defaults match the production domain; cloudbuild-image.yaml passes .env values as substitutions.
ARG NEXT_PUBLIC_APP_URL=https://canvas.algoquit.com
ARG NEXT_PUBLIC_APP_NAME=Canvas
ARG NEXT_PUBLIC_COMPANY_NAME=AlgoQuit
ARG NEXT_PUBLIC_COMPANY_URL=https://algoquit.com
ARG NEXT_PUBLIC_SENTRY_DSN=
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
ARG NEXT_PUBLIC_SENTRY_RELEASE=
ARG NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=
ARG NEXT_PUBLIC_UMAMI_SCRIPT_URL=
ARG NEXT_PUBLIC_UMAMI_WEBSITE_ID=
ARG NEXT_PUBLIC_MIXPANEL_TOKEN=
ARG NEXT_PUBLIC_CLARITY_PROJECT_ID=

ENV NEXT_OUTPUT_STANDALONE=1
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME
ENV NEXT_PUBLIC_COMPANY_NAME=$NEXT_PUBLIC_COMPANY_NAME
ENV NEXT_PUBLIC_COMPANY_URL=$NEXT_PUBLIC_COMPANY_URL
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_SENTRY_ENVIRONMENT=$NEXT_PUBLIC_SENTRY_ENVIRONMENT
ENV NEXT_PUBLIC_SENTRY_RELEASE=$NEXT_PUBLIC_SENTRY_RELEASE
ENV NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=$NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE
ENV NEXT_PUBLIC_UMAMI_SCRIPT_URL=$NEXT_PUBLIC_UMAMI_SCRIPT_URL
ENV NEXT_PUBLIC_UMAMI_WEBSITE_ID=$NEXT_PUBLIC_UMAMI_WEBSITE_ID
ENV NEXT_PUBLIC_MIXPANEL_TOKEN=$NEXT_PUBLIC_MIXPANEL_TOKEN
ENV NEXT_PUBLIC_CLARITY_PROJECT_ID=$NEXT_PUBLIC_CLARITY_PROJECT_ID

RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=8080

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 --ingroup nodejs nextjs

# Standalone output contains the minimal server and traced production dependencies.
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 8080
CMD ["node", "server.js"]
