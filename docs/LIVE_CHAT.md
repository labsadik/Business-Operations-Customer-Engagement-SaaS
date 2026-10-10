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

## Visitor details, agent identity, and offline mode

- The agent inbox groups chats into Open, Unassigned, and Closed views. Search covers visitor contact fields, location and the latest message preview. The visitor details panel shows the stored country/city/region, IP display value, parsed browser/OS/device, sanitized initial page URL, message count, start time and elapsed duration.
- Geography is derived from trusted hosting request headers when available (Cloudflare `cf-ipcountry`, `cf-ipcity`, `cf-region`; Vercel geo headers are also accepted). On hosts that do not provide geolocation headers, those fields remain unavailable. Browser/device labels are parsed from User-Agent and are approximate, not verified device identity.
- The displayed IP address is sensitive personal data. Disclose collection in your website privacy notice, limit inbox access to authorized company members, and choose retention/backup policies that meet your legal obligations. The same configured chat-retention window applies to the conversation record.
- Company admins can enable **Offline mode** in Settings. The widget displays an offline status but still permits a visitor to leave a message for the inbox; it does not imply that a human agent is currently connected.
- Agent messages retain the authenticated user ID. The public widget looks up that user's display name and profile image for replies; an avatar may be absent if the user has no profile image.

## Runtime and operational notes

- The embed is an async lightweight loader which creates a same-origin iframe, keeping CSS and JavaScript isolated from the customer's site.
- The widget and inbox use visibility-aware short polling (about 2.5–3 seconds while visible), rather than a persistent WebSocket connection. This is compatible with standard Next.js/serverless hosting and avoids keeping one server process alive per visitor. It is near-real-time, not a guaranteed sub-second push channel.
- Public widget settings are fetched directly from MongoDB with `Cache-Control: no-store`: every 3 seconds while the chat is open and every 10 seconds while minimized. Hidden tabs pause network checks, so color, title, theme, position and offline-mode changes appear on the next visible refresh without a cache purge.
- Customer-to-server message cooldown is atomically enforced against MongoDB. UI countdowns are only presentation; bypassing the widget does not bypass the server rule.
- Monthly chat and unique-customer counters are stored separately from transcripts, so automatic history deletion does not reset plan usage limits. Only count aggregates are retained for three additional months; the month-salted visitor deduplication key expires at the end of that calendar month.
- Conversation, message and contact records carry an expiry date. A daily scheduler removes expired conversation/message documents in bounded batches; MongoDB TTL indexes are a secondary cleanup safeguard and run asynchronously.
- Configure `CRON_SECRET` in production. Vercel runs `/api/jobs/live-chat-retention` daily; on other hosts, configure an external scheduler to send `GET /api/jobs/live-chat-retention` with `Authorization: Bearer <CRON_SECRET>`.
- Database retention does not itself erase third-party backups. Configure the database provider's backup/PITR retention to meet your privacy requirements.
- Use HTTPS in production and provide an appropriate privacy notice before collecting customer contact details.
