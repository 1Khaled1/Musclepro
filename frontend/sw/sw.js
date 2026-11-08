/* MusclePro service worker.
 * Built by vite.config.ts: the version and the precache list are filled in
 * from the real bundle, so a new deploy always ships a new worker.
 *
 *  - App shell (HTML, JS, CSS, core fonts, icons): precached → opens offline.
 *  - Pages: network first, cached shell as fallback (the SPA routes itself).
 *  - Hashed assets, anatomy art, 3D model: cache first (immutable content).
 *  - Exercise / program catalog API: stale-while-revalidate → library works offline.
 *  - Everything else (auth, user data, writes): network only, never cached.
 */
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const SHELL = `mp-shell-${VERSION}`;
const RUNTIME = 'mp-runtime-v1';
const CATALOG = 'mp-catalog-v1';
const CATALOG_PATHS = ['/api/exercises', '/api/programs', '/api/meta'];
const PRECACHED = new Set(PRECACHE);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('mp-shell-') && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirstPage(request) {
  try {
    const response = await fetch(request);
    if (response.ok) (await caches.open(SHELL)).put('/', response.clone());
    return response;
  } catch {
    return (await caches.match('/')) || Response.error();
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) (await caches.open(cacheName)).put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CATALOG);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached || Response.error());
  return cached || network;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request));
  } else if (PRECACHED.has(url.pathname)) {
    // Logo, icons, manifest, theme script: the shell cache is rebuilt on
    // every deploy, so serving it first never goes stale.
    event.respondWith(cacheFirst(request, SHELL));
  } else if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/anatomy/') || url.pathname.startsWith('/models/')) {
    event.respondWith(cacheFirst(request, url.pathname.startsWith('/assets/') ? SHELL : RUNTIME));
  } else if (CATALOG_PATHS.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`))) {
    event.respondWith(staleWhileRevalidate(request));
  }
  // Anything else (auth, profile, workouts, admin) goes straight to the network.
});
