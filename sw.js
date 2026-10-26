// Offline support for the guest guide. On a boat the signal comes and goes, so:
// app shell + data are precached, map tiles are cached as they are viewed,
// and the forecast falls back to the last saved answer.
const VERSION = 'v12';
const SHELL = `shell-${VERSION}`, TILES = 'tiles-v1', API = 'api-v1';
const PRECACHE = [
  './', 'index.html', 'vodic/', 'vodic/index.html',
  'css/fonts.css', 'css/site.css', 'css/guide.css',
  'js/config.js', 'js/site.js', 'js/site-i18n.js', 'shared/booking-rules.js', 'data/booking.json', 'js/guide.js', 'js/guide-i18n.js', 'js/weather.js', 'js/router.js', 'js/router-worker.js',
  'data/featured.json', 'data/mask-fine.png', 'data/mask-fine.json', 'data/mask-coarse.png', 'data/mask-coarse.json', 'data/availability.json',
  'fonts/archivo-latin.woff2', 'fonts/archivo-latin-ext.woff2', 'img/icon.svg', 'img/hero-land.png',
  'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js', 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css',
];
const MAX_TILES = 2500;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('shell-') && k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

async function trimTiles() {
  const c = await caches.open(TILES); const keys = await c.keys();
  for (let i = 0; i < keys.length - MAX_TILES; i++) await c.delete(keys[i]);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Booking API, admin and dev tools are always live: never cached, never answered from cache.
  if (url.origin === self.location.origin && /^\/(api|admin|tools)\//.test(url.pathname)) return;

  // Forecast: network first, last answer when offline.
  if (url.hostname.endsWith('open-meteo.com')) {
    e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(API).then((c) => c.put(req, copy)); return res; })
      .catch(() => caches.match(req).then((r) => r || Response.error())));
    return;
  }
  // Map style, tiles, fonts, sprites, seamarks: cache first, then network.
  if (url.hostname === 'tiles.openfreemap.org' || url.hostname === 'tiles.openseamap.org') {
    e.respondWith(caches.open(TILES).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) { c.put(req, res.clone()); if (Math.random() < 0.05) trimTiles(); }
      return res;
    }));
    return;
  }
  // Pages and data (availability, places): network first so they are never a visit behind; cache when offline.
  if (url.origin === self.location.origin && (req.mode === 'navigate' || url.pathname.endsWith('.json'))) {
    e.respondWith(fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(req, copy)); } return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || Response.error())));
    return;
  }
  // Own files and pinned libraries: stale-while-revalidate.
  if (url.origin === self.location.origin || url.hostname === 'unpkg.com') {
    e.respondWith(caches.open(SHELL).then(async (c) => {
      const hit = await c.match(req, { ignoreSearch: url.origin === self.location.origin && req.mode === 'navigate' });
      const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit || Response.error());
      return hit || net;
    }));
  }
});
