// App-skal til beboerappen. Netværk først, cache kun som offline-fallback.
// Supabase-kald caches ALDRIG (data skal være friske). Appen gemmer selv
// seneste dagsplan/programmer lokalt til en simpel offline-visning.
// Undtagelse: øvelsesbilleder uploadet af personalet (bucket ovelse-billeder).
// Filnavnene er unikke (uuid) og ændres aldrig, så de caches "cache først".

const CACHE_NAVN = 'beboer-v2-3';
const BILLEDE_CACHE = 'beboer-v2-billeder';
const BILLEDE_STI = '/storage/v1/object/public/ovelse-billeder/';
const APP_SKAL = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './supabase-js.min.js',
  '../shared/tokens.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAVN).then((cache) => cache.addAll(APP_SKAL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((navne) =>
      Promise.all(navne.filter((n) => n !== CACHE_NAVN && n !== BILLEDE_CACHE).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Uploadede øvelsesbilleder: cache først (kun rigtige CORS-svar, ikke opaque)
  if (url.hostname.endsWith('.supabase.co') && url.pathname.indexOf(BILLEDE_STI) === 0) {
    event.respondWith(
      caches.open(BILLEDE_CACHE).then((cache) =>
        cache.match(event.request).then((hit) => {
          if (hit) return hit;
          return fetch(event.request).then((res) => {
            if (res.ok && res.type === 'cors') cache.put(event.request, res.clone());
            return res;
          });
        })
      )
    );
    return;
  }

  if (url.hostname.endsWith('.supabase.co')) return;
  // Kun egne filer caches (ikke personalebilleder fra andre domæner)
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok) {
          const kopi = res.clone();
          caches.open(CACHE_NAVN).then((cache) => cache.put(event.request, kopi));
        }
        return res;
      })
      .catch(() => caches.match(event.request).then((r) => r || caches.match('./index.html')))
  );
});
