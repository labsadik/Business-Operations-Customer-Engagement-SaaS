# Public Feedback feature

## Boundaries

- `components/public-feedback-embed.tsx` owns the embeddable public form and published-review rendering.
- `server/validation.ts` owns anonymous visitor input validation.
- `app/embed/feedback/[companySlug]/page.tsx` is the Next.js page entry point.
- `app/api/public/[companySlug]/embedded-feedback/route.ts` is the unauthenticated, tenant-scoped API entry point. Next.js App Router requires route handlers to remain under `app/api`.
- `models/feedback.ts` stores reviews with immutable company ownership. Public-embed submissions do not require a Canvas user account.
- `components/workspace-feedback.tsx` provides the company-side embed snippet and moderation controls.

## Security

The endpoint resolves company scope from a published company slug, validates all submitted fields on the server, requires same-origin requests from the Canvas-hosted iframe, limits payload size, includes a honeypot, rate-limits recent submissions by a hashed request fingerprint, and applies a per-email cooldown. The raw request IP is not stored. New reviews remain private until a company owner or administrator publishes them. The public read API returns only approved review name, rating, text, and date; it never returns email or phone.

The iframe route has an explicit frame policy so the public embed can be placed on other websites. Other pages retain a same-origin frame policy.
