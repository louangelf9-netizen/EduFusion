// ============================
// EDUFUSION Service Worker
// ============================

const CACHE_VERSION = 'edufusion-v9';

const CORE_ASSETS = [
  './',
  './index.html',
  './script.js',
  './style.css',
  './enhancements.css',
  './background-themes.css',
  './manifest.json',
  './music/bg-music.mp3',
  './logo/edu.mp4',
  './logo/edu-logo.png',
  './logo/edu-logo.png?v=3',
  './logo/guessimg.png',
  './logo/historylogo.png',
  './logo/logo.png',
  './logo/missing.png',
  './logo/spell it.png'
];

const GUESS_IMAGES = [
  'adobo','anahaw','andres-bonifacio','antonio-luna','apolinario-mabini',
  'arnis','ati-atihan','balut','banaue-rice-terraces','bangus',
  'barong-tagalog','barot-saya','bayanihan','boracay','carabao',
  'chocolate-hills','corazon-aquino','emilio-aguinaldo','emilio-jacinto',
  'ferdinand-marcos','halo-halo','intramuros','jeepney','jose-rizal',
  'juan-luna','kadayawan-festival','lapu-lapu','lechon','manny-pacquiao',
  'manuel-quezon','mayon-volcano','narra','pahiyas-festival','panagbenga-festival',
  'philippine-eagle','philippine-flag','puerto-princesa','ramon-magsaysay',
  'rizal-park','sampaguita','santacruzan','siargao','sinigang',
  'sinulog-festival','sipa','taal-volcano','tarsier','tubbataha-reef'
].map(n => `./images/guess/${n}.jpg`);

const MISSING_IMAGES = [
  'aklat','araw','bahay','bayanihan','buwan','dagat','eskwela','guro',
  'kaalaman','kagalakan','kaibigan','kalayaan','kapangyarihan','kapayapaan',
  'kasalanan','kasaysayan','katangian','katapangan','katapatan','katiyakan',
  'kaunawaan','mag-aaral','magulang','mesa','nakakatuwa','pag-ibig',
  'pagbabago','pagdarasal','paghihirap','pagkakaibigan','pagkakaisa',
  'pagkilos','pagkukusa','pagmamahal','pagmamalasakit','pagpapatuloy',
  'pagtanggap','pagtatanggol','pakikipagkapwa','pamahalaan','pananagutan',
  'pangangalaga','pangarap','pinagpala','pinakamahalaga','punong-guro',
  'pusa','tagumpay'
].map(n => `./images/missing/${n}.jpg`);

const ALL_ASSETS = [...CORE_ASSETS, ...GUESS_IMAGES, ...MISSING_IMAGES];

// ── Install: cache everything ──────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(async cache => {
      // Cache core assets first (must succeed)
      await cache.addAll(CORE_ASSETS);
      // Cache images in small batches so one failure doesn't block the rest
      const BATCH = 10;
      const imageAssets = [...GUESS_IMAGES, ...MISSING_IMAGES];
      for (let i = 0; i < imageAssets.length; i += BATCH) {
        await cache.addAll(imageAssets.slice(i, i + BATCH)).catch(() => {});
      }
      // Cache Google Fonts (best-effort)
      await cache.add(
        'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&display=swap'
      ).catch(() => {});
    })
  );
  self.skipWaiting();
});

// ── Activate: purge old caches ─────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: cache-first for same-origin, stale-while-revalidate for fonts ──
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Google Fonts — stale-while-revalidate
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(CACHE_VERSION).then(async cache => {
        const cached = await cache.match(event.request);
        const fetchPromise = fetch(event.request)
          .then(res => { if (res.ok) cache.put(event.request, res.clone()); return res; })
          .catch(() => null);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Same-origin assets — cache-first, fall back to network then offline page
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => {
          // For navigation requests, serve the app shell
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return new Response('', { status: 408, statusText: 'Offline' });
        });
      })
    );
  }
});

// ── Background sync: notify clients of SW updates ─────────────────────────
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
