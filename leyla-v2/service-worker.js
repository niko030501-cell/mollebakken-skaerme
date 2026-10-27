// App-skal til Leylas iPad. Netværk først, cache kun som offline-fallback.
// Supabase-data caches ALDRIG her (appen gemmer selv det sidst hentede).
// Undtagelser, der caches "cache først":
//   - piktogram-billeder (filnavnene er uuid'er og ændres aldrig)
//   - skrifttypen (Google Fonts)
// Personalets fotos ("Med dig nu") caches IKKE — de må ikke blive liggende efter dagen.

const CACHE_NAVN = 'leyla-v2-1';
const BILLEDE_CACHE = 'leyla-v2-billeder';
const SKRIFT_CACHE = 'leyla-v2-skrift';
const BILLEDE_STI = '/storage/v1/object/public/piktogram-billeder/';
const APP_SKAL = ['./', './index.html', './app.css', './app.js', './manifest.json',
                  './icon-192.png', './icon-512.png', './supabase-js.min.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAVN).then((cache) => cache.addAll(APP_SKAL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((navne) =>
      Promise.all(navne.filter((n) => n !== CACHE_NAVN && n !== BILLEDE_CACHE && n !== SKRIFT_CACHE)
                       .map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

function cacheFoerst(event, navn){
  event.respondWith(
    caches.open(navn).then((cache) =>
      cache.match(event.request).then((fundet) =>
        fundet || fetch(event.request).then((res) => {
          if(res.ok || res.type === 'opaque') cache.put(event.request, res.clone());
          return res;
        })
      )
    )
  );
}

self.addEventListener('fetch', (event) => {
  if(event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  if(url.hostname.endsWith('.supabase.co')){
    if(url.pathname.indexOf(BILLEDE_STI) === 0) cacheFoerst(event, BILLEDE_CACHE);
    return;   // alt andet fra Supabase går direkte til nettet
  }
  if(url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'){
    cacheFoerst(event, SKRIFT_CACHE);
    return;
  }
  if(url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if(res.ok){
          const kopi = res.clone();
          caches.open(CACHE_NAVN).then((cache) => cache.put(event.request, kopi));
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
