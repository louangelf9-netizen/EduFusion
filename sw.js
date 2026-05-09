// ============================
// EDUFUSION Service Worker v10
// Full offline support
// ============================

const CACHE_VERSION = 'edufusion-v10';

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
  './logo/logo.png',
  './logo/guessimg.png',
  './logo/historylogo.png',
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

// ── Install: cache everything individually so one failure doesn't abort all ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(async cache => {
      // Cache each core asset individually — never let one failure kill the install
      for (const asset of CORE_ASSETS) {
        await cache.add(asset).catch(err => {
          console.warn('[SW] Failed to cache core asset:', asset, err);
        });
      }

      // Cache game images in batches of 10
      const allImages = [...GUESS_IMAGES, ...MISSING_IMAGES];
      const BATCH = 10;
      for (let i = 0; i < allImages.length; i += BATCH) {
        await Promise.allSettled(
          allImages.slice(i, i + BATCH).map(url =>
            cache.add(url).catch(err => console.warn('[SW] Failed to cache image:', url, err))
          )
        );
      }

      // Cache Google Fonts (best-effort — not required for offline)
      await cache.add(
        'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&display=swap'
      ).catch(() => {});
    })
  );
  // Take over immediately without waiting for old SW clients to close
  self.skipWaiting();
});

// ── Activate: purge ALL old caches ────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_VERSION).map(k => {
          console.log('[SW] Deleting old cache:', k);
          return caches.delete(k);
        })
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: serve everything from cache, fall back to network ──────────────
self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // ── Google Fonts: cache-first, update in background ──
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(CACHE_VERSION).then(async cache => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        try {
          const response = await fetch(event.request);
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        } catch {
          // Offline and not cached — return empty so the page still loads
          return new Response('', { status: 200, headers: { 'Content-Type': 'text/css' } });
        }
      })
    );
    return;
  }

  // ── Same-origin assets: cache-first ──
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(CACHE_VERSION).then(async cache => {
        // Try exact match first, then strip query string for versioned URLs like ?v=4
        const cached =
          (await cache.match(event.request)) ||
          (await cache.match(url.pathname));

        if (cached) return cached;

        // Not in cache — try network and cache the result
        try {
          const response = await fetch(event.request);
          if (response && response.status === 200) {
            cache.put(event.request, response.clone());
          }
          return response;
        } catch {
          // Offline fallback
          if (event.request.mode === 'navigate') {
            const shell = await cache.match('./index.html');
            if (shell) return shell;
          }
          // For images return a transparent 1x1 pixel so the game doesn't break
          if (event.request.destination === 'image') {
            return new Response(
              atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'),
              { status: 200, headers: { 'Content-Type': 'image/gif' } }
            );
          }
          return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
        }
      })
    );
    return;
  }

  // ── All other origins: network with cache fallback ──
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).catch(() =>
        new Response('', { status: 503, statusText: 'Offline' })
      );
    })
  );
});

// ── Message: allow clients to trigger SW update ───────────────────────────
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
