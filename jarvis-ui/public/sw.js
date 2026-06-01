// Genesis Swarm — minimal service worker.
// Currently: cache shell + offline fallback for static pages.
// Future: web push for vindication alerts.

const CACHE = 'genesis-v1';
const SHELL = [
  '/',
  '/manifest.json',
  '/icon-192.svg',
  '/icon-512.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => undefined))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Never cache API or auth routes
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/embed/')) return;

  // Stale-while-revalidate for shell-y static assets
  if (SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.open(CACHE).then(async (c) => {
        const cached = await c.match(req);
        const fetchPromise = fetch(req).then((res) => {
          if (res.ok) c.put(req, res.clone());
          return res;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
  }
});

// Web Push hook — will accept payload from /api/cron/vindicate when vindication hits
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = { title: 'Genesis Swarm', body: 'A new event has been recorded.', url: '/' };
  try { payload = { ...payload, ...event.data.json() }; } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icon-192.svg',
      badge: '/icon-192.svg',
      data: { url: payload.url || '/' },
      vibrate: [80, 40, 80],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.endsWith(target)) return w.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});
