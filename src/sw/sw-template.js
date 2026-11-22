/* DAYMARK service worker — generated at build time (see vite.config.ts). */
const BUILD_ID = __BUILD_ID__;
const CACHE = `daymark-${BUILD_ID}`;
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // cache: 'reload' bypasses the HTTP cache so a deploy is fetched fresh.
      await cache.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' })));
      // First install: activate immediately. Updates wait for the user to tap "Update".
      if (!self.registration.active) await self.skipWaiting();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  if (event.data === 'GET_VERSION') event.source?.postMessage({ type: 'VERSION', build: BUILD_ID });
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('daymark-') && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never intercept third-party requests (e.g. the optional AI API)

  if (req.mode === 'navigate') {
    // App shell: serve the cached index so the app opens instantly and offline.
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const cached = (await cache.match('./')) || (await cache.match('./index.html'));
        if (cached) return cached;
        try {
          return await fetch(req);
        } catch {
          return new Response('<h1>DAYMARK is offline</h1><p>Open the app once while online to finish installing it.</p>', { headers: { 'Content-Type': 'text/html' } });
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req, { ignoreSearch: true });
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res.ok && res.type === 'basic') cache.put(req, res.clone());
        return res;
      } catch (e) {
        return new Response('', { status: 504, statusText: 'Offline' });
      }
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const route = (event.notification.data && event.notification.data.route) || '#/today';
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const scope = self.registration.scope;
      for (const c of all) {
        if (c.url.startsWith(scope)) {
          await c.focus();
          c.postMessage({ type: 'NAVIGATE', route });
          return;
        }
      }
      await self.clients.openWindow(scope + route);
    })(),
  );
});
