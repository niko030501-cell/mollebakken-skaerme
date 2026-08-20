// Minimal "app shell"-service worker. Gør appen installerbar som en rigtig
// app på telefonen (Chrome/Android "Føj til startskærm", iOS Safari "Føj til
// hjemmeskærm") og lader selve app-skallen (HTML/CSS/JS/ikon) hurtigt loade
// fra cache. Data (Supabase-kald) caches ALDRIG — de skal altid være friske,
// så beskeder/dagsplaner osv. aldrig viser forældet information.

const CACHE_NAVN = 'mollebakken-app-v4';
const APP_SKAL = [
  './',
  './index.html',
  './supabase-js.min.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAVN).then((cache) => cache.addAll(APP_SKAL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((navne) =>
      Promise.all(navne.filter((n) => n !== CACHE_NAVN).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Data-kald til Supabase går ALTID direkte til nettet — aldrig cachet.
  if (url.hostname.endsWith('.supabase.co')) return;

  // App-skal: cache-først, med netværk som fallback (og opdaterer cachen).
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const netFetch = fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const kopi = res.clone();
            caches.open(CACHE_NAVN).then((cache) => cache.put(event.request, kopi));
          }
          return res;
        })
        .catch(() => cached);
      return cached || netFetch;
    })
  );
});
