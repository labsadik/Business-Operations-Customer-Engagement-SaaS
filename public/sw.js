/* One-time cleanup for service workers installed by older Canvas versions. */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    try {
      const subscription = await self.registration.pushManager.getSubscription();
      if (subscription) await subscription.unsubscribe();
    } catch {
      // Browser support varies; unregister below regardless.
    }
    await self.registration.unregister();
  })());
});
