// Eetdagboek Service Worker v8 — network-first, force update
const CACHE_NAME = 'kcalculator-v8';
const FONT_ORIGINS = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'];

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const isFontRequest = FONT_ORIGINS.some(o => e.request.url.startsWith(o));
  if (isFontRequest) {
    // Cache-first for fonts: fonts don't change, so serve from cache when possible
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(r => {
          const clone = r.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          return r;
        }).catch(() => new Response('', { status: 408 }));
      })
    );
    return;
  }

  if (!e.request.url.startsWith(self.location.origin)) return;

  const url = new URL(e.request.url);
  const isNevo = url.pathname.includes('nevo.json');

  if (isNevo) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(r => {
          const clone = r.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          return r;
        });
      })
    );
  } else {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .then(r => {
          const clone = r.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          return r;
        })
        .catch(() => caches.match(e.request))
    );
  }
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
