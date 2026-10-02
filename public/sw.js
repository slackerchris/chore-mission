// Minimal app-shell service worker. Data still comes from the server,
// so offline use is limited to the static shell (page, fonts, icons).
const CACHE = 'chore-mission-v1';
const PRECACHE = [
  '/',
  '/fonts.css',
  '/manifest.webmanifest',
  '/icon-180.png',
  '/icon-192.png',
  '/icon-512.png',
  '/fonts/baloo-2-latin.woff2',
  '/fonts/nunito-latin.woff2',
  '/fonts/jetbrains-mono-latin.woff2',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

  // Navigations: network first so updates propagate, with the cached shell as fallback.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put('/', copy));
          }
          return res;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  // Static assets: cache first, then network.
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res.ok && (url.pathname.startsWith('/fonts/') || url.pathname.startsWith('/icon-') || url.pathname === '/fonts.css')) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      });
    })
  );
});
