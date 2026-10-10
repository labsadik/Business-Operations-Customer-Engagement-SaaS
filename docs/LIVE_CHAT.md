# Live Chat

Live Chat is a plan-gated, company-isolated customer messaging module.

## Enable it

1. Open **Admin → Plans**, edit a plan, and enable **Live Chat widget & customer conversations**.
2. Configure monthly chat/customer limits, permitted employee agents, message cooldown, history retention, PDF export, and member deletion rights.
3. A company on an enabled plan opens **Workspace → Live Chat → Settings**, enables the public widget, and adds the site's host (or configures it as the company's website in Company Profile).
4. Copy the generated script into the site's HTML before the closing `</body>` tag.

Example (use the exact generated snippet; the example company slug is illustrative):

```html
<script src="https://YOUR-CONVENTUS-HOST/live-chat.js" data-company="your-company-slug" data-position="right" async></script>
```

## Runtime and operational notes

- The embed is an async lightweight loader which creates a same-origin iframe, keeping CSS and JavaScript isolated from the customer's site.
- The widget and inbox use visibility-aware short polling (about 2.5–3 seconds while visible), rather than a persistent WebSocket connection. This is compatible with standard Next.js/serverless hosting and avoids keeping one server process alive per visitor. It is near-real-time, not a guaranteed sub-second push channel.
- Customer-to-server message cooldown is atomically enforced against MongoDB. UI countdowns are only presentation; bypassing the widget does not bypass the server rule.
- Monthly chat and unique-customer counters are stored separately from transcripts, so automatic history deletion does not reset plan usage limits. Only count aggregates are retained for three additional months; the month-salted visitor deduplication key expires at the end of that calendar month.
- Conversation, message and contact records carry an expiry date. A daily scheduler removes expired conversation/message documents in bounded batches; MongoDB TTL indexes are a secondary cleanup safeguard and run asynchronously.
- Configure `CRON_SECRET` in production. Vercel runs `/api/jobs/live-chat-retention` daily; on other hosts, configure an external scheduler to send `GET /api/jobs/live-chat-retention` with `Authorization: Bearer <CRON_SECRET>`.
- Database retention does not itself erase third-party backups. Configure the database provider's backup/PITR retention to meet your privacy requirements.
- Use HTTPS in production and provide an appropriate privacy notice before collecting customer contact details.
