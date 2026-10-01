// The Live Journey shell (/app) and its offline pack were retired. Browsers
// that installed this service worker for it pick up this version, which
// clears the pack caches and unregisters itself so nothing is served stale.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) await caches.delete(key);
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url);
  })());
});
