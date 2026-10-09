/* Conventus desktop notification service worker. */
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Conventus notification", body: "You have a new workspace update." };
  }

  const title = typeof payload.title === "string" && payload.title
    ? payload.title.slice(0, 160)
    : "Conventus notification";
  const body = typeof payload.body === "string" ? payload.body.slice(0, 400) : "";
  const tag = typeof payload.tag === "string" ? payload.tag.slice(0, 180) : "conventus-notification";
  const url = typeof payload.url === "string" && payload.url.startsWith("/") && !payload.url.startsWith("//")
    ? payload.url
    : "/dashboard";

  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: "/favicon.svg",
    badge: "/favicon.svg",
    tag,
    data: { url }
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification && event.notification.data && typeof event.notification.data.url === "string"
    ? event.notification.data.url
    : "/dashboard";
  const url = new URL(target, self.location.origin);
  if (url.origin !== self.location.origin) return;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client) {
        await client.focus();
        if ("navigate" in client) await client.navigate(url.href);
        return;
      }
    }
    await self.clients.openWindow(url.href);
  })());
});
